import crypto from "crypto";

/**
 * Confirmation de commande par le vendeur (appel / WhatsApp) et par l'acheteur (lien).
 *
 * ⚠️ MotoLink enregistre uniquement l'horodatage du CLIC sur « Appeler » / « WhatsApp ».
 * Rien ne prouve que l'appel a abouti : le vendeur reste seul responsable (CGU Art. 24).
 */

export const CALL_METHODS = ["tel", "whatsapp"] as const;
export type CallMethod = (typeof CALL_METHODS)[number];

/** Token de confirmation acheteur : 16 octets aléatoires → 32 caractères hexadécimaux. */
export function generateBuyerConfirmToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

/** Comparaison à temps constant du token stocké et du token reçu. */
export function verifyBuyerConfirmToken(
  stored: string | null | undefined,
  provided: string | null | undefined
): boolean {
  if (!stored || !provided) return false;
  const a = Buffer.from(stored);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export interface OrderConfirmationData {
  callInitiatedAt: Date | null;
  callMethod: CallMethod | null;
  callTarget: string | null;
}

export type ParseOrderConfirmationResult =
  | { ok: true; data: OrderConfirmationData }
  | { ok: false; error: string; status: number };

const CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_CALL_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Lit et valide les champs de confirmation du body de POST /api/missions.
 * - orderConfirmed doit valoir exactement `true`
 * - callInitiatedAt / callMethod / callTarget sont optionnels (« Continuer sans appeler »)
 */
export function parseOrderConfirmation(body: any): ParseOrderConfirmationResult {
  if (body?.orderConfirmed !== true) {
    return { ok: false, error: "Veuillez confirmer la commande", status: 400 };
  }

  const rawAt = body?.callInitiatedAt;
  const rawMethod = body?.callMethod;
  const rawTarget = body?.callTarget;

  const hasAt = rawAt !== undefined && rawAt !== null && rawAt !== "";
  const hasMethod = rawMethod !== undefined && rawMethod !== null && rawMethod !== "";

  if (!hasAt && !hasMethod) {
    return {
      ok: true,
      data: { callInitiatedAt: null, callMethod: null, callTarget: null },
    };
  }

  if (!hasAt || !hasMethod) {
    return {
      ok: false,
      error: "callInitiatedAt et callMethod doivent être fournis ensemble.",
      status: 400,
    };
  }

  if (!CALL_METHODS.includes(rawMethod)) {
    return {
      ok: false,
      error: "callMethod invalide (attendu : tel ou whatsapp).",
      status: 400,
    };
  }

  const parsedAt = new Date(rawAt);
  if (Number.isNaN(parsedAt.getTime())) {
    return { ok: false, error: "callInitiatedAt invalide.", status: 400 };
  }

  const now = Date.now();
  if (now - parsedAt.getTime() > MAX_CALL_AGE_MS) {
    return {
      ok: false,
      error: "callInitiatedAt trop ancien (plus de 24h).",
      status: 400,
    };
  }
  // Tolère une petite dérive d'horloge du téléphone, sans accepter une date réellement future
  if (parsedAt.getTime() > now + CLOCK_SKEW_MS) {
    return { ok: false, error: "callInitiatedAt ne peut pas être dans le futur.", status: 400 };
  }
  const callInitiatedAt = parsedAt.getTime() > now ? new Date(now) : parsedAt;

  const callTarget =
    typeof rawTarget === "string" && rawTarget.trim().length > 0
      ? rawTarget.trim().slice(0, 20)
      : null;

  return {
    ok: true,
    data: { callInitiatedAt, callMethod: rawMethod, callTarget },
  };
}

// ─── Rate limiting de la confirmation publique (par IP) ──────────────────────
const confirmRateLimitMap = new Map<string, { count: number; resetAt: number }>();
const CONFIRM_MAX_ATTEMPTS = 10;
const CONFIRM_WINDOW_MS = 15 * 60 * 1000;

export function checkBuyerConfirmRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = confirmRateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    confirmRateLimitMap.set(ip, { count: 1, resetAt: now + CONFIRM_WINDOW_MS });
    return true;
  }
  if (entry.count >= CONFIRM_MAX_ATTEMPTS) return false;
  entry.count += 1;
  return true;
}

export function resetBuyerConfirmRateLimit(ip?: string) {
  if (ip) confirmRateLimitMap.delete(ip);
  else confirmRateLimitMap.clear();
}
