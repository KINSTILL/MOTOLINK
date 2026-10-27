import prisma from "@/lib/prisma";
import { logEvent } from "@/lib/audit";
import { sendNotification } from "@/lib/notifications";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export interface CanNotifyOfflineResult {
  canNotify: boolean;
  reason?: string;
  nextAvailableAt?: Date;
  lastNotification?: {
    channel: string;
    status: string;
    createdAt: Date;
  };
}

/**
 * Vérifie si le vendeur peut notifier ce livreur hors-ligne.
 * Règle stricte : maximum 1 notification par 24h par couple (vendeur, livreur).
 */
export async function canNotifyOffline(
  vendorId: string,
  driverId: string
): Promise<CanNotifyOfflineResult> {
  const since = new Date(Date.now() - TWENTY_FOUR_HOURS_MS);

  const lastNotif = await prisma.offlineNotification.findFirst({
    where: {
      vendorId,
      driverId,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
  });

  if (lastNotif) {
    const nextAvailableAt = new Date(
      lastNotif.createdAt.getTime() + TWENTY_FOUR_HOURS_MS
    );
    return {
      canNotify: false,
      reason: "Déjà notifié dans les 24h.",
      nextAvailableAt,
      lastNotification: {
        channel: lastNotif.channel,
        status: lastNotif.status,
        createdAt: lastNotif.createdAt,
      },
    };
  }

  // Chercher la toute dernière pour historique éventuel
  const anyLastNotif = await prisma.offlineNotification.findFirst({
    where: { vendorId, driverId },
    orderBy: { createdAt: "desc" },
  });

  return {
    canNotify: true,
    lastNotification: anyLastNotif
      ? {
          channel: anyLastNotif.channel,
          status: anyLastNotif.status,
          createdAt: anyLastNotif.createdAt,
        }
      : undefined,
  };
}

export interface SendOfflineNotificationResult {
  success: boolean;
  notificationId?: string;
  error?: string;
  channel?: string;
}

/**
 * Envoie une notification WhatsApp ou SMS au livreur hors-ligne pour lui demander sa disponibilité.
 */
export async function sendOfflineNotification(
  vendorId: string,
  driverId: string,
  channel: "whatsapp" | "sms"
): Promise<SendOfflineNotificationResult> {
  // 1. Contrôle du rate limit 24h
  const check = await canNotifyOffline(vendorId, driverId);
  if (!check.canNotify) {
    return {
      success: false,
      error: check.reason || "Déjà notifié dans les 24h.",
    };
  }

  // 2. Récupération des informations vendeur & livreur
  const [vendor, driver] = await Promise.all([
    prisma.user.findUnique({
      where: { id: vendorId },
      select: { id: true, shopName: true, name: true, phone: true },
    }),
    prisma.user.findUnique({
      where: { id: driverId },
      select: { id: true, name: true, phone: true, driverStatus: true },
    }),
  ]);

  if (!vendor || !driver) {
    return {
      success: false,
      error: "Vendeur ou livreur introuvable.",
    };
  }

  const driverName = driver.name || "Livreur";
  const shopName = vendor.shopName || vendor.name || "MotoLink";
  const link = "https://motolink.cm/dashboard/driver";

  // 3. Appel de l'envoi de notification (WhatsApp ou SMS selon choix)
  const notifResult = await sendNotification(
    driver.phone,
    "offline_reminder",
    {
      driverName,
      shopName,
      link,
    },
    channel
  );

  const status = notifResult.success ? "sent" : "failed";

  // 4. Enregistrement en base de données
  const createdRecord = await prisma.offlineNotification.create({
    data: {
      vendorId,
      driverId,
      channel: notifResult.channel || channel,
      messageId: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      status,
    },
  });

  // 5. Journal d'audit append-only
  try {
    await logEvent(
      notifResult.success
        ? "OFFLINE_NOTIFICATION_SENT"
        : "OFFLINE_NOTIFICATION_FAILED",
      "NOTIFICATION",
      createdRecord.id,
      vendorId,
      {
        notificationId: createdRecord.id,
        driverId,
        driverName,
        channel: notifResult.channel || channel,
        status,
        vendorShopName: shopName,
        error: notifResult.error || null,
      }
    );
  } catch (auditErr) {
    console.warn("[offline-notification] Échec audit non-bloquant:", auditErr);
  }

  if (!notifResult.success) {
    return {
      success: false,
      notificationId: createdRecord.id,
      error: notifResult.error || "Échec lors de l'envoi de la notification.",
      channel: notifResult.channel || channel,
    };
  }

  return {
    success: true,
    notificationId: createdRecord.id,
    channel: notifResult.channel || channel,
  };
}

/**
 * Met à jour le statut d'une notification (ex: delivered, read) via webhook
 */
export async function markNotificationStatus(
  notificationId: string,
  status: string
): Promise<void> {
  await prisma.offlineNotification.update({
    where: { id: notificationId },
    data: { status },
  });
}

// Rate limiting global : max 10 requêtes par minute par vendeur
const notifyRateLimitMap = new Map<string, { count: number; windowStart: number }>();
const MAX_NOTIFY_PER_MINUTE = 10;
const ONE_MINUTE_MS = 60 * 1000;

export function checkGlobalNotifyRateLimit(vendorId: string): boolean {
  const now = Date.now();
  const entry = notifyRateLimitMap.get(vendorId);
  if (!entry || now - entry.windowStart > ONE_MINUTE_MS) {
    notifyRateLimitMap.set(vendorId, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= MAX_NOTIFY_PER_MINUTE) {
    return false;
  }
  entry.count += 1;
  return true;
}

export function resetNotifyRateLimit(vendorId?: string) {
  if (vendorId) {
    notifyRateLimitMap.delete(vendorId);
  } else {
    notifyRateLimitMap.clear();
  }
}


