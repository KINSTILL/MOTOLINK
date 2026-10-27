import crypto from "crypto";
import prisma from "@/lib/prisma";
import { normalizeChannel, sendNotification } from "@/lib/notifications";
import { requireEnvSecret } from "@/lib/secrets";

export type PlanType = "WEEKLY" | "MONTHLY";
export type SubscribableRole = "VENDOR" | "DRIVER";

export const VENDOR_FAIR_USE_WEEKLY_LIMIT = 50;

export const SUBSCRIPTION_PRICING: Record<
  SubscribableRole,
  Record<PlanType, { priceFCFA: number; durationDays: number; label: string }>
> = {
  VENDOR: {
    WEEKLY: {
      priceFCFA: 1000,
      durationDays: 7,
      label: "Hebdomadaire Vendeur (1 000 FCFA / semaine)",
    },
    MONTHLY: {
      priceFCFA: 3500,
      durationDays: 30,
      label: "Mensuel Vendeur (3 500 FCFA / mois)",
    },
  },
  DRIVER: {
    WEEKLY: {
      priceFCFA: 250,
      durationDays: 7,
      label: "Hebdomadaire Livreur (250 FCFA / semaine)",
    },
    MONTHLY: {
      priceFCFA: 800,
      durationDays: 30,
      label: "Mensuel Livreur (800 FCFA / mois)",
    },
  },
};

export function getPlanConfig(role: string, plan: string) {
  const r: SubscribableRole = role === "DRIVER" ? "DRIVER" : "VENDOR";
  const p: PlanType = plan === "MONTHLY" ? "MONTHLY" : "WEEKLY";
  return SUBSCRIPTION_PRICING[r][p];
}

export function computeSubscriptionDates(
  plan: PlanType,
  startsAt: Date = new Date()
): { startsAt: Date; endsAt: Date } {
  const days = plan === "MONTHLY" ? 30 : 7;
  const endsAt = new Date(startsAt.getTime() + days * 24 * 60 * 60 * 1000);
  return { startsAt, endsAt };
}

/**
 * Initialise un paiement Mobile Money (Orange Money / MTN MoMo) via Notch Pay.
 */
