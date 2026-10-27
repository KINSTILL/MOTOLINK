import prisma from "@/lib/prisma";
import { getActiveSubscription } from "@/lib/notchpay";
import { logEvent } from "@/lib/audit";

// Rate limiting in-memory maps
const publicDraftRateLimitMap = new Map<string, { count: number; windowStart: number }>();
const smartPasteRateLimitMap = new Map<string, { count: number; windowStart: number }>();

const ONE_HOUR_MS = 60 * 60 * 1000;
const MAX_PUBLIC_DRAFTS_PER_HOUR = 5;
const MAX_SMART_PASTES_PER_HOUR = 20;

/**
 * Rate limit pour la soumission publique de brouillons via /go/[slug] (5 par heure par IP).
 */
export function checkPublicDraftRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = publicDraftRateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > ONE_HOUR_MS) {
    publicDraftRateLimitMap.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= MAX_PUBLIC_DRAFTS_PER_HOUR) {
    return false;
  }
  entry.count += 1;
  return true;
}

export function resetPublicDraftRateLimit(ip?: string) {
  if (ip) publicDraftRateLimitMap.delete(ip);
  else publicDraftRateLimitMap.clear();
}

/**
 * Rate limit pour le Smart Paste vendeur (20 par heure par vendeur).
 */
export function checkSmartPasteRateLimit(vendorId: string): boolean {
  const now = Date.now();
  const entry = smartPasteRateLimitMap.get(vendorId);
  if (!entry || now - entry.windowStart > ONE_HOUR_MS) {
    smartPasteRateLimitMap.set(vendorId, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= MAX_SMART_PASTES_PER_HOUR) {
    return false;
  }
  entry.count += 1;
  return true;
}

export function resetSmartPasteRateLimit(vendorId?: string) {
  if (vendorId) smartPasteRateLimitMap.delete(vendorId);
  else smartPasteRateLimitMap.clear();
}

/**
 * Vérifie si le vendeur a un abonnement actif OU au moins 1 crédit disponible.
 */
export async function hasActiveSubscriptionOrCredits(vendorId: string): Promise<{
  allowed: boolean;
  hasSubscription: boolean;
  availableCredits: number;
}> {
  const activeSub = await getActiveSubscription(vendorId);
  if (activeSub) {
    return { allowed: true, hasSubscription: true, availableCredits: 0 };
  }

  const tickets = await prisma.ticket.findMany({
    where: {
      vendorId,
      OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
    },
  });

  const availableCredits = tickets.reduce(
    (acc, t) => acc + Math.max(0, t.quantity - t.used),
    0
  );

  return {
    allowed: availableCredits > 0,
    hasSubscription: false,
    availableCredits,
  };
}

/**
 * Consomme 1 crédit de ticket si le vendeur n'a pas d'abonnement actif.
 */
export async function consumeCreditIfNeeded(vendorId: string): Promise<boolean> {
  const activeSub = await getActiveSubscription(vendorId);
  if (activeSub) return true;

  const tickets = await prisma.ticket.findMany({
    where: {
      vendorId,
      OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
    },
    orderBy: { createdAt: "asc" },
  });

  for (const t of tickets) {
    if (t.used < t.quantity) {
      await prisma.ticket.update({
        where: { id: t.id },
        data: { used: t.used + 1 },
      });
      return true;
    }
  }

  return false;
}

/**
 * Nettoie les brouillons non finalisés (status: DRAFT) vieux de plus de 7 jours.
 * Crée un AuditLog DRAFT_EXPIRED pour chaque brouillon supprimé.
 */
export async function cleanupExpiredDrafts(): Promise<{ deletedCount: number }> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const expiredDrafts = await prisma.mission.findMany({
    where: {
      status: "DRAFT",
      createdAt: { lt: sevenDaysAgo },
    },
    select: { id: true, vendorId: true, buyerPhone: true, createdAt: true },
  });

  let deletedCount = 0;
  for (const draft of expiredDrafts) {
    await logEvent("DRAFT_EXPIRED", "MISSION", draft.id, draft.vendorId, {
      createdAt: draft.createdAt.toISOString(),
      reason: "Expired after 7 days without finalization",
    });

    await prisma.mission.delete({
      where: { id: draft.id },
    });
    deletedCount++;
  }

  return { deletedCount };
}

