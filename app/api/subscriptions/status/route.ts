import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import {
  getActiveSubscription,
  SUBSCRIPTION_PRICING,
  VENDOR_FAIR_USE_WEEKLY_LIMIT,
} from "@/lib/notchpay";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const activeSub = await getActiveSubscription(session.userId);
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        role: true,
        subscriptionStatus: true,
        referralDiscount: true,
        referralDiscountUsed: true,
      },
    });

    const latestSub =
      activeSub ||
      (await prisma.subscription.findFirst({
        where: { userId: session.userId },
        orderBy: { createdAt: "desc" },
      }));

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const weeklyMissionCount =
      session.role === "VENDOR"
        ? await prisma.mission.count({
            where: {
              vendorId: session.userId,
              createdAt: { gte: sevenDaysAgo },
            },
          })
        : 0;

    const effectiveStatus = activeSub
      ? "ACTIVE"
      : latestSub?.status === "EXPIRED" || user?.subscriptionStatus === "EXPIRED"
      ? "EXPIRED"
      : "NONE";

    return NextResponse.json({
      status: effectiveStatus,
      isActive: Boolean(activeSub),
      renewalCancelled: activeSub?.status === "CANCELLED",
      subscription: activeSub || latestSub || null,
      weeklyMissionCount,
      fairUseLimit: VENDOR_FAIR_USE_WEEKLY_LIMIT,
      pricing:
        session.role === "DRIVER"
          ? SUBSCRIPTION_PRICING.DRIVER
          : SUBSCRIPTION_PRICING.VENDOR,
      referralDiscount: user?.referralDiscount ?? 0,
      referralDiscountUsed: user?.referralDiscountUsed ?? false,
    });
  } catch (error) {
    console.error("[GET /api/subscriptions/status] Erreur:", error);
    return NextResponse.json(
      { error: "Impossible de récupérer le statut d'abonnement." },
      { status: 500 }
    );
  }
}