export async function createPayment(
  userId: string,
  amountFCFA: number,
  description: string
): Promise<{ paymentUrl: string; pspRef: string }> {
  const pspRef = `np_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
  const publicKey = process.env.NOTCHPAY_PUBLIC_KEY || "pk.test.sample";
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

  const isMock =
    process.env.NOTCHPAY_MOCK === "true" ||
    publicKey.includes("sample") ||
    publicKey.includes("placeholder") ||
    publicKey.includes("xxxx");

  if (!isMock) {
    try {
      const response = await fetch("https://api.notchpay.co/payments/initialize", {
        method: "POST",
        headers: {
          Authorization: publicKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: amountFCFA,
          currency: "XAF",
          reference: pspRef,
          description,
          callback: `${baseUrl}/subscription?pspRef=${pspRef}`,
          customer: {
            name: userId,
          },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const paymentUrl =
          data?.authorization_url ||
          `${baseUrl}/subscription?pspRef=${pspRef}&mock_paid=1`;
        const ref = data?.transaction?.reference || pspRef;
        return { paymentUrl, pspRef: ref };
      }
    } catch (error) {
      console.error("[NotchPay] Erreur API distante, bascule mock :", error);
    }
  }

  console.log("\n==========================================");
  console.log("💳 [NOTCH PAY - INITIALISATION PAIEMENT]");
  console.log(`👤 UserId      : ${userId}`);
  console.log(`💰 Montant     : ${amountFCFA} FCFA`);
  console.log(`📝 Description : ${description}`);
  console.log(`🔖 Référence   : ${pspRef}`);
  console.log("==========================================\n");

  return {
    paymentUrl: `/subscription?pspRef=${encodeURIComponent(pspRef)}&mock_paid=1`,
    pspRef,
  };
}

/**
 * Calcule la signature HMAC-SHA256 Notch Pay d'un corps brut
 */
export function signNotchPayWebhook(rawBody: string): string {
  const secret = requireEnvSecret(
    ["NOTCHPAY_WEBHOOK_SECRET"],
    "whsec_test_sample",
    "Signature du webhook Notch Pay (HMAC-SHA256)"
  );
  return crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

/**
 * Vérifie la signature HMAC-SHA256 d'un webhook Notch Pay
 */
export function verifyNotchPaySignature(
  rawBody: string,
  signatureHeader: string | null
): boolean {
  if (!signatureHeader) return false;
  const expected = signNotchPayWebhook(rawBody);
  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(signatureHeader.trim(), "utf8");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Vérifie et retourne l'abonnement actif d'un utilisateur (ACTIVE ou CANCELLED non expiré).
 * Met automatiquement à jour le statut en EXPIRED si endsAt < now.
 */
export async function getActiveSubscription(userId: string) {
  const now = new Date();

  // Expire les abonnements dont endsAt est dépassé pour cet utilisateur
  const expiredResult = await prisma.subscription.updateMany({
    where: {
      userId,
      status: { in: ["ACTIVE", "CANCELLED"] },
      endsAt: { lt: now },
    },
    data: {
      status: "EXPIRED",
    },
  });

  const activeSub = await prisma.subscription.findFirst({
    where: {
      userId,
      status: { in: ["ACTIVE", "CANCELLED"] },
      endsAt: { gte: now },
    },
    orderBy: { endsAt: "desc" },
  });

  if (!activeSub && expiredResult.count > 0) {
    await prisma.user.update({
      where: { id: userId },
      data: { subscriptionStatus: "EXPIRED" },
    });
  }

  return activeSub;
}

/**
 * Cron quotidien :
 * 1) Marque les Subscription expirées (endsAt < now) comme EXPIRED et envoie la notification push
 * 2) Envoie un rappel 2 jours avant expiration (push + WhatsApp/SMS)
 */
export async function runDailySubscriptionCron() {
  const now = new Date();
  const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

  // 1. Abonnements expirés (endsAt < now)
  const toExpire = await prisma.subscription.findMany({
    where: {
      status: { in: ["ACTIVE", "CANCELLED"] },
      endsAt: { lt: now },
    },
    include: {
      user: {
        select: {
          id: true,
          phone: true,
          name: true,
          shopName: true,
          preferredChannel: true,
          notificationChannel: true,
        },
      },
    },
  });

  let expiredCount = 0;
  for (const sub of toExpire) {
    await prisma.$transaction([
      prisma.subscription.update({
        where: { id: sub.id },
        data: { status: "EXPIRED" },
      }),
      prisma.user.update({
        where: { id: sub.userId },
        data: { subscriptionStatus: "EXPIRED" },
      }),
    ]);
    expiredCount++;

    console.log(
      `🔔 [PUSH EXPIRATION] User ${sub.user.phone} : "Votre abonnement a expiré. Renouvelez pour accéder aux missions."`
    );
  }

  // 2. Rappel 2 jours avant expiration
  const expiringSoon = await prisma.subscription.findMany({
    where: {
      status: "ACTIVE",
      reminderSent: false,
      endsAt: {
        gte: now,
        lte: twoDaysFromNow,
      },
    },
    include: {
      user: {
        select: {
          id: true,
          phone: true,
          name: true,
          shopName: true,
          preferredChannel: true,
          notificationChannel: true,
        },
      },
    },
  });

  let remindersCount = 0;
  for (const sub of expiringSoon) {
    const reminderMessage =
      "Votre abonnement expire dans 2 jours. Renouvelez pour continuer.";

    console.log(`🔔 [PUSH RAPPEL J-2] User ${sub.user.phone} : "${reminderMessage}"`);

    const preferred = normalizeChannel(
      sub.user.preferredChannel || sub.user.notificationChannel
    );

    await sendNotification(
      sub.user.phone,
      "subscription_reminder",
      {
        buyerName: sub.user.shopName || sub.user.name || "Utilisateur",
        shopName: "MotoLink",
        link: "https://motolink.cm/subscription",
      },
      preferred
    );

    await prisma.subscription.update({
      where: { id: sub.id },
      data: { reminderSent: true },
    });
    remindersCount++;
  }

  return {
    expiredCount,
    remindersCount,
  };
}

