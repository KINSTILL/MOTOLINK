/**
 * MotoLink — Résolution centralisée des secrets sensibles.
 *
 * Objectif (audit P1-B) : supprimer les « secrets de repli » en production.
 * En production, une variable d'environnement manquante lève une erreur
 * explicite (fail-fast) au lieu d'utiliser silencieusement une valeur par
 * défaut connue publiquement.
 *
 * En développement / test, on conserve le repli historique afin de ne pas
 * casser l'expérience locale ni les suites de tests (qui n'injectent pas
 * tous les secrets).
 */

const IS_PRODUCTION = process.env.NODE_ENV === "production";

/**
 * Retourne le premier secret non vide parmi les variables d'environnement.
 * - En production : lève une erreur si aucun n'est défini.
 * - Hors production : retourne `devFallback` (comportement historique).
 */
export function requireEnvSecret(
  envNames: string[],
  devFallback: string,
  context: string
): string {
  for (const name of envNames) {
    const value = process.env[name];
    if (value && value.trim().length > 0) {
      const trimmed = value.trim();
      // Détecte les placeholders manifestement non configurés en production.
      if (IS_PRODUCTION && looksLikePlaceholder(trimmed)) {
        throw new Error(
          `[secrets] ${context} : la variable ${name} contient une valeur de test/placeholder en production.`
        );
      }
      return trimmed;
    }
  }

  if (IS_PRODUCTION) {
    throw new Error(
      `[secrets] ${context} : variable(s) d'environnement manquante(s) en production (attendu : ${envNames.join(
        " ou "
      )}).`
    );
  }

  return devFallback;
}

/**
 * Heuristique de détection de valeurs de test laissées par erreur.
 */
export function looksLikePlaceholder(value: string): boolean {
  const v = value.toLowerCase();
  return (
    v.includes("sample") ||
    v.includes("test") ||
    v.includes("placeholder") ||
    v.includes("default") ||
    v.includes("your-") ||
    v.includes("xxxx") ||
    v === "changeme"
  );
}
