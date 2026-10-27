import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== "DRIVER") {
      return NextResponse.json(
        { error: "Accès réservé aux livreurs connectés." },
        { status: 403 }
      );
    }

    const [user, referrals] = await Promise.all([
      prisma.user.findUnique({
        where: { id: session.userId },
        select: {
          referrerBadge: true,
          referrerCount: true,
        },
      }),
      prisma.referral.findMany({
        where: {
          referrerId: session.userId,
          type: "DRIVER_TO_DRIVER",
        },
        include: {
          referee: {
            select: {
              id: true,
              name: true,
              phone: true,
              driverStatus: true,
              driverMissions: {
                where: { status: "DELIVERED" },
                select: { id: true },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    let totalMissionsByReferees = 0;
    let activeReferrals = 0;
    let completedReferrals = 0;

    const formattedReferrals = referrals.map((r) => {
      const deliveredCount = r.referee.driverMissions.length;
      totalMissionsByReferees += deliveredCount;

      if (r.status === "COMPLETED" || deliveredCount >= 20) {
        completedReferrals++;
      } else if (r.status === "ACTIVE" && deliveredCount >= 5) {
        activeReferrals++;
      }

      return {
        id: r.id,
        refereeId: r.referee.id,
        refereeName: r.referee.name || r.referee.phone || "Livreur",
        refereeStatus: r.referee.driverStatus,
        refereeCompletedMissions: deliveredCount,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      };
    });

    const totalReferrals = formattedReferrals.length;

    // Calcul du prochain palier
    let nextMilestone: { count: number; badge: string; remainingNeeded: number } | null = null;
    if (completedReferrals < 1) {
      nextMilestone = { count: 1, badge: "sponsor", remainingNeeded: 1 - completedReferrals };
    } else if (completedReferrals < 3) {
      nextMilestone = { count: 3, badge: "sponsor_confirmed", remainingNeeded: 3 - completedReferrals };
    } else if (completedReferrals < 5) {
      nextMilestone = { count: 5, badge: "sponsor_gold", remainingNeeded: 5 - completedReferrals };
    } else if (completedReferrals < 10) {
      nextMilestone = { count: 10, badge: "sponsor_platinum", remainingNeeded: 10 - completedReferrals };
    }

    return NextResponse.json({
      referrals: formattedReferrals,
      stats: {
        totalReferrals,
        activeReferrals,
        completedReferrals,
        totalMissionsByReferees,
        currentBadge: user?.referrerBadge || null,
        nextMilestone,
      },
    });
  } catch (error) {
    console.error("[GET /api/referrals/status] Erreur:", error);
    return NextResponse.json(
      { error: "Impossible de récupérer le statut de vos parrainages." },
      { status: 500 }
    );
  }
}

