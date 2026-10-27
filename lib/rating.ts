import prisma from "@/lib/prisma";
import { logEvent } from "@/lib/audit";

/**
 * MotoLink — Notation mutuelle vendeur ⇄ livreur & score de confiance sur 100.
 */

export const RATING_WINDOW = 50; // nombre de notes prises en compte dans le score
export const PARTNER_WEIGHT = 0.5; // notes du partenaire (vendeur pour un livreur, livreur pour un vendeur)
export const BUYER_WEIGHT = 0.3; // notes des acheteurs (via la page de suivi)
export const DISPUTE_WEIGHT = 0.2; // pénalité litiges
export const MAX_COMMENT_LENGTH = 500;

export class RatingError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "RatingError";
    this.status = status;
  }
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((acc, v) => acc + v, 0) / values.length;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export interface TrustScoreInput {
  /** Notes (1-5) reçues du partenaire de mission (vendeur ↔ livreur) */
  partnerScores: number[];
  /** Notes (1-5) reçues d'acheteurs (via la page de suivi) */
  buyerScores: number[];
  /** Nombre de missions en litige */
  disputes: number;
  /** Nombre de missions terminées (livrées + litiges) */
  missions: number;
}

/**
 * Calcule le score de confiance sur 100.
 *
 *   Score = (NoteVendeurs × 0.5 + NoteAcheteurs × 0.3) / (poids présents)  [notes ramenées sur 100]
 *           − (litiges / missions × 100) × 0.2
 *
 * Les poids 0.5 / 0.3 sont renormalisés sur les sources effectivement disponibles : sans cela,
 * un livreur parfait (5★, aucun litige) plafonnerait à 80/100 et un livreur sans note acheteur
 * serait pénalisé à 50/100. Le résultat est borné entre 0 et 100.
 */
export function computeTrustScore(input: TrustScoreInput): number {
  const partnerAvg = average(input.partnerScores);
  const buyerAvg = average(input.buyerScores);

  let weightedSum = 0;
  let totalWeight = 0;
  if (partnerAvg !== null) {
    weightedSum += partnerAvg * 20 * PARTNER_WEIGHT;
    totalWeight += PARTNER_WEIGHT;
  }
  if (buyerAvg !== null) {
    weightedSum += buyerAvg * 20 * BUYER_WEIGHT;
    totalWeight += BUYER_WEIGHT;
  }

  // Aucune note reçue : pas de score (valeur par défaut 0)
  if (totalWeight === 0) return 0;

  const ratingPart = weightedSum / totalWeight;
  const penaltyPercent =
    input.missions > 0 ? (input.disputes / input.missions) * 100 : 0;

  const finalScore = ratingPart - penaltyPercent * DISPUTE_WEIGHT;
  return round1(Math.min(100, Math.max(0, finalScore)));
}

/**
 * Recalcule et persiste le score (driverScore ou vendorScore) d'un utilisateur
 * à partir de ses 50 dernières notes reçues. Journalise SCORE_UPDATED.
 */
