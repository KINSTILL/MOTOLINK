import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logEvent } from "@/lib/audit";
import {
  computeSubscriptionDates,
  getPlanConfig,
  verifyNotchPaySignature,
} from "@/lib/notchpay";

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signature =
      request.headers.get("x-notch-signature") ||
      request.headers.get("x-webhook-signature");

    if (!verifyNotchPaySignature(rawBody, signature)) {
      return NextResponse.json(
        { error: "Signature HMAC Notch Pay invalide." },
        { status: 401 }
      );
    }

    const payload = JSON.parse(rawBody);
    const data = payload.data || payload.transaction || payload;

    const pspRef: string | undefined = data.reference || data.pspRef;
    const status: string = (data.status || "complete").toLowerCase();

    if (!pspRef) {
      return NextResponse.json(
        { error: "Référence de transaction (pspRef) manquante." },
        { status: 400 }
      );
    }

    if (status !== "complete" && status !== "success" && status !== "active") {
      return NextResponse.json({
        received: true,
        ignored: true,
        status,
      });
    }

    const existing = await prisma.subscription.findUnique({
      where: { pspRef },
    });

    if (existing) {
      const { startsAt, endsAt } = computeSubscriptionDates(existing.plan);
      let rewardApplied = false;
      let appliedPercent = 0;

      const updated = await prisma.$transaction(async (tx) => {
        const sub = await tx.subscription.update({
          where: { id: existing.id },
          data: {
            status: "ACTIVE",
            startsAt,
            endsAt,
          },
        });

        const user = await tx.user.findUnique({
          where: { id: existing.userId },
          select: { role: true, referralDiscount: true, referralDiscountUsed: true },
        });

        if (user && user.role === "VENDOR" && user.referralDiscount > 0 && !user.referralDiscountUsed) {
          rewardApplied = true;
          appliedPercent = user.referralDiscount;
          await tx.user.update({
            where: { id: existing.userId },
            data: {
              subscriptionStatus: "ACTIVE",
              referralDiscountUsed: true,
            },
          });
        } else {
          await tx.user.update({
            where: { id: existing.userId },
            data: {
              subscriptionStatus: "ACTIVE",
            },
          });
        }

        return sub;
      });

      if (rewardApplied) {
        await logEvent(
          "REFERRAL_REWARD_APPLIED",
          "VENDOR",
          existing.userId,
          existing.userId,
          {
            discountPercent: appliedPercent,
            plan: existing.plan,
          }
        );
      }

      return NextResponse.json({
        received: true,
        subscription: updated,
      });
    }

    // Création directe si la souscription n'existait pas encore en base
    const userId: string | undefined = data.userId || data.customer?.name;
    if (!userId) {
      return NextResponse.json(
        { error: "Utilisateur introuvable pour cette transaction." },
        { status: 404 }
      );
    }

    const role = data.role === "DRIVER" ? "DRIVER" : "VENDOR";
    const plan = data.plan === "MONTHLY" ? "MONTHLY" : "WEEKLY";
    const planConfig = getPlanConfig(role, plan);
    const { startsAt, endsAt } = computeSubscriptionDates(plan);

    const created = await prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.create({
        data: {
          userId,
          role,
          plan,
          priceFCFA: data.amount || planConfig.priceFCFA,
          startsAt,
          endsAt,
          status: "ACTIVE",
          pspRef,
        },
      });

      await tx.user.update({
        where: { id: userId },
        data: { subscriptionStatus: "ACTIVE" },
      });

      return sub;
    });

    return NextResponse.json({
      received: true,
      subscription: created,
    });
  } catch (error) {
    console.error("[POST /api/webhooks/notchpay] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur lors du traitement du webhook Notch Pay." },
      { status: 500 }
    );
  }
}

