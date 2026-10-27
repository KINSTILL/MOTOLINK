import { NextResponse } from "next/server";

/**
 * MotoLink — Garde d'authentification des routes cron (audit P1-C).
 *
 * Chaque route `/api/cron/*` doit être protégée par un secret partagé
 * pour empêcher tout déclenchement public (et donc des abus de calcul /
 * d'envoi de notifications).
 *
 * Comportement :
 * - Si `CRON_SECRET` est défini : l'en-tête `Authorization: Bearer <secret>`
 *   est obligatoire (sinon 401).
 * - Si `CRON_SECRET` n'est PAS défini (dev local) : l'accès est autorisé afin
 *   de ne pas casser le développement ni les suites de tests.
 *
 * Retourne `null` si la requête est autorisée, sinon un `NextResponse` 401.
 */
export function guardCron(request: Request): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;

  // Pas de secret configuré (env de dev) → accès libre (comportement historique).
  if (!cronSecret) {
    return null;
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  return null;
}