export async function recalculateScore(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, driverScore: true, vendorScore: true },
  });
  if (!user || (user.role !== "DRIVER" && user.role !== "VENDOR")) {
    return;
  }

  const [lastRatings, totalRatings] = await Promise.all([
    prisma.rating.findMany({
      where: { toUserId: userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: RATING_WINDOW,
      select: { score: true, fromUser: { select: { role: true } } },
    }),
    prisma.rating.count({ where: { toUserId: userId } }),
  ]);

  const partnerScores: number[] = [];
  const buyerScores: number[] = [];
  for (const r of lastRatings) {
    if (r.fromUser.role === "BUYER") buyerScores.push(r.score);
    else partnerScores.push(r.score);
  }

  const roleField = user.role === "DRIVER" ? "driverId" : "vendorId";
  const [missions, disputes] = await Promise.all([
    prisma.mission.count({
      where: { [roleField]: userId, status: { in: ["DELIVERED", "DISPUTE"] } },
    }),
    prisma.mission.count({
      where: { [roleField]: userId, status: "DISPUTE" },
    }),
  ]);

  const score = computeTrustScore({
    partnerScores,
    buyerScores,
    disputes,
    missions,
  });

  const previousScore =
    user.role === "DRIVER" ? user.driverScore : user.vendorScore;

  await prisma.user.update({
    where: { id: userId },
    data:
      user.role === "DRIVER"
        ? { driverScore: score, driverRatingCount: totalRatings }
        : { vendorScore: score, vendorRatingCount: totalRatings },
  });

  await logEvent("SCORE_UPDATED", "USER", userId, null, {
    actorRole: "SYSTEM",
    role: user.role,
    previousScore,
    newScore: score,
    ratingsUsed: lastRatings.length,
    ratingsTotal: totalRatings,
    missions,
    disputes,
  });
}

/**
 * Enregistre la note d'une partie à l'autre après une mission DELIVERED.
 * - une seule note par utilisateur et par mission (garde atomique via le drapeau Mission)
 * - les notes ne sont jamais supprimées
 */
export async function submitRating(
  missionId: string,
  fromUserId: string,
  toUserId: string,
  score: number,
  comment?: string | null
): Promise<void> {
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    throw new RatingError(400, "La note doit être un entier entre 1 et 5.");
  }

  const cleanComment = comment?.trim() ? comment.trim() : null;
  if (cleanComment && cleanComment.length > MAX_COMMENT_LENGTH) {
    throw new RatingError(
      400,
      `Le commentaire ne peut pas dépasser ${MAX_COMMENT_LENGTH} caractères.`
    );
  }

  const mission = await prisma.mission.findUnique({
    where: { id: missionId },
    select: { id: true, status: true, vendorId: true, driverId: true },
  });
  if (!mission) {
    throw new RatingError(404, "Mission introuvable.");
  }
  if (mission.status !== "DELIVERED") {
    throw new RatingError(
      400,
      "Vous ne pouvez noter qu'une mission livrée."
    );
  }
  if (!mission.driverId) {
    throw new RatingError(400, "Aucun livreur n'est assigné à cette mission.");
  }

  let flag: "vendorRatedDriver" | "driverRatedVendor";
  if (fromUserId === mission.vendorId && toUserId === mission.driverId) {
    flag = "vendorRatedDriver";
  } else if (fromUserId === mission.driverId && toUserId === mission.vendorId) {
    flag = "driverRatedVendor";
  } else {
    throw new RatingError(
      403,
      "Seuls le vendeur et le livreur de la mission peuvent se noter mutuellement."
    );
  }

  const rating = await prisma.$transaction(async (tx) => {
    // Garde atomique : un seul appel concurrent peut faire passer le drapeau à true
    const claimed = await tx.mission.updateMany({
      where: { id: missionId, [flag]: false },
      data: { [flag]: true },
    });
    if (claimed.count === 0) {
      throw new RatingError(409, "Vous avez déjà noté cette mission.");
    }

    // Notes antérieures à l'introduction des drapeaux
    const existing = await tx.rating.findFirst({
      where: { missionId, fromUserId },
      select: { id: true },
    });
    if (existing) {
      throw new RatingError(409, "Vous avez déjà noté cette mission.");
    }

    return tx.rating.create({
      data: {
        missionId,
        fromUserId,
        toUserId,
        score,
        comment: cleanComment,
      },
    });
  });

  await recalculateScore(toUserId);

  await logEvent("RATING_SUBMITTED", "RATING", rating.id, fromUserId, {
    missionId,
    toUserId,
    score,
    hasComment: Boolean(cleanComment),
  });
}

// ---------------------------------------------------------------------------
// Tableau d'honneur mensuel
// ---------------------------------------------------------------------------

