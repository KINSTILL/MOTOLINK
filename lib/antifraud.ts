import crypto from "crypto";
import prisma from "@/lib/prisma";
import { normalizePhone } from "@/lib/utils";

export interface FraudCheckResult {
  isFraud: boolean;
  reason?: string;
}

/**
 * Calcule le hash SHA-256 d'une adresse IP pour anonymisation conforme RGPD / Loi Camerounaise n°2024/017
 */
export function hashIp(ip: string): string {
  return crypto.createHash("sha256").update(ip.trim()).digest("hex");
}

/**
 * Détecte les tentatives d'auto-parrainage basées sur 3 signaux :
 * 1. Téléphone identique (normalisé)
 * 2. Empreinte de périphérique (device fingerprint) identique
 * 3. Adresse IP identique (comparaison avec le dernier hash ou l'historique d'audit)
 */
export async function detectSelfReferral(
  referrerId: string,
  refereePhone: string,
  refereeDeviceFingerprint?: string,
  refereeIp?: string
): Promise<FraudCheckResult> {
  const referrer = await prisma.user.findUnique({
    where: { id: referrerId },
    select: {
      id: true,
      phone: true,
      lastDeviceFingerprint: true,
      lastIpHash: true,
    },
  });

  if (!referrer) {
    return { isFraud: true, reason: "Parrain introuvable" };
  }

  // 1. Téléphone identique
  const normReferee = normalizePhone(refereePhone);
  const normReferrer = normalizePhone(referrer.phone);
  if (normReferee === normReferrer) {
    return { isFraud: true, reason: "Téléphone identique" };
  }

  // 2. Device fingerprint identique
  if (
    refereeDeviceFingerprint &&
    refereeDeviceFingerprint.trim().length > 0 &&
    referrer.lastDeviceFingerprint &&
    refereeDeviceFingerprint.trim() === referrer.lastDeviceFingerprint.trim()
  ) {
    return { isFraud: true, reason: "Appareil identique" };
  }

  // 3. IP identique
  if (refereeIp && refereeIp.trim().length > 0) {
    const refereeIpHash = hashIp(refereeIp);

    // Comparaison avec lastIpHash du parrain
    if (referrer.lastIpHash && referrer.lastIpHash === refereeIpHash) {
      return { isFraud: true, reason: "IP identique" };
    }

    // Comparaison avec les 5 dernières adresses du parrain dans AuditLog
    const recentLogs = await prisma.auditLog.findMany({
      where: {
        actorId: referrerId,
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { actorIp: true, metadata: true },
    });

    for (const log of recentLogs) {
      if (log.actorIp && (log.actorIp === refereeIp.trim() || hashIp(log.actorIp) === refereeIpHash)) {
        return { isFraud: true, reason: "IP identique" };
      }
      const meta = log.metadata as any;
      if (meta?.ipHash && meta.ipHash === refereeIpHash) {
        return { isFraud: true, reason: "IP identique" };
      }
    }
  }

  return { isFraud: false };
}

/**
 * Détecte les parrainages en rafale émanant du même parrain (> 5 parrainages en 24h)
 */
export async function detectRapidReferrals(referrerId: string): Promise<FraudCheckResult> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const count = await prisma.referral.count({
    where: {
      referrerId,
      createdAt: { gte: twentyFourHoursAgo },
    },
  });

  // Si le parrain a déjà 5 parrainages (ou plus) dans les dernières 24h, cette nouvelle tentative dépasse le seuil
  if (count >= 5) {
    return { isFraud: true, reason: "Trop de parrainages en 24h" };
  }

  return { isFraud: false };
}

/**
 * Détecte la création de multiples comptes sur le même appareil (device fingerprint partagé par > 2 comptes)
 */
export async function detectSameDeviceMultipleAccounts(
  deviceFingerprint?: string
): Promise<FraudCheckResult> {
  if (!deviceFingerprint || deviceFingerprint.trim().length === 0) {
    return { isFraud: false };
  }

  const cleanFingerprint = deviceFingerprint.trim();

  const count = await prisma.user.count({
    where: {
      lastDeviceFingerprint: cleanFingerprint,
    },
  });

  // Si plus de 2 comptes utilisent ce même appareil (count > 2)
  if (count > 2) {
    return { isFraud: true, reason: "Plusieurs comptes sur le même appareil" };
  }

  return { isFraud: false };
}
