import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckpointType, MissionStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { formatDoualaDateTime, formatFCFA } from "@/lib/utils";
import {
  getMissionTypeBadge,
  getMissionTypeFullLabel,
} from "@/lib/validations/mission";
import MissionDetailActions from "@/components/MissionDetailActions";
import MissionJevSection from "@/components/MissionJevSection";
import MissionCheckpointPanel from "@/components/MissionCheckpointPanel";
import MissionChat from "@/components/MissionChat";
import RateMissionButton from "@/components/RateMissionButton";
import PresenceStatusBanner from "@/components/PresenceStatusBanner";
import ResendDeliveryCodeButton from "@/components/ResendDeliveryCodeButton";
import { KycBadges, KycCguNotice } from "@/components/KycBadges";
import {
  ArrowLeft,
  Bike,
  Calendar,
  ExternalLink,
  FileText,
  Flame,
  Image as ImageIcon,
  MapPin,
  Package,
  Phone,
  User as UserIcon,
} from "lucide-react";

const STATUS_CONFIG: Record<
  MissionStatus,
  { label: string; badgeClass: string }
> = {
  DRAFT: {
    label: "Brouillon en attente",
    badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  },
  CREATED: {
    label: "Créée • En attente de livreur",
    badgeClass: "bg-primary/15 text-primary border-primary/30",
  },
  ACCEPTED: {
    label: "Acceptée par un livreur",
    badgeClass: "bg-secondary/15 text-secondary border-secondary/30",
  },
  IN_PROGRESS: {
    label: "En cours de livraison",
    badgeClass: "bg-warning/15 text-warning border-warning/30",
  },
  DELIVERED: {
    label: "Livrée avec preuve",
    badgeClass: "bg-success/15 text-success border-success/30",
  },
  CANCELLED: {
    label: "Annulée",
    badgeClass: "bg-slate-800 text-slate-400 border-slate-700",
  },
  DISPUTE: {
    label: "En litige",
    badgeClass: "bg-danger/15 text-danger border-danger/30",
  },
};

const CHECKPOINT_LABELS: Record<CheckpointType, string> = {
  PICKED_UP: "Colis récupéré par le livreur",
  IN_TRANSIT: "En transit vers la destination",
  NEARBY: "Livreur à proximité du client",
  BUYER_CONFIRMED_PRESENCE: "Présence confirmée par l'acheteur",
  DELIVERED: "Colis remis au client",
  CUSTOM: "Point de contrôle",
};