const DOUALA_OFFSET_MS = 60 * 60 * 1000; // Africa/Douala = UTC+1, pas d'heure d'été

/** Bornes [début, fin[ du mois courant en heure de Douala. */
export function getMonthRange(now: Date = new Date()): {
  start: Date;
  end: Date;
} {
  const local = new Date(now.getTime() + DOUALA_OFFSET_MS);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  return {
    start: new Date(Date.UTC(year, month, 1) - DOUALA_OFFSET_MS),
    end: new Date(Date.UTC(year, month + 1, 1) - DOUALA_OFFSET_MS),
  };
}

export const DEFAULT_CITY = "Douala";

export interface LeaderboardEntry {
  rank: number;
  driverId: string;
  name: string;
  city: string;
  score: number;
  ratingCount: number;
  deliveriesThisMonth: number;
  isTopOfMonth: boolean;
}

/**
 * Top livreurs du mois pour une ville.
 * Éligibles : livreurs de la ville ayant au moins 1 livraison ce mois-ci et au moins 1 note reçue.
 * Classement : score de confiance décroissant, puis livraisons du mois, puis nombre de notes.
 * Le livreur sans ville renseignée est rattaché à la ville par défaut (Douala).
 */
export async function getMonthlyLeaderboard(
  options: { city?: string; now?: Date; limit?: number } = {}
): Promise<LeaderboardEntry[]> {
  const city = (options.city || DEFAULT_CITY).trim();
  const limit = Math.min(Math.max(1, options.limit ?? 10), 50);
  const { start, end } = getMonthRange(options.now);

  const deliveries = await prisma.mission.groupBy({
    by: ["driverId"],
    where: {
      status: "DELIVERED",
      driverId: { not: null },
      updatedAt: { gte: start, lt: end },
    },
    _count: { _all: true },
  });

  const deliveriesByDriver = new Map<string, number>();
  for (const d of deliveries) {
    if (d.driverId) deliveriesByDriver.set(d.driverId, d._count._all);
  }
  if (deliveriesByDriver.size === 0) return [];

  const cityFilter =
    city.toLowerCase() === DEFAULT_CITY.toLowerCase()
      ? {
          OR: [
            { city: { equals: city, mode: "insensitive" as const } },
            { city: null },
          ],
        }
      : { city: { equals: city, mode: "insensitive" as const } };

  const drivers = await prisma.user.findMany({
    where: {
      role: "DRIVER",
      id: { in: Array.from(deliveriesByDriver.keys()) },
      driverRatingCount: { gt: 0 },
      ...cityFilter,
    },
    select: {
      id: true,
      name: true,
      city: true,
      driverScore: true,
      driverRatingCount: true,
    },
  });

  const sorted = drivers
    .map((d) => ({
      driverId: d.id,
      name: d.name || "Livreur MotoLink",
      city: d.city || DEFAULT_CITY,
      score: d.driverScore,
      ratingCount: d.driverRatingCount,
      deliveriesThisMonth: deliveriesByDriver.get(d.id) ?? 0,
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.deliveriesThisMonth - a.deliveriesThisMonth ||
        b.ratingCount - a.ratingCount
    )
    .slice(0, limit);

  return sorted.map((entry, idx) => ({
    ...entry,
    rank: idx + 1,
    isTopOfMonth: idx === 0,
  }));
}

/** Villes proposées dans le tableau d'honneur (villes des livreurs + ville par défaut). */
export async function getLeaderboardCities(): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: { role: "DRIVER", city: { not: null } },
    select: { city: true },
    distinct: ["city"],
  });
  const byKey = new Map<string, string>([[DEFAULT_CITY.toLowerCase(), DEFAULT_CITY]]);
  for (const r of rows) {
    const c = r.city?.trim();
    if (c && !byKey.has(c.toLowerCase())) byKey.set(c.toLowerCase(), c);
  }
  return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b, "fr"));
}
