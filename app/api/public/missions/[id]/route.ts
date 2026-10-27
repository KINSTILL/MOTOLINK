import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// In-memory rate limiter : 60 requêtes / minute par IP
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 60) {
    return false;
  }
  entry.count += 1;
  return true;
}

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "127.0.0.1";
}

/**
 * Nettoie une adresse pour ne pas exposer de détails ultra-sensibles
 * (retire numéros de porte, digicodes, étages s'ils sont explicitement précisés)
 */
function sanitizePublicAddress(fullAddress: string): string {
  return fullAddress
    .replace(/(porte|étage|apt|appartement|code|digicode)\s*[:#]?\s*\w+/gi, "")
    .trim();
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const ip = getClientIp(request);
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: "Limite de requêtes atteinte (max 60/min). Réessayez plus tard." },
        { status: 429 }
      );
    }

    const missionId = params.id?.trim();
    if (!missionId) {
      return NextResponse.json(
        { error: "Identifiant de mission requis." },
        { status: 400 }
      );
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
            // Sécurité : lat et lng délibérément exclus pour protéger la position précise
          },
        },
      },
    });

    if (!mission) {
      return NextResponse.json(
        { error: "Mission introuvable." },
        { status: 404 }
      );
    }

    // Calcul de la note moyenne du vendeur
    const vendorRatingAgg = await prisma.rating.aggregate({
      where: { toUserId: mission.vendor.id },
      _avg: { score: true },
      _count: { score: true },
    });

    // Calcul de la note moyenne du livreur et badges KYC
    let driverData: {
      name: string;
      phone: string;
      rating: number | null;
      ratingCount: number;
      kycBadges: {
        idCardVerified: boolean;
        syndicateVerified: boolean;
        syndicateName: string | null;
        enrollmentVerified: boolean;
      };
    } | null = null;

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

    // Sécurité stricte : aucune donnée sensible exposée
    return NextResponse.json({
      id: mission.id,
      publicToken: mission.publicToken,
      status: mission.status,
      type: mission.type,
      gasCertified: mission.gasCertified,
      description: mission.description,
      price: Number(mission.price),
      articlePhotoUrls: mission.articlePhotoUrls,
      address: sanitizePublicAddress(mission.address),
      buyerPresenceConfirmedAt: mission.buyerPresenceConfirmedAt,
      pickupPhotoUrl:
        mission.checkpoints.find((c) => c.type === "PICKED_UP")?.photoUrl ||
        null,
      createdAt: mission.createdAt,
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
      checkpoints: mission.checkpoints,
    });
  } catch (error) {
    console.error("[GET /api/public/missions/[id]] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des détails de suivi." },
      { status: 500 }
    );
  }
}

