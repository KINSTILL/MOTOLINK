import crypto from "crypto";
import prisma from "@/lib/prisma";

/**
 * MotoLink — N6 : Carnet de bord public du livreur.
 *
 * Expose uniquement des informations NON sensibles :
 * nom, note moyenne, nombre de livraisons, badges, zones déclarées.
 * JAMAIS : téléphone, email, coordonnées bancaires, position GPS.
 */

const SLUG_MAX_BASE = 20;

/**
 * Génère un slug à partir du nom du livreur :
 * - minuscules, accents retirés
 * - caractères non alphanumériques → "-"
 * - suffixe aléatoire hex (4 chars) pour l'unicité
 */
export function generateSlug(name: string): string {
  const base =
    (name || "driver")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // retire accents
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, SLUG_MAX_BASE) || "driver";
  const suffix = crypto.randomBytes(2).toString("hex"); // 4 chars
  return `${base}-${suffix}`;
}

export interface CarnetBadges {
  kycVerified: boolean;
  syndicate: boolean;
  enrolled: boolean;
  /** "sponsor" | "sponsor_confirmed" | "sponsor_gold" | "sponsor_platinum" | null */
  sponsor: string | null;
}

export interface CarnetPublic {
  slug: string;
  name: string;
  photoUrl: string | null;
  initials: string;
  ratingAverage: number;
  ratingCount: number;
  deliveredCount: number;
  badges: CarnetBadges;
  zones: string | null;
}

/** Transforme un nom en initiales (max 2 lettres). */
export function makeInitials(name: string): string {
  return (
    name
      .split(" ")
      .map((s) => s[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "ML"
  );
}

/**
 * Récupère le carnet public d'un livreur par son slug.
 * Ne retourne un résultat que si le carnet est visible et l'utilisateur est un livreur.
 * Aucun champ sensible n'est sélectionné ni renvoyé.
 */
export async function getCarnetBySlug(
  slug: string
): Promise<CarnetPublic | null> {
  if (!slug) return null;

  const user = await prisma.user.findFirst({
    where: {
      driverSlug: slug,
      carnetVisible: true,
      role: "DRIVER",
    },
    select: {
      id: true,
      name: true,
      driverSlug: true,
      carnetZones: true,
      kycStatus: true,
      referrerBadge: true,
    },
  });

  if (!user) return null;

  const [ratings, deliveredCount, kycDocs] = await Promise.all([
    prisma.rating.findMany({
      where: { toUserId: user.id },
      select: { score: true },
    }),
    prisma.mission.count({
      where: { driverId: user.id, status: "DELIVERED" },
    }),
    prisma.kycDocument.findMany({
      where: { userId: user.id, status: "VERIFIED" },
      select: { type: true },
    }),
  ]);

  const ratingCount = ratings.length;
  const ratingAverage =
    ratingCount > 0
      ? Math.round(
          (ratings.reduce((s, r) => s + r.score, 0) / ratingCount) * 10
        ) / 10
      : 0;

  const kycTypes = new Set(kycDocs.map((d) => d.type));

  const name = user.name || "Livreur MotoLink";
  const initials = makeInitials(name);

  return {
    slug: user.driverSlug!,
    name,
    photoUrl: null, // à brancher plus tard si User.photoUrl existe
    initials,
    ratingAverage,
    ratingCount,
    deliveredCount,
    badges: {
      kycVerified: kycTypes.has("ID_CARD") || user.kycStatus === "VERIFIED",
      syndicate: kycTypes.has("SYNDICATE_CARD"),
      enrolled: kycTypes.has("ENROLLMENT_CERT"),
      sponsor: user.referrerBadge,
    },
    zones: user.carnetZones,
  };
}
