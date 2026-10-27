import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { normalizePhone } from "@/lib/utils";

const MAX_FAVORITE_DRIVERS = 5;

function mapDriverSummary(driver: {
  id: string;
  name: string | null;
  phone: string;
  verified: boolean;
  kycStatus: string;
  brandingLogoUrl: string | null;
  kycDocuments: Array<{
    type: string;
    status: string;
    syndicateName: string | null;
  }>;
  ratingsTo: Array<{ score: number }>;
}) {
  const ratingsCount = driver.ratingsTo.length;
  const averageRating =
    ratingsCount > 0
      ? Number(
          (
            driver.ratingsTo.reduce((acc, r) => acc + r.score, 0) / ratingsCount
          ).toFixed(1)
        )
      : null;

  const idCardVerified =
    driver.kycStatus === "VERIFIED" ||
    driver.kycDocuments.some(
      (d) => d.type === "ID_CARD" && d.status === "VERIFIED"
    );
  const syndicateDoc = driver.kycDocuments.find(
    (d) => d.type === "SYNDICATE_CARD" && d.status === "VERIFIED"
  );
  const enrollmentVerified = driver.kycDocuments.some(
    (d) => d.type === "ENROLLMENT_CERT" && d.status === "VERIFIED"
  );

  return {
    id: driver.id,
    name: driver.name || "Livreur MotoLink",
    phone: driver.phone,
    photoUrl: driver.brandingLogoUrl,
    kycStatus: driver.kycStatus,
    verified: driver.verified,
    averageRating,
    ratingsCount,
    badges: {
      idCardVerified,
      syndicateVerified: Boolean(syndicateDoc),
      syndicateName: syndicateDoc?.syndicateName || null,
      enrollmentVerified,
    },
  };
}

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const searchQuery = searchParams.get("q")?.trim();

    const favorites = await prisma.favoriteDriver.findMany({
      where: { buyerId: session.userId },
      orderBy: { createdAt: "desc" },
      include: {
        driver: {
          select: {
            id: true,
            name: true,
            phone: true,
            verified: true,
            kycStatus: true,
            brandingLogoUrl: true,
            kycDocuments: {
              where: { status: "VERIFIED" },
              select: { type: true, status: true, syndicateName: true },
            },
            ratingsTo: {
              select: { score: true },
            },
          },
        },
      },
    });

    const formattedFavorites = favorites.map((fav) => ({
      id: fav.id,
      buyerId: fav.buyerId,
      driverId: fav.driverId,
      note: fav.note,
      createdAt: fav.createdAt,
      driver: mapDriverSummary(fav.driver),
    }));

    // Si une recherche ?q= est fournie, rechercher parmi les livreurs vérifiés
    let searchResults: Array<ReturnType<typeof mapDriverSummary>> = [];
    if (searchQuery && searchQuery.length >= 2) {
      const normalized = normalizePhone(searchQuery);
      const existingDriverIds = new Set(favorites.map((f) => f.driverId));

      const matchingDrivers = await prisma.user.findMany({
        where: {
          role: "DRIVER",
          kycStatus: "VERIFIED",
          id: { notIn: Array.from(existingDriverIds) },
          OR: [
            { phone: { contains: searchQuery.replace(/\s+/g, "") } },
            { phone: { contains: normalized } },
            { name: { contains: searchQuery, mode: "insensitive" } },
          ],
        },
        take: 8,
        select: {
          id: true,
          name: true,
          phone: true,
          verified: true,
          kycStatus: true,
          brandingLogoUrl: true,
          kycDocuments: {
            where: { status: "VERIFIED" },
            select: { type: true, status: true, syndicateName: true },
          },
          ratingsTo: {
            select: { score: true },
          },
        },
      });

      searchResults = matchingDrivers.map(mapDriverSummary);
    }

    return NextResponse.json({
      favorites: formattedFavorites,
      maxLimit: MAX_FAVORITE_DRIVERS,
      searchResults,
    });
  } catch (error) {
    console.error("[GET /api/favorite-drivers] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des livreurs préférés." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const body = await request.json();
    const rawPhone: string | undefined = body.driverPhone;
    const rawDriverId: string | undefined = body.driverId;
    const rawNote: string | undefined = body.note;

    const currentCount = await prisma.favoriteDriver.count({
      where: { buyerId: session.userId },
    });

    if (currentCount >= MAX_FAVORITE_DRIVERS) {
      return NextResponse.json(
        {
          error: `Maximum ${MAX_FAVORITE_DRIVERS} livreurs préférés atteint.`,
        },
        { status: 400 }
      );
    }

    let driver = null;

    if (rawDriverId) {
      driver = await prisma.user.findFirst({
        where: {
          id: rawDriverId,
          role: "DRIVER",
        },
        include: {
          kycDocuments: {
            where: { status: "VERIFIED" },
            select: { type: true, status: true, syndicateName: true },
          },
          ratingsTo: {
            select: { score: true },
          },
        },
      });
    } else if (rawPhone && rawPhone.trim().length > 0) {
      const cleaned = rawPhone.trim();
      const normalized = normalizePhone(cleaned);

      driver = await prisma.user.findFirst({
        where: {
          role: "DRIVER",
          OR: [
            { phone: normalized },
            { phone: cleaned },
            { name: { equals: cleaned, mode: "insensitive" } },
            { name: { contains: cleaned, mode: "insensitive" } },
          ],
        },
        include: {
          kycDocuments: {
            where: { status: "VERIFIED" },
            select: { type: true, status: true, syndicateName: true },
          },
          ratingsTo: {
            select: { score: true },
          },
        },
      });
    }

    if (!driver) {
      return NextResponse.json(
        { error: "Aucun livreur trouvé avec ce numéro ou ce nom." },
        { status: 404 }
      );
    }

    if (driver.kycStatus !== "VERIFIED") {
      return NextResponse.json(
        {
          error:
            "Ce livreur n'a pas encore son identité vérifiée (KYC Niveau 1 requis).",
        },
        { status: 400 }
      );
    }

    const existing = await prisma.favoriteDriver.findUnique({
      where: {
        buyerId_driverId: {
          buyerId: session.userId,
          driverId: driver.id,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Ce livreur fait déjà partie de vos livreurs préférés." },
        { status: 409 }
      );
    }

    const favorite = await prisma.favoriteDriver.create({
      data: {
        buyerId: session.userId,
        driverId: driver.id,
        note: rawNote ? rawNote.trim().slice(0, 120) : null,
      },
    });

    return NextResponse.json(
      {
        favorite: {
          id: favorite.id,
          buyerId: favorite.buyerId,
          driverId: favorite.driverId,
          note: favorite.note,
          createdAt: favorite.createdAt,
          driver: mapDriverSummary(driver),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/favorite-drivers] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'ajout du livreur préféré." },
      { status: 500 }
    );
  }
}

