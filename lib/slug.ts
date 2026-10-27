import prisma from "@/lib/prisma";
import { logEvent } from "@/lib/audit";

/**
 * Normalise une chaîne en slug URL :
 * minuscules, sans accents, caractères alphanumériques et tirets uniquement.
 */
export function slugify(text: string): string {
  if (!text) return "boutique";

  const slug = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Supprime les diacritiques/accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // Remplace tout caractère non-alphanumérique par un tiret
    .replace(/^-+|-+$/g, "") // Supprime les tirets en début et fin
    .trim();

  return slug.length > 0 ? slug : "boutique";
}

/**
 * Génère un slug public unique pour un vendeur.
 * Si le vendeur possède déjà un slug, le retourne tel quel (slug immuable).
 * En cas de collision avec un autre utilisateur, ajoute un suffixe numérique (-2, -3, ...).
 */
export async function generatePublicSlug(
  shopName: string | null | undefined,
  userId: string
): Promise<string> {
  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { publicSlug: true },
  });

  if (existingUser?.publicSlug) {
    return existingUser.publicSlug;
  }

  const baseSlug = slugify(shopName || "boutique");
  let candidateSlug = baseSlug;
  let counter = 1;

  while (true) {
    const collision = await prisma.user.findUnique({
      where: { publicSlug: candidateSlug },
      select: { id: true },
    });

    if (!collision || collision.id === userId) {
      break;
    }

    counter++;
    candidateSlug = `${baseSlug}-${counter}`;
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      publicSlug: candidateSlug,
      publicSlugCreatedAt: new Date(),
    },
  });

  await logEvent("PUBLIC_SLUG_CREATED", "USER", userId, userId, {
    publicSlug: candidateSlug,
    shopName: shopName || null,
  });

  return candidateSlug;
}

/**
 * Assure qu'un vendeur possède un publicSlug, le génère si manquant.
 */
export async function ensureVendorPublicSlug(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, shopName: true, name: true, publicSlug: true },
  });

  if (!user || user.role !== "VENDOR") {
    return null;
  }

  if (user.publicSlug) {
    return user.publicSlug;
  }

  return generatePublicSlug(user.shopName || user.name || "Boutique", user.id);
}

