import crypto from "crypto";
import prisma from "@/lib/prisma";

/**
 * MotoLink — Score de fiabilité client (N5).
 *
 * Le score est agrégé par téléphone HASHÉ (SHA-256), jamais par PII en clair.
 * Il n'est jamais bloquant et ne constitue pas un jugement nominatif :
 * il résume uniquement des faits objectifs (nb missions, taux d'échec,
 * taux de litige) sur l'historique.
 */

export interface BuyerReliability {
  /** true si l'historique est suffisant (>= 2 missions) */
  hasData: boolean;
  /** Libellé neutre affiché au vendeur */
  label: "Nouveau client" | "Fiable" | "À surveiller" | "Risque élevé";
  /** Nombre total de missions historiques pour ce numéro */
  totalMissions: number;
  /** Nombre de missions livrées avec succès */
  deliveredCount: number;
  /** Nombre de missions annulées */
  cancelledCount: number;
  /** Nombre de missions en litige */
  disputeCount: number;
  /** Taux d'échec (annulées + litiges) / total, entre 0 et 1 */
  failureRate: number;
  /** Taux de litige (litiges) / total, entre 0 et 1 */
  disputeRate: number;
  /** Score sur 100 (100 = impeccable) */
  score: number;
}

/** Normalise un numéro (retire espaces, tirets, points, parenthèses, signe +). */
export function normalizePhone(phone: string): string {
  return (phone || "").replace(/[\s\-.()+]/g, "").trim();
}

/** Hash SHA-256 stable d'un numéro de téléphone (normalisé). */
export function hashBuyerPhone(phone: string): string {
  const normalized = normalizePhone(phone);
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

const MIN_MISSIONS_FOR_DATA = 2;

/**
 * Calcule le score de fiabilité agrégé pour un téléphone donné.
 * Ne lève jamais d'exception : en cas d'erreur, retourne un état neutre.
 */
export async function computeBuyerReliability(
  phone: string
): Promise<BuyerReliability> {
  const neutral: BuyerReliability = {
    hasData: false,
    label: "Nouveau client",
    totalMissions: 0,
    deliveredCount: 0,
    cancelledCount: 0,
    disputeCount: 0,
    failureRate: 0,
    disputeRate: 0,
    score: 100,
  };

  try {
    const normalized = normalizePhone(phone);
    if (!normalized) return neutral;

    const phoneHash = hashBuyerPhone(normalized);

    const [total, delivered, cancelled, dispute] = await Promise.all([
      prisma.mission.count({ where: { buyerPhoneHash: phoneHash } }),
      prisma.mission.count({
        where: { buyerPhoneHash: phoneHash, status: "DELIVERED" },
      }),
      prisma.mission.count({
        where: { buyerPhoneHash: phoneHash, status: "CANCELLED" },
      }),
      prisma.mission.count({
        where: { buyerPhoneHash: phoneHash, status: "DISPUTE" },
      }),
    ]);

    if (total < MIN_MISSIONS_FOR_DATA) {
      return { ...neutral, totalMissions: total, deliveredCount: delivered };
    }

    const failureRate = (cancelled + dispute) / total;
    const disputeRate = dispute / total;

    // Score : pénalise les échecs et lourdement les litiges.
    const score = Math.max(
      0,
      Math.min(100, Math.round(100 - failureRate * 60 - disputeRate * 40))
    );

    let label: BuyerReliability["label"];
    if (score >= 80) {
      label = "Fiable";
    } else if (score >= 50) {
      label = "À surveiller";
    } else {
      label = "Risque élevé";
    }

    return {
      hasData: true,
      label,
      totalMissions: total,
      deliveredCount: delivered,
      cancelledCount: cancelled,
      disputeCount: dispute,
      failureRate: Number(failureRate.toFixed(3)),
      disputeRate: Number(disputeRate.toFixed(3)),
      score,
    };
  } catch (err) {
    console.error("[computeBuyerReliability] Erreur (non-bloquant) :", err);
    return neutral;
  }
}
