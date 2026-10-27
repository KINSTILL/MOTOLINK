import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logEvent } from "@/lib/audit";
import {
  computeSubscriptionDates,
  createPayment,
  getPlanConfig,
} from "@/lib/notchpay";

const createSubscriptionSchema = z.object({
  role: z.enum(["VENDOR", "DRIVER"]).optional(),
  plan: z.enum(["WEEKLY", "MONTHLY"]),
  deferredWebhook: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Session requise. Veuillez vous connecter." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const parsed = createSubscriptionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Offre d'abonnement invalide (WEEKLY ou MONTHLY requis)." },
        { status: 400 }
      );
    }

    const targetRole =
      parsed.data.role ||
      (session.role === "DRIVER" ? "DRIVER" : "VENDOR");
    const plan = parsed.data.plan;
    const planConfig = getPlanConfig(targetRole, plan);

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        role: true,
        referralDiscount: true,
        referralDiscountUsed: true,
      },
    });

    let effectivePrice = planConfig.priceFCFA;
    let appliedDiscount = 0;
    if (
      user &&
      targetRole === "VENDOR" &&
      user.referralDiscount > 0 &&
      !user.referralDiscountUsed
    ) {
      appliedDiscount = user.referralDiscount;
      effectivePrice = Math.max(0, Math.round(planConfig.priceFCFA * (1 - appliedDiscount / 100)));
    }

    const { paymentUrl, pspRef } = await createPayment(
      session.userId,
      effectivePrice,
      `Abonnement MotoLink - ${planConfig.label}${appliedDiscount > 0 ? ` (-${appliedDiscount}%)` : ""}`
    );

    const { startsAt, endsAt } = computeSubscriptionDates(plan);

    const publicKey = process.env.NOTCHPAY_PUBLIC_KEY || "pk.test.sample";
    const isMockMode =
      !parsed.data.deferredWebhook &&
      (process.env.NOTCHPAY_MOCK === "true" ||
        publicKey.includes("sample") ||
        publicKey.includes("placeholder"));

    const initialStatus = isMockMode ? "ACTIVE" : "PENDING";

    const subscription = await prisma.$transaction(async (tx) => {
      if (initialStatus === "ACTIVE") {
        // Expire les anciens abonnements actifs avant d'activer le nouveau
        await tx.subscription.updateMany({
          where: {
            userId: session.userId,
            status: "ACTIVE",
          },
          data: {
            status: "EXPIRED",
          },
        });

        await tx.user.update({
          where: { id: session.userId },
          data: {
            subscriptionStatus: "ACTIVE",
            ...(appliedDiscount > 0 ? { referralDiscountUsed: true } : {}),
          },
        });
      }

      return tx.subscription.create({
        data: {
          userId: session.userId,
          role: targetRole,
          plan,
          priceFCFA: effectivePrice,
          startsAt,
          endsAt,
          status: initialStatus,
          pspRef,
        },
      });
    });

    if (initialStatus === "ACTIVE" && appliedDiscount > 0) {
      await logEvent(
        "REFERRAL_REWARD_APPLIED",
        "VENDOR",
        session.userId,
        session.userId,
        {
          discountPercent: appliedDiscount,
          originalPrice: planConfig.priceFCFA,
          discountedPrice: effectivePrice,
          plan,
        }
      );
    }

    return NextResponse.json(
      {
        paymentUrl,
        pspRef,
        subscription,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/subscriptions/create] Erreur:", error);
    return NextResponse.json(
      { error: "Impossible d'initialiser l'abonnement." },
      { status: 500 }
    );
  }
}

