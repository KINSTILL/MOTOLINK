/**
 * MotoLink — N8 v2 : Délai négocié & ponctualité.
 *
 * Helpers purs (aucun accès base de données) :
 *  - haversineKm            : distance à vol d'oiseau entre deux coordonnées
 *  - estimateDurationMinutes : durée estimée (20 km/h + 10 min de marge, bornée 15-180)
 *  - isOnTime               : comparaison durée réelle / estimée avec tolérance
 *  - computeActualMinutes   : durée réelle entre deux horodatages
 *
 * Aucune de ces fonctions ne lève d'exception : elles sont tolérantes aux entrées
 * invalides (retour `0` ou `false`), et le calcul de ponctualité reste non bloquant.
 */

/** Vitesse moyenne retenue pour un deux-roues en ville (Douala). */
export const AVERAGE_SPEED_KMH = 20;
/** Marge fixe (prise en charge, embouteillages, remise). */
export const FIXED_MARGIN_MINUTES = 10;
/** Bornes de l'estimation (minutes). */
export const MIN_DURATION_MINUTES = 15;
export const MAX_DURATION_MINUTES = 180;
/** Délai additionnel accordé au livreur avant de considérer un retard. */
export const DEFAULT_TOLERANCE_MINUTES = 5;
/** Rayon terrestre moyen (km). */
const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Distance orthodromique (grand cercle) en kilomètres.
 * Retourne 0 si l'une des coordonnées est absente ou invalide.
 */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const coords = [lat1, lng1, lat2, lng2];
  if (coords.some((c) => typeof c !== "number" || !Number.isFinite(c))) {
    return 0;
  }
  if (Math.abs(lat1) > 90 || Math.abs(lat2) > 90) {
    return 0;
  }

  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(EARTH_RADIUS_KM * c * 100) / 100; // 2 décimales
}

/**
 * Estime la durée de livraison en minutes : `distance / 20 km/h * 60 + 10`,
 * bornée entre 15 et 180 minutes. Retourne 0 si la distance est inexploitable.
 */
export function estimateDurationMinutes(distanceKm: number): number {
  if (typeof distanceKm !== "number" || !Number.isFinite(distanceKm) || distanceKm <= 0) {
    return 0;
  }
  const raw = (distanceKm / AVERAGE_SPEED_KMH) * 60 + FIXED_MARGIN_MINUTES;
  return Math.min(
    MAX_DURATION_MINUTES,
    Math.max(MIN_DURATION_MINUTES, Math.round(raw))
  );
}

/**
 * Compare la durée réelle à la durée estimée en tenant compte d'une tolérance
 * (5 minutes par défaut). Une durée manquante ou invalide n'est jamais "à l'heure".
 */
export function isOnTime(
  actualMinutes: number,
  estimatedMinutes: number,
  toleranceMinutes: number = DEFAULT_TOLERANCE_MINUTES
): boolean {
  if (
    typeof actualMinutes !== "number" ||
    typeof estimatedMinutes !== "number" ||
    !Number.isFinite(actualMinutes) ||
    !Number.isFinite(estimatedMinutes) ||
    actualMinutes < 0 ||
    estimatedMinutes < 0
  ) {
    return false;
  }
  const tolerance =
    typeof toleranceMinutes === "number" && Number.isFinite(toleranceMinutes)
      ? Math.max(0, toleranceMinutes)
      : DEFAULT_TOLERANCE_MINUTES;
  return actualMinutes <= estimatedMinutes + tolerance;
}

/**
 * Durée réelle en minutes (arrondie à l'entier le plus proche) entre le
 * début et la fin. Retourne 0 si une date est absente, invalide ou antérieure.
 */
export function computeActualMinutes(start: Date, end: Date): number {
  if (!(start instanceof Date) || !(end instanceof Date)) {
    return 0;
  }
  const startMs = start.getTime();
  const endMs = end.getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return 0;
  }
  if (endMs <= startMs) {
    return 0;
  }
  return Math.round((endMs - startMs) / 60000);
}
