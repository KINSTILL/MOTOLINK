import Link from "next/link";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getActiveSubscription } from "@/lib/notchpay";
import { formatDoualaDateTime } from "@/lib/utils";
import { expireStaleDirectProposals } from "@/lib/proposals";
import DriverStatusCard from "@/components/DriverStatusCard";
import DriverMissionsTabs from "@/components/DriverMissionsTabs";
import SponsorBanner from "@/components/SponsorBanner";
import ReferralCard from "@/components/ReferralCard";
import DirectoryContactRequests from "@/components/DirectoryContactRequests";
import DriverProfileBadges from "@/components/DriverProfileBadges";
import { KycBadges } from "@/components/KycBadges";
import { ensureReferralCode } from "@/lib/referral";
import {
  ChevronRight,
  CreditCard,
  Lock,
  ShieldCheck,
} from "lucide-react";

export default async function DriverDashboardPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  if (session.role !== "DRIVER") {
    redirect(`/dashboard/${session.role.toLowerCase()}`);
  }

  await expireStaleDirectProposals();

  const [driver, activeSub, activeMission] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.userId },
      include: {
        kycDocuments: {
          orderBy: { createdAt: "desc" },
        },
      },
    }),
    getActiveSubscription(session.userId),
    prisma.mission.findFirst({
      where: {
        driverId: session.userId,
        status: { in: ["ACCEPTED", "IN_PROGRESS"] },
      },
      select: { id: true },
    }),
  ]);

  if (!driver) {
    redirect("/login");
  }

  const [sponsorVendor, activeReferral] = driver.sponsorVendorId
    ? await Promise.all([
        prisma.user.findUnique({
          where: { id: driver.sponsorVendorId },
          select: { shopName: true, name: true, phone: true },
        }),
        prisma.referral.findFirst({
          where: {
            refereeId: session.userId,
            referrerId: driver.sponsorVendorId,
            status: "ACTIVE",
          },
          select: { priorityMissionsRemaining: true },
        }),
      ])
    : [null, null];

  const [driverReferralCode, driverReferralsMade] = await Promise.all([
    ensureReferralCode(session.userId),
    prisma.referral.findMany({
      where: { referrerId: session.userId, type: "DRIVER_TO_DRIVER" },
      include: {
        referee: {
          select: {
            driverMissions: {
              where: { status: "DELIVERED" },
              select: { id: true },
            },
          },
        },
      },
    }),
  ]);

  let activeReferralsCount = 0;
  let completedReferralsCount = 0;
  for (const r of driverReferralsMade) {
    const dCount = r.referee.driverMissions.length;
    if (r.status === "COMPLETED" || dCount >= 20) {
      completedReferralsCount++;
    } else if (dCount >= 5) {
      activeReferralsCount++;
    }
  }

  let nextDriverMilestone: { count: number; badge: string; remainingNeeded: number } | null = null;
  if (completedReferralsCount < 1) {
    nextDriverMilestone = { count: 1, badge: "sponsor", remainingNeeded: 1 - completedReferralsCount };
  } else if (completedReferralsCount < 3) {
    nextDriverMilestone = { count: 3, badge: "sponsor_confirmed", remainingNeeded: 3 - completedReferralsCount };
  } else if (completedReferralsCount < 5) {
    nextDriverMilestone = { count: 5, badge: "sponsor_gold", remainingNeeded: 5 - completedReferralsCount };
  } else if (completedReferralsCount < 10) {
    nextDriverMilestone = { count: 10, badge: "sponsor_platinum", remainingNeeded: 10 - completedReferralsCount };
  }

  const [availableMissions, directProposals, scheduledMissions] = activeSub
    ? await Promise.all([
        prisma.mission.findMany({
          where: {
            status: "CREATED",
            driverId: null,
            directProposals: {
              none: {
                status: "PENDING",
              },
            },
          },
          include: {
            vendor: {
              select: {
                shopName: true,
                name: true,
                phone: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 15,
        }),
        prisma.directProposal.findMany({
          where: {
            driverId: session.userId,
            status: "PENDING",
            mission: {
              status: "CREATED",
              driverId: null,
            },
          },
          include: {
            mission: {
              include: {
                vendor: {
                  select: {
                    shopName: true,
                    name: true,
                    phone: true,
                  },
                },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        }),
        prisma.mission.findMany({
          where: {
            scheduledAt: { not: null },
            scheduledStatus: { not: "cancelled" },
            status: { notIn: ["CANCELLED"] },
            OR: [
              { driverId: session.userId },
              { driverId: null, status: "CREATED" },
              { directProposals: { some: { driverId: session.userId, status: "PENDING" } } },
            ],
          },
          include: {
            vendor: {
              select: {
                id: true,
                shopName: true,
                name: true,
                phone: true,
              },
            },
            driver: {
              select: {
                id: true,
                name: true,
                phone: true,
              },
            },
          },
          orderBy: { scheduledAt: "asc" },
        }),
      ])
    : [[], [], []];

  const driverName = driver.name || driver.phone;

  const idCardDoc = driver.kycDocuments.find((d) => d.type === "ID_CARD");
  const syndicateDoc = driver.kycDocuments.find(
    (d) => d.type === "SYNDICATE_CARD"
  );
  const enrollmentDoc = driver.kycDocuments.find(
    (d) => d.type === "ENROLLMENT_CERT"
  );

  const idCardVerified =
    idCardDoc?.status === "VERIFIED" || driver.kycStatus === "VERIFIED";
  const syndicateVerified = syndicateDoc?.status === "VERIFIED";
  const enrollmentVerified = enrollmentDoc?.status === "VERIFIED";
  const isKycVerified = driver.kycStatus === "VERIFIED";

  const statusBadgeText = (status?: string) => {
    if (status === "VERIFIED") return "Vérifié";
    if (status === "PENDING") return "En attente";
    if (status === "REJECTED") return "Rejeté";
    return "À compléter";
  };

  const subStatusLabel = activeSub
    ? "Actif"
    : driver.subscriptionStatus === "EXPIRED"
    ? "Expiré"
    : "Aucun abonnement";

  const hasActiveMission =
    Boolean(activeMission) || driver.driverStatus === "ON_MISSION";
  let canChangeStatus = true;
  let statusReason: string | null = null;

  if (hasActiveMission) {
    canChangeStatus = false;
    statusReason =
      "Course en cours. Votre statut redeviendra disponible dès la livraison effectuée.";
  } else if (!isKycVerified) {
    canChangeStatus = false;
    statusReason =
      "Complétez votre vérification d'identité pour passer disponible.";
  } else if (!activeSub) {
    canChangeStatus = false;
    statusReason =
      "Abonnement hebdomadaire actif requis pour passer disponible.";
  }

  return (
    <div className="space-y-6">
      {/* Titre */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-50">
            Bonjour, {driverName}
          </h1>
          <p className="text-base text-slate-400">
            Activez votre statut pour recevoir des courses autour de vous.
          </p>
        </div>
        {driver.referrerBadge && (
          <DriverProfileBadges referrerBadge={driver.referrerBadge} />
        )}
      </div>

      {/* Bannière de parrainage si le livreur est parrainé */}
      {sponsorVendor && (
        <SponsorBanner
          sponsorName={sponsorVendor.shopName || sponsorVendor.name || sponsorVendor.phone || "Vendeur"}
          priorityRemaining={activeReferral?.priorityMissionsRemaining ?? 0}
        />
      )}

      {/* Carte Abonnement en haut avec statut et lien vers /subscription */}
      <Link
        href="/subscription"
        className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900 p-4 transition active:scale-[0.99]"
      >
        <div className="flex items-center gap-3">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
              activeSub
                ? "bg-success/15 text-success"
                : "bg-primary/15 text-primary"
            }`}
          >
            <CreditCard className="h-6 w-6" />
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-slate-50">
                Abonnement
              </span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  activeSub
                    ? "bg-success/15 text-success"
                    : driver.subscriptionStatus === "EXPIRED"
                    ? "bg-danger/15 text-danger"
                    : "bg-warning/15 text-warning"
                }`}
              >
                {subStatusLabel}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {activeSub
                ? `Valide jusqu'au ${formatDoualaDateTime(activeSub.endsAt)}`
                : "250 FCFA / semaine • Accès aux missions"}
            </p>
          </div>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
      </Link>

      {/* Carte Vérification de profil avec les 3 niveaux */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-50">
                Vérification de profil
              </h2>
              <p className="text-xs text-slate-400">
                3 niveaux de confiance cumulables
              </p>
            </div>
          </div>

          <Link
            href={idCardDoc ? "/kyc/status" : "/kyc/start"}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary"
          >
            <span>Gérer</span>
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        <KycBadges
          idCardVerified={idCardVerified}
          syndicateVerified={syndicateVerified}
          syndicateName={syndicateDoc?.syndicateName}
          enrollmentVerified={enrollmentVerified}
          showEmpty
        />

        <div className="space-y-2 border-t border-slate-800 pt-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-300">
              Niveau 1 : CNI + Selfie{" "}
              <span className="text-xs text-secondary">(Obligatoire)</span>
            </span>
            <span className="text-xs font-semibold text-slate-400">
              {statusBadgeText(
                idCardDoc?.status || (isKycVerified ? "VERIFIED" : undefined)
              )}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-300">Niveau 2 : Carte de syndicat</span>
            <span className="text-xs font-semibold text-slate-400">
              {statusBadgeText(syndicateDoc?.status)}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-300">
              Niveau 3 : Enrôlement CUD / Yaoundé
            </span>
            <span className="text-xs font-semibold text-slate-400">
              {statusBadgeText(enrollmentDoc?.status)}
            </span>
          </div>
        </div>

        <Link
          href={idCardDoc ? "/kyc/status" : "/kyc/start"}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-semibold text-white transition active:scale-[0.98]"
        >
          <span>
            {isKycVerified
              ? "Voir ou compléter mes badges KYC"
              : "Vérifier mon identité maintenant"}
          </span>
        </Link>
      </section>

      {/* Demandes de contact issues de l'annuaire */}
      <DirectoryContactRequests />

      {/* Carte Statut + Toggle Disponible */}
      <DriverStatusCard
        initialStatus={driver.driverStatus}
        initialCanChange={canChangeStatus}
        initialReason={statusReason}
      />

      {/* Carte Parrainage livreur -> livreur */}
      <ReferralCard
        code={driverReferralCode}
        totalReferrals={driverReferralsMade.length}
        activeReferrals={activeReferralsCount}
        completedReferrals={completedReferralsCount}
        currentBadge={driver.referrerBadge}
        nextMilestone={nextDriverMilestone}
      />

      {/* Section Missions disponibles & Propositions directes */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-50">
          Missions disponibles
        </h2>

        {!activeSub ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-warning/15 text-warning">
              <Lock className="h-6 w-6" />
            </div>
            <p className="text-base font-semibold text-slate-200">
              Abonnez-vous pour voir les missions
            </p>
            <p className="text-xs text-slate-400">
              Formule livreur dès 250 FCFA / semaine via Notch Pay.
            </p>
            <Link
              href="/subscription"
              className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-semibold text-white transition active:scale-[0.98]"
            >
              <CreditCard className="h-5 w-5" />
              <span>S&apos;abonner maintenant</span>
            </Link>
          </div>
        ) : (
          <DriverMissionsTabs
            isKycVerified={isKycVerified}
            openMarketMissions={availableMissions.map((m) => ({
              id: m.id,
              description: m.description,
              address: m.address,
              price: Number(m.price),
              type: m.type,
              gasCertified: m.gasCertified,
              category: m.category,
              createdAt: m.createdAt.toISOString(),
              vendorName: m.vendor.shopName || m.vendor.name || m.vendor.phone,
            }))}
            directProposals={directProposals.map((p) => ({
              id: p.id,
              mission: {
                id: p.mission.id,
                description: p.mission.description,
                address: p.mission.address,
                price: Number(p.mission.price),
                type: p.mission.type,
                gasCertified: p.mission.gasCertified,
                category: p.mission.category,
                createdAt: p.mission.createdAt.toISOString(),
                vendorName:
                  p.mission.vendor.shopName ||
                  p.mission.vendor.name ||
                  p.mission.vendor.phone,
              },
            }))}
            scheduledMissions={scheduledMissions.map((m) => ({
              id: m.id,
              vendorId: m.vendorId,
              driverId: m.driverId,
              buyerName: m.buyerName,
              buyerPhone: m.buyerPhone,
              address: m.address,
              articlePhotoUrls: m.articlePhotoUrls,
              description: m.description,
              price: Number(m.price),
              type: m.type,
              status: m.status,
              scheduledAt: m.scheduledAt ? m.scheduledAt.toISOString() : "",
              scheduledStatus: m.scheduledStatus,
              vendor: m.vendor,
              driver: m.driver,
            }))}
            currentUserId={session.userId}
          />
        )}
      </section>
    </div>
  );
}
