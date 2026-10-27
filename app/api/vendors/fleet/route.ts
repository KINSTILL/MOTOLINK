import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logEvent } from "@/lib/audit";
import { DriverStatus } from "@prisma/client";
import { checkFleetRateLimit, canNotifyOffline } from "@/lib/fleet";

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session || session.role !== "VENDOR") {
      return NextResponse.json(
        { error: "Accès réservé aux vendeurs." },
        { status: 403 }
      );
    }

    if (!checkFleetRateLimit(session.userId)) {
      return NextResponse.json(
        { error: "Trop de requêtes. Veuillez patienter une minute." },
        { status: 429 }
      );
    }

    const { searchParams } = new URL(request.url);
    const filter = (searchParams.get("filter") || "all").toLowerCase();
    const search = (searchParams.get("search") || "").trim().toLowerCase();
    const limitParam = parseInt(searchParams.get("limit") || "50", 10);
    const limit = Math.min(Math.max(1, isNaN(limitParam) ? 50 : limitParam), 100);

    // Récupération de tous les livreurs favoris du vendeur
    const favorites = await prisma.favoriteDriver.findMany({
      where: { buyerId: session.userId },
      include: {
        driver: {
          select: {
            id: true,
            name: true,
            phone: true,
            phoneVisibleToVendor: true,
            driverStatus: true,
            driverScore: true,
            driverRatingCount: true,
            brandingLogoUrl: true,
            kycDocuments: {
              where: { status: "VERIFIED" },
              select: { type: true },
            },
            subscriptions: {
              where: {
                status: "ACTIVE",
                endsAt: { gt: new Date() },
              },
              select: { id: true },
            },
            ratingsTo: {
              orderBy: { createdAt: "desc" },
              take: 50,
              select: { score: true },
            },
            offlineNotificationsReceived: {
              where: {
                vendorId: session.userId,
                createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
              },
              take: 1,
              select: { id: true, createdAt: true },
            },
          },
        },
      },
    });

    // Calcul des compteurs globaux (avant filtrage onglet/recherche)
    let countAll = 0;
    let countAvailable = 0;
    let countOnMission = 0;
    let countOffline = 0;

    for (const fav of favorites) {
      countAll++;
      const st = fav.driver.driverStatus;
      if (st === "AVAILABLE") countAvailable++;
      else if (st === "ON_MISSION") countOnMission++;
      else if (st === "OFFLINE") countOffline++;
    }

    // Nombre de livraisons réussies par livreur (affiché sur la carte : "⭐ 4.9 (48 livraisons)")
    const deliveriesGroups = await prisma.mission.groupBy({
      by: ["driverId"],
      where: {
        status: "DELIVERED",
        driverId: { in: favorites.map((f) => f.driverId) },
      },
      _count: { _all: true },
    });
    const deliveriesByDriver = new Map<string, number>();
    for (const g of deliveriesGroups) {
      if (g.driverId) deliveriesByDriver.set(g.driverId, g._count._all);
    }

    // Mapping et enrichissement des données
    const enrichedList = favorites.map((fav) => {
      const d = fav.driver;

      // Calcul de la note moyenne sur les 50 dernières notes
      const ratingsCount = d.ratingsTo.length;
      let averageRating = 5.0;
      if (ratingsCount > 0) {
        const sum = d.ratingsTo.reduce((acc, r) => acc + r.score, 0);
        averageRating = Math.round((sum / ratingsCount) * 10) / 10;
      }

      // Badges KYC vérifiés
      const badges: string[] = [];
      const verifiedTypes = new Set(d.kycDocuments.map((k) => k.type));
      if (verifiedTypes.has("ID_CARD")) badges.push("id_verified");
      if (verifiedTypes.has("SYNDICATE_CARD")) badges.push("syndicate");
      if (verifiedTypes.has("ENROLLMENT_CERT")) badges.push("enrolled");

      const hasActiveSub = d.subscriptions.length > 0;
      // Un livreur arrivé via l'annuaire a explicitement accepté la révélation de son numéro à ce vendeur
      const isPhoneVisible =
        d.phoneVisibleToVendor !== false || fav.source === "directory";
      const displayPhone = isPhoneVisible ? d.phone : "Numéro masqué";

      const isOffline = d.driverStatus === "OFFLINE";
      const hasRecentNotif = (d.offlineNotificationsReceived || []).length > 0;
      const isNotifiable = isOffline && !hasRecentNotif && canNotifyOffline(session.userId, d.id);

      return {
        id: fav.id, // ID du lien FavoriteDriver
        driverId: d.id,
        name: d.name || "Livreur MotoLink",
        phone: displayPhone,
        rawPhone: d.phone,
        phoneVisibleToVendor: isPhoneVisible,
        photoUrl: d.brandingLogoUrl || null,
        driverStatus: d.driverStatus as DriverStatus,
        rating: {
          average: averageRating,
          count: ratingsCount,
        },
        score: d.driverRatingCount > 0 ? Math.round(d.driverScore * 10) / 10 : null,
        deliveriesCount: deliveriesByDriver.get(d.id) ?? 0,
        badges,
        hasActiveSubscription: hasActiveSub,
        source: fav.source || "manual",
        priorityMissionsRemaining: fav.priorityMissionsRemaining || 0,
        isOfflineNotifiable: isNotifiable,
        note: fav.note,
        createdAt: fav.createdAt,
      };
    });

    // 1. Filtrage selon l'onglet
    let filtered = enrichedList.filter((item) => {
      if (filter === "available") return item.driverStatus === "AVAILABLE";
      if (filter === "on_mission") return item.driverStatus === "ON_MISSION";
      if (filter === "offline") return item.driverStatus === "OFFLINE";
      return true; // "all"
    });

    // 2. Filtrage selon la recherche (nom ou téléphone)
    if (search) {
      filtered = filtered.filter((item) => {
        const matchName = item.name.toLowerCase().includes(search);
        const matchPhone =
          item.phoneVisibleToVendor &&
          (item.phone.toLowerCase().includes(search) ||
            item.rawPhone.toLowerCase().includes(search));
        return matchName || matchPhone;
      });
    }

    // 3. Tri hiérarchique :
    // - Disponibles d'abord (par note décroissante)
    // - Puis En mission (par note décroissante)
    // - Puis Hors ligne (par note décroissante)
    const statusPriority: Record<DriverStatus, number> = {
      AVAILABLE: 1,
      ON_MISSION: 2,
      OFFLINE: 3,
    };

    filtered.sort((a, b) => {
      const priorityDiff =
        (statusPriority[a.driverStatus] || 99) - (statusPriority[b.driverStatus] || 99);
      if (priorityDiff !== 0) return priorityDiff;
      // À statut égal, tri par note moyenne décroissante
      if (b.rating.average !== a.rating.average) {
        return b.rating.average - a.rating.average;
      }
      return b.rating.count - a.rating.count;
    });

    // 4. Pagination / Limite
    const finalFleet = filtered.slice(0, limit);

    return NextResponse.json({
      fleet: finalFleet.map(({ rawPhone, ...rest }) => rest),
      counts: {
        all: countAll,
        available: countAvailable,
        on_mission: countOnMission,
        offline: countOffline,
      },
    });
  } catch (error) {
    console.error("[/api/vendors/fleet GET] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération de la flotte." },
      { status: 500 }
    );
  }
}

