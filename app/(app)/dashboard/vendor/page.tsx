import Link from "next/link";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getActiveSubscription } from "@/lib/notchpay";
import { formatDoualaDateTime, formatFCFA } from "@/lib/utils";
import { getMissionTypeBadge } from "@/lib/validations/mission";
import { calculateReward } from "@/lib/referral";
import MissionCategoryBadge from "@/components/MissionCategoryBadge";
import VendorReferralCard from "@/components/VendorReferralCard";
import {
  Calendar,
  ChevronRight,
  CreditCard,
  Inbox,
  MapPin,
  PlusCircle,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  UserPlus,
  Users,
} from "lucide-react";

export default async function VendorDashboardPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  if (session.role !== "VENDOR") {
    redirect(`/dashboard/${session.role.toLowerCase()}`);
  }

  const [vendor, activeSub, favorites, reward, scheduledCount, draftsCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.userId },
      include: {
        vendorMissions: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    }),
    getActiveSubscription(session.userId),
    prisma.favoriteDriver.findMany({
      where: { buyerId: session.userId },
      include: {
        driver: {
          select: {
            id: true,
            name: true,
            phone: true,
            phoneVisibleToVendor: true,
            driverStatus: true,
            brandingLogoUrl: true,
            ratingsTo: {
              orderBy: { createdAt: "desc" },
              take: 50,
              select: { score: true },
            },
          },
        },
      },
    }),
    calculateReward(session.userId, "VENDOR_TO_DRIVER"),
    prisma.mission.count({
      where: {
        vendorId: session.userId,
        scheduledAt: { gte: new Date() },
        scheduledStatus: { not: "cancelled" },
      },
    }),
    prisma.mission.count({
      where: {
        vendorId: session.userId,
        status: "DRAFT",
      },
    }),
  ]);

  if (!vendor) {
    redirect("/login");
  }

  const shopName = vendor.shopName || vendor.name || vendor.phone;
  const subStatusLabel = activeSub
    ? "Actif"
    : vendor.subscriptionStatus === "EXPIRED"
    ? "Expiré"
    : "Aucun abonnement";

  const availableFleetDrivers = favorites
    .filter((f) => f.driver.driverStatus === "AVAILABLE")
    .map((f) => {
      const d = f.driver;
      const count = d.ratingsTo.length;
      const avg =
        count > 0
          ? Math.round(
              (d.ratingsTo.reduce((acc, r) => acc + r.score, 0) / count) * 10
            ) / 10
          : 5.0;
      return {
        id: f.id,
        driverId: d.id,
        name: d.name || "Livreur",
        phone: d.phoneVisibleToVendor !== false ? d.phone : "Numéro masqué",
        photoUrl: d.brandingLogoUrl,
        rating: avg,
        ratingCount: count,
      };
    })
    .slice(0, 3);

  return (
    <div className="space-y-6">
      {/* Titre */}
      <div>
        <h1 className="text-lg font-bold text-slate-50">
          Bonjour, {shopName}
        </h1>
        <p className="text-base text-slate-400">
          Gérez vos expéditions et preuves de livraison.
        </p>
      </div>

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
                    : vendor.subscriptionStatus === "EXPIRED"
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
                : "1 000 FCFA / semaine • Illimité (fair use 50/semaine)"}
            </p>
          </div>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
      </Link>

      {/* Carte "Brouillons en attente" si draftsCount > 0 */}
      {draftsCount > 0 && (
        <Link
          href="/missions/drafts"
          className="flex items-center justify-between rounded-2xl border border-purple-500/40 bg-purple-950/25 p-4 shadow-md transition active:scale-[0.99] hover:border-purple-500/60"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-purple-500/20 text-purple-400">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-slate-50">
                  Brouillons en attente
                </span>
                <span className="rounded-full bg-purple-500/30 px-2.5 py-0.5 text-xs font-bold text-purple-300">
                  {draftsCount} à finaliser
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Commandes reçues via lien personnel ou Smart Paste
              </p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-purple-400" />
        </Link>
      )}

      {/* Bouton principal Créer une mission */}
      <Link
        href={activeSub ? "/missions/new" : "/subscription"}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-semibold text-white shadow-lg shadow-primary/25 transition active:scale-[0.98]"
      >
        <PlusCircle className="h-5 w-5" />
        <span>
          {activeSub
            ? "Créer une mission"
            : "S'abonner pour créer une mission"}
        </span>
      </Link>

      {/* Lien vers le journal d'audit des preuves */}
      <Link
        href="/dashboard/vendor/audit"
        className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900 p-4 transition active:scale-[0.99]"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-50">
              Journal d&apos;audit des preuves
            </p>
            <p className="text-xs text-slate-400">
              Historique chaîné SHA-256 & vérification d&apos;intégrité
            </p>
          </div>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
      </Link>

      {/* Lien vers l'agenda des livraisons programmées */}
      <Link
        href="/dashboard/vendor/agenda"
        className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900 p-4 transition active:scale-[0.99]"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary/15 text-secondary">
            <Calendar className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-slate-50">
                Agenda des livraisons
              </p>
              {scheduledCount > 0 && (
                <span className="rounded-full bg-secondary/20 px-2 py-0.5 text-xs font-bold text-secondary">
                  {scheduledCount} à venir
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Missions programmées à l&apos;avance & calendrier
            </p>
          </div>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
      </Link>

      {/* Carte Parrainage vendeur -> livreur */}
      <VendorReferralCard
        activeCount={reward.activeCount}
        discountPercent={reward.discountPercent}
        nextTarget={reward.nextTarget}
        nextDiscount={reward.nextDiscount}
      />

      {/* Section Ma flotte */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-slate-50">Ma flotte</h2>
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs font-bold text-slate-300">
              {favorites.length}
            </span>
          </div>

          <Link
            href="/dashboard/vendor/fleet"
            className="flex items-center gap-1 text-xs font-semibold text-primary transition hover:underline"
          >
            <span>Voir tout</span>
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        {favorites.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-slate-400">
              <Users className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <p className="text-base font-semibold text-slate-200">
                Ajoutez votre premier livreur
              </p>
              <p className="text-xs text-slate-400">
                Constituez votre réseau de coursiers favoris pour des expéditions prioritaires.
              </p>
            </div>
            <Link
              href="/dashboard/vendor/fleet"
              className="mt-1 inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-primary px-4 text-xs font-semibold text-white transition active:scale-95"
            >
              <UserPlus className="h-4 w-4" />
              <span>Gérer ma flotte</span>
            </Link>
          </div>
        ) : availableFleetDrivers.length > 0 ? (
          <div className="space-y-2">
            {availableFleetDrivers.map((driver) => (
              <div
                key={driver.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-950/15 p-3"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="relative flex h-3 w-3 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500"></span>
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-50">
                      {driver.name}
                    </p>
                    <p className="text-xs text-slate-400">{driver.phone}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center gap-1 text-xs font-semibold text-secondary">
                    <Star className="h-3 w-3 fill-secondary text-secondary" />
                    <span>{driver.rating.toFixed(1)}</span>
                  </div>
                  <Link
                    href={`/missions/new?driverId=${driver.driverId}`}
                    className="flex min-h-[40px] items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white transition active:scale-95 hover:bg-primary-hover"
                  >
                    <Send className="h-3 w-3" />
                    <span>Proposer</span>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-center">
            <p className="text-xs text-slate-400">
              Aucun livreur disponible en ce moment ({favorites.length} dans votre flotte).
            </p>
            <Link
              href="/dashboard/vendor/fleet"
              className="mt-2 inline-block text-xs font-semibold text-primary underline"
            >
              Consulter les livreurs en mission ou hors ligne
            </Link>
          </div>
        )}
      </section>

      {/* Section Missions récentes */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-50">
          Missions récentes
        </h2>

        {vendor.vendorMissions.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-slate-400">
              <Inbox className="h-6 w-6" />
            </div>
            <p className="text-base text-slate-400">
              Aucune mission pour le moment
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {vendor.vendorMissions.map((mission) => (
              <Link
                key={mission.id}
                href={`/missions/${mission.id}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4 transition active:scale-[0.99]"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0 rounded-lg border border-primary/30 bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary">
                        {getMissionTypeBadge(mission.type)}
                      </span>
                      <MissionCategoryBadge category={mission.category} />
                      <p className="truncate text-base font-bold text-slate-50">
                        {mission.description ||
                          (mission.buyerName
                            ? `Colis pour ${mission.buyerName}`
                            : "Colis MotoLink")}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">
                      {mission.status}
                    </span>
                  </div>
                  <p className="flex items-center gap-1.5 truncate text-sm text-slate-400">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-secondary" />
                    <span className="truncate">{mission.address}</span>
                  </p>
                  <div className="flex items-center gap-3 pt-1 text-xs text-slate-400">
                    <span className="font-bold text-secondary">
                      {formatFCFA(Number(mission.price))}
                    </span>
                    <span>•</span>
                    <span>{formatDoualaDateTime(mission.createdAt)}</span>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-slate-500" />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