export default async function MissionDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const mission = await prisma.mission.findUnique({
    where: { id: params.id },
    include: {
      vendor: {
        select: { id: true, name: true, shopName: true },
      },
      ratings: {
        select: { fromUserId: true },
      },
      driver: {
        select: {
          id: true,
          name: true,
          phone: true,
          verified: true,
          kycStatus: true,
          kycDocuments: {
            where: { status: "VERIFIED" },
            select: {
              type: true,
              status: true,
              syndicateName: true,
            },
          },
        },
      },
      checkpoints: {
        orderBy: { createdAt: "asc" },
      },
      proof: true,
      directProposals: {
        orderBy: { createdAt: "desc" },
        include: {
          driver: {
            select: {
              id: true,
              name: true,
              phone: true,
            },
          },
        },
      },
      jevDecisions: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      messages: {
        orderBy: { createdAt: "asc" },
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              shopName: true,
              role: true,
            },
          },
        },
      },
    },
  });

  if (!mission) {
    notFound();
  }

  const statusInfo = STATUS_CONFIG[mission.status];

  const driverIdCardVerified = Boolean(
    mission.driver &&
      (mission.driver.kycStatus === "VERIFIED" ||
        mission.driver.kycDocuments.some((d) => d.type === "ID_CARD"))
  );
  const driverSyndicateDoc = mission.driver?.kycDocuments.find(
    (d) => d.type === "SYNDICATE_CARD"
  );
  const driverEnrollmentVerified = Boolean(
    mission.driver?.kycDocuments.some((d) => d.type === "ENROLLMENT_CERT")
  );

  // Notation mutuelle : le vendeur note le livreur, le livreur note le vendeur
  const isMissionVendor = mission.vendorId === session.userId;
  const isMissionDriver = mission.driverId === session.userId;
  const canRate =
    mission.status === "DELIVERED" &&
    Boolean(mission.driverId) &&
    (isMissionVendor || isMissionDriver);
  const alreadyRated =
    (isMissionVendor && mission.vendorRatedDriver) ||
    (isMissionDriver && mission.driverRatedVendor) ||
    mission.ratings.some((r) => r.fromUserId === session.userId);
  const ratingTargetName = isMissionVendor
    ? mission.driver?.name || "le livreur"
    : mission.vendor.shopName || mission.vendor.name || "le vendeur";

  // Confirmation de commande (visible uniquement par le vendeur de la mission).
  // Les missions issues de brouillons n'ont ni token ni appel enregistré : on n'affiche rien.
  const showOrderConfirmation =
    isMissionVendor &&
    Boolean(
      mission.buyerConfirmToken ||
        mission.callInitiatedAt ||
        mission.buyerConfirmedAt
    );
  const formatDoualaTime = (date: Date) =>
    date.toLocaleTimeString("fr-FR", {
      timeZone: "Africa/Douala",
      hour: "2-digit",
      minute: "2-digit",
    });
  const callMethodLabel =
    mission.callMethod === "whatsapp" ? "WhatsApp" : "téléphone";

  const driverCallMethodLabel = (method: string | null) =>
    method === "whatsapp" ? "WhatsApp" : "téléphone";
  const showDriverCalls =
    isMissionVendor &&
    Boolean(
      mission.driverCallBeforeDepartureAt ||
        mission.driverCallAtArrivalAt ||
        mission.buyerUnreachableAt
    );

  return (
    <div className="space-y-6">
      {/* Retour & En-tête */}
      <div className="flex items-center justify-between">
        <Link
          href={`/dashboard/${session.role.toLowerCase()}`}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-sm font-medium text-slate-300 transition active:scale-95"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Retour</span>
        </Link>

        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusInfo.badgeClass}`}
        >
          {statusInfo.label}
        </span>
      </div>

      {/* Bandeau d'état : confirmation de présence de l'acheteur */}
      <PresenceStatusBanner
        missionId={mission.id}
        buyerPresenceConfirmedAt={
          mission.buyerPresenceConfirmedAt
            ? mission.buyerPresenceConfirmedAt.toISOString()
            : null
        }
        hasNearbyCheckpoint={mission.checkpoints.some(
          (cp) => cp.type === "NEARBY"
        )}
        isDriver={session.role === "DRIVER"}
      />

      {/* Confirmation de commande : appel initié + confirmation acheteur */}
      {showOrderConfirmation && (
        <section
          data-testid="order-confirmation-status"
          className="space-y-1.5 rounded-2xl border border-slate-800 bg-slate-900 p-4 text-sm"
        >
          {mission.callInitiatedAt && (
            <p className="font-medium text-slate-200">
              📞 Appel initié à {formatDoualaTime(mission.callInitiatedAt)} via{" "}
              {callMethodLabel}
            </p>
          )}
          {mission.buyerConfirmedAt ? (
            <p className="font-semibold text-success">
              ✅ Client a confirmé à {formatDoualaTime(mission.buyerConfirmedAt)}
            </p>
          ) : (
            <p className="font-medium text-warning">
              ⏳ En attente de confirmation du client
            </p>
          )}
        </section>
      )}

      {/* Appels du livreur (avant départ / à l'arrivée) + client absent — vendeur */}
      {showDriverCalls && (
        <section
          data-testid="driver-calls-status"
          className="space-y-1.5 rounded-2xl border border-slate-800 bg-slate-900 p-4 text-sm"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            📞 Appels du livreur au client
          </p>
          {mission.driverCallBeforeDepartureAt ? (
            <p className="font-medium text-slate-200">
              Avant départ :{" "}
              {formatDoualaTime(mission.driverCallBeforeDepartureAt)} via{" "}
              {driverCallMethodLabel(
                mission.driverCallBeforeDepartureMethod
              )}
            </p>
          ) : (
            <p className="text-xs text-slate-500">
              Avant départ : aucun appel enregistré
            </p>
          )}
          {mission.driverCallAtArrivalAt ? (
            <p className="font-medium text-slate-200">
              À l&apos;arrivée :{" "}
              {formatDoualaTime(mission.driverCallAtArrivalAt)} via{" "}
              {driverCallMethodLabel(mission.driverCallAtArrivalMethod)}
            </p>
          ) : (
            <p className="text-xs text-slate-500">
              À l&apos;arrivée : aucun appel enregistré
            </p>
          )}
          {mission.buyerUnreachableAt && (
            <div className="mt-1 space-y-1 rounded-xl border border-danger/40 bg-danger/10 p-2.5 text-danger">
              <p className="text-xs font-bold">
                ⚠️ Client injoignable à{" "}
                {formatDoualaTime(mission.buyerUnreachableAt)}
              </p>
              {mission.buyerUnreachableNote && (
                <p className="text-xs text-slate-300">
                  « {mission.buyerUnreachableNote} »
                </p>
              )}
              {mission.buyerUnreachablePhoto && (
                <a
                  href={mission.buyerUnreachablePhoto}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-xs font-semibold text-primary underline"
                >
                  Voir la photo du client absent
                </a>
              )}
            </div>
          )}
        </section>
      )}

      {/* Code de remise (visible par le vendeur propriétaire) */}
      {isMissionVendor && (
        <section
          data-testid="delivery-code-status"
          className="space-y-2 rounded-2xl border border-slate-800 bg-slate-900 p-4 text-sm"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            🔐 Code de remise
          </p>
          {mission.deliveryCodeVerifiedAt ? (
            <p className="font-semibold text-success">
              ✅ Code validé à{" "}
              {formatDoualaTime(mission.deliveryCodeVerifiedAt)}
            </p>
          ) : (
            <p className="font-medium text-warning">
              ⏳ En attente de validation du code
            </p>
          )}
          {mission.deliveryCodeSentAt && (
            <p className="text-xs text-slate-400">
              Envoyé au client à {formatDoualaTime(mission.deliveryCodeSentAt)}
            </p>
          )}
          {mission.deliveryCodeSentAt && mission.deliveryCodeAttempts < 5 && (
            <ResendDeliveryCodeButton
              missionId={mission.id}
              remainingResends={Math.max(0, 5 - mission.deliveryCodeAttempts)}
            />
          )}
        </section>
      )}

      {/* Contrat PDF de livraison (N7) — vendeur ou livreur assigné */}
      {mission.contractPdfUrl && (isMissionVendor || isMissionDriver) && (
        <a
          href={`/api/missions/${mission.id}/contract`}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="contract-pdf-link"
          className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900 p-4 text-sm transition active:scale-[0.99]"
        >
          <span className="flex items-center gap-2 font-semibold text-slate-100">
            <FileText className="h-4 w-4 text-primary" />
            📄 Contrat de livraison (PDF)
          </span>
          <span className="text-sm text-slate-400">Télécharger</span>
        </a>
      )}

      {/* Galerie Photos de l'article en grand */}
      {mission.articlePhotoUrls.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold text-slate-50">
              Photos de l&apos;article ({mission.articlePhotoUrls.length})
            </h2>
          </div>

          <div
            className={`grid gap-3 ${
              mission.articlePhotoUrls.length === 1
                ? "grid-cols-1"
                : "grid-cols-2"
            }`}
          >
            {mission.articlePhotoUrls.map((url, idx) => (
              <a
                key={idx}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="block aspect-square w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-900"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`Article photo ${idx + 1}`}
                  className="h-full w-full object-cover"
                />
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Carte Informations de la mission */}
      <section className="rounded-2xl bg-slate-900 p-4 border border-slate-800 space-y-4">
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Package className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-lg border border-primary/30 bg-primary/15 px-2.5 py-0.5 text-xs font-bold text-primary">
                  {getMissionTypeBadge(mission.type)}
                </span>
                <h1 className="text-lg font-bold text-slate-50">
                  {mission.description || "Colis MotoLink"}
                </h1>
              </div>
              <p className="text-xs text-slate-400">
                {getMissionTypeFullLabel(mission.type)} • Créée le{" "}
                {formatDoualaDateTime(mission.createdAt)}
              </p>
            </div>
          </div>

          <span className="text-lg font-extrabold text-secondary whitespace-nowrap">
            {formatFCFA(Number(mission.price))}
          </span>
        </div>

        {/* Mention certification gaz si type = GAS */}
        {mission.type === "GAS" && mission.gasCertified && (
          <div className="flex items-center gap-2 rounded-xl border border-secondary/40 bg-secondary/10 p-3 text-sm font-semibold text-secondary">
            <Flame className="h-4 w-4 shrink-0" />
            <span>Certifiée sécurisée par le vendeur</span>
          </div>
        )}

        {/* Livraison programmée à l'avance */}
        {mission.scheduledAt && (
          <div className="flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/10 p-3 text-sm font-semibold text-primary">
            <Calendar className="h-4 w-4 shrink-0" />
            <span>Livraison programmée pour le {formatDoualaDateTime(mission.scheduledAt)}</span>
          </div>
        )}

        {/* Classification indicative Jev (TypeSafe AI) + Sélecteur manuel */}
        <MissionJevSection
          missionId={mission.id}
          isVendorOwner={mission.vendorId === session.userId}
          initialCategory={mission.category}
          initialCategorySource={mission.categorySource}
          initialDecisionStatus={mission.jevDecisions[0]?.status || null}
          jevEnabled={
            (process.env.JEV_ENABLED ?? "true").trim().toLowerCase() !== "false"
          }
        />

        {/* Description si présente */}
        {mission.description && (
          <div className="rounded-xl bg-slate-950/60 p-3 text-sm text-slate-300 border border-slate-800/80">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
              Précisions pour le livreur
            </p>
            <p>{mission.description}</p>
          </div>
        )}

        <div className="space-y-3 text-base">
          <div className="flex items-start gap-3">
            <UserIcon className="mt-1 h-5 w-5 shrink-0 text-slate-400" />
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-400">
                Destinataire
              </p>
              <p className="font-semibold text-slate-50">
                {mission.buyerName || "Client"}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Phone className="mt-1 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-400">
                Téléphone client
              </p>
              <p className="font-semibold text-slate-50">{mission.buyerPhone}</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <MapPin className="mt-1 h-5 w-5 shrink-0 text-secondary" />
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-400">
                Adresse de livraison
              </p>
              <p className="font-medium text-slate-50">{mission.address}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Statut notification + Boutons Copier le lien de suivi & Partager sur WhatsApp */}
      <Suspense fallback={null}>
        <MissionDetailActions
          missionId={mission.id}
          publicToken={mission.publicToken}
          description={mission.description}
          buyerPhone={mission.buyerPhone}
          buyerName={mission.buyerName}
          notificationSent={mission.notificationSent}
          notificationChannel={mission.notificationChannel}
          notifChannelUsed={mission.notifChannelUsed}
          notifStatus={mission.notifStatus}
          notifSentAt={
            mission.notifSentAt ? mission.notifSentAt.toISOString() : null
          }
          notifResendCount={mission.notifResendCount}
          latestProposal={
            mission.directProposals[0]
              ? {
                  id: mission.directProposals[0].id,
                  status: mission.directProposals[0].status,
                  driverName:
                    mission.directProposals[0].driver.name ||
                    mission.directProposals[0].driver.phone,
                }
              : null
          }
        />
      </Suspense>

      {/* Section Livreur assigné + Badges KYC cumulés */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-50">
          Livreur assigné
        </h2>
        <div className="rounded-2xl bg-slate-900 p-4 border border-slate-800 space-y-3">
          {mission.driver ? (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary/15 text-secondary">
                    <Bike className="h-6 w-6" />
                  </div>
                  <div>
                    <Link
                      href={`/drivers/${mission.driver.id}`}
                      className="inline-flex items-center gap-1.5 text-base font-bold text-slate-50 hover:text-primary"
                    >
                      <span>{mission.driver.name || "Livreur MotoLink"}</span>
                      <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                    </Link>
                    <p className="text-sm text-slate-400">
                      {mission.driver.phone}
                    </p>
                  </div>
                </div>
                <a
                  href={`tel:${mission.driver.phone}`}
                  className="rounded-xl bg-primary/15 px-3.5 py-2 text-sm font-semibold text-primary"
                >
                  Appeler
                </a>
              </div>

              <KycBadges
                idCardVerified={driverIdCardVerified}
                syndicateVerified={Boolean(driverSyndicateDoc)}
                syndicateName={driverSyndicateDoc?.syndicateName}
                enrollmentVerified={driverEnrollmentVerified}
                showEmpty
              />
            </>
          ) : (
            <div className="flex items-center gap-3 text-slate-400">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800">
                <Bike className="h-5 w-5" />
              </div>
              <p className="text-base">
                Aucun livreur assigné pour le moment
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Notation mutuelle (mission livrée uniquement) */}
      {canRate && (
        <RateMissionButton
          missionId={mission.id}
          targetName={ratingTargetName}
          alreadyRated={alreadyRated}
        />
      )}

      {/* Carte Preuve de livraison scellée si disponible */}
      {mission.proof && (
        <section className="rounded-2xl border border-success/40 bg-slate-900 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-base font-bold text-success">
              ✅ Preuve de livraison scellée
            </span>
            <Link
              href={`/missions/${mission.id}/proof/success`}
              className="text-xs font-semibold text-primary underline"
            >
              Voir le certificat PDF
            </Link>
          </div>
          <p className="break-all rounded-xl border border-slate-800 bg-slate-950 p-2.5 font-mono text-[11px] text-slate-300">
            SHA-256 : {mission.proof.proofHash}
          </p>
        </section>
      )}

      {/* 4 Boutons de jalons (livreur) + Section Historique (CheckpointTimeline) */}
      <MissionCheckpointPanel
        missionId={mission.id}
        initialStatus={mission.status}
        missionCreatedAt={mission.createdAt.toISOString()}
        isAssignedDriver={
          session.role === "DRIVER" && mission.driverId === session.userId
        }
        buyerContact={
          session.role === "DRIVER" && mission.driverId === session.userId
            ? { phone: mission.buyerPhone, name: mission.buyerName }
            : null
        }
        initialCheckpoints={mission.checkpoints.map((cp) => ({
          id: cp.id,
          type: cp.type,
          lat: cp.lat,
          lng: cp.lng,
          note: cp.note,
          createdAt: cp.createdAt.toISOString(),
        }))}
      />

      {/* Messagerie de la mission avec file d'attente hors ligne */}
      <MissionChat
        missionId={mission.id}
        currentUserId={session.userId}
        initialMessages={mission.messages.map((m) => ({
          id: m.id,
          missionId: m.missionId,
          senderId: m.senderId,
          content: m.content,
          createdAt: m.createdAt.toISOString(),
          sender: m.sender,
        }))}
      />

      {mission.driver && <KycCguNotice />}
    </div>
  );
}
