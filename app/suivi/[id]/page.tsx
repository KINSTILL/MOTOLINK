import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import PublicTrackingClient, {
  PublicTrackingMission,
} from "@/components/PublicTrackingClient";
import BuyerConfirmButton from "@/components/BuyerConfirmButton";
import { verifyBuyerConfirmToken } from "@/lib/order-confirmation";

function sanitizePublicAddress(fullAddress: string): string {
  return fullAddress
    .replace(/(porte|étage|apt|appartement|code|digicode)\s*[:#]?\s*\w+/gi, "")
    .trim();
}

export default async function PublicTrackingPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const missionId = params.id?.trim();
  if (!missionId) {
    notFound();
  }

  const mission = await prisma.mission.findFirst({
    where: {
      OR: [{ id: missionId }, { publicToken: missionId }],
    },
    include: {
      vendor: {
        select: {
          id: true,
          shopName: true,
          name: true,
          brandingLogoUrl: true,
          brandingColorHex: true,
          catalogUrl: true,
        },
      },
      driver: {
        select: {
          id: true,
          name: true,
          phone: true,
          kycStatus: true,
          kycDocuments: {
            where: { status: "VERIFIED" },
            select: {
              type: true,
              syndicateName: true,
            },
          },
        },
      },
      checkpoints: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          type: true,
          note: true,
          photoUrl: true,
          createdAt: true,
        },
      },
    },
  });

  if (!mission) {
    notFound();
  }

  // Calcul note vendeur
  const vendorRatingAgg = await prisma.rating.aggregate({
    where: { toUserId: mission.vendor.id },
    _avg: { score: true },
    _count: { score: true },
  });

  // Calcul note livreur et badges KYC
  let driverData: PublicTrackingMission["driver"] = null;
  if (mission.driver) {
    const driverRatingAgg = await prisma.rating.aggregate({
      where: { toUserId: mission.driver.id },
      _avg: { score: true },
      _count: { score: true },
    });

    const docs = mission.driver.kycDocuments;
    const syndicateDoc = docs.find((d) => d.type === "SYNDICATE_CARD");

    driverData = {
      name: mission.driver.name || "Livreur MotoLink",
      phone: mission.driver.phone,
      rating: driverRatingAgg._avg.score
        ? Number(driverRatingAgg._avg.score.toFixed(1))
        : null,
      ratingCount: driverRatingAgg._count.score,
      kycBadges: {
        idCardVerified: Boolean(
          mission.driver.kycStatus === "VERIFIED" ||
            docs.some((d) => d.type === "ID_CARD")
        ),
        syndicateVerified: Boolean(syndicateDoc),
        syndicateName: syndicateDoc?.syndicateName || null,
        enrollmentVerified: docs.some((d) => d.type === "ENROLLMENT_CERT"),
      },
    };
  }

  const payload: PublicTrackingMission = {
    id: mission.id,
    publicToken: mission.publicToken,
    status: mission.status as PublicTrackingMission["status"],
    type: mission.type as PublicTrackingMission["type"],
    gasCertified: mission.gasCertified,
    description: mission.description,
    price: Number(mission.price),
    articlePhotoUrls: mission.articlePhotoUrls,
    address: sanitizePublicAddress(mission.address),
    buyerPresenceConfirmedAt: mission.buyerPresenceConfirmedAt
      ? mission.buyerPresenceConfirmedAt.toISOString()
      : null,
    pickupPhotoUrl:
      mission.checkpoints.find((c) => c.type === "PICKED_UP")?.photoUrl || null,
    createdAt: mission.createdAt.toISOString(),
    vendor: {
      shopName:
        mission.vendor.shopName ||
        mission.vendor.name ||
        "Boutique MotoLink",
      brandingLogoUrl: mission.vendor.brandingLogoUrl,
      brandingColorHex: mission.vendor.brandingColorHex || "#2563eb",
      catalogUrl: mission.vendor.catalogUrl,
      rating: vendorRatingAgg._avg.score
        ? Number(vendorRatingAgg._avg.score.toFixed(1))
        : null,
      ratingCount: vendorRatingAgg._count.score,
    },
    driver: driverData,
    checkpoints: mission.checkpoints.map((cp) => ({
      id: cp.id,
      type: cp.type as PublicTrackingMission["checkpoints"][number]["type"],
      note: cp.note,
      createdAt: cp.createdAt.toISOString(),
    })),
  };

  // Bouton « Confirmer ma commande » : uniquement si le lien porte un token valide (?ct=...)
  const confirmToken =
    typeof searchParams?.ct === "string" ? searchParams.ct.trim() : "";
  const showBuyerConfirm =
    confirmToken.length > 0 &&
    mission.status !== "CANCELLED" &&
    verifyBuyerConfirmToken(mission.buyerConfirmToken, confirmToken);

  return (
    <>
      {showBuyerConfirm && (
        <div className="bg-slate-950 px-4 pt-6">
          <div className="mx-auto max-w-md space-y-2 rounded-2xl border border-primary/30 bg-primary/5 p-4">
            <p className="text-sm font-semibold text-slate-50">
              Confirmez-vous votre adresse et votre disponibilité ?
            </p>
            <BuyerConfirmButton
              missionId={mission.id}
              token={confirmToken}
              alreadyConfirmed={Boolean(mission.buyerConfirmedAt)}
            />
          </div>
        </div>
      )}
      <PublicTrackingClient mission={payload} />
    </>
  );
}
