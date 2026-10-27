// Rate limiter en mémoire : 60 requêtes / minute par vendeur
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const MAX_REQUESTS_PER_MINUTE = 60;
const ONE_MINUTE_MS = 60 * 1000;

export function checkFleetRateLimit(vendorId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(vendorId);
  if (!entry || now - entry.windowStart > ONE_MINUTE_MS) {
    rateLimitMap.set(vendorId, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= MAX_REQUESTS_PER_MINUTE) {
    return false;
  }
  entry.count += 1;
  return true;
}

export function resetFleetRateLimit(vendorId?: string) {
  if (vendorId) {
    rateLimitMap.delete(vendorId);
  } else {
    rateLimitMap.clear();
  }
}

// Cache des notifications "demande de disponibilité" (24h)
// Clé: `vendorId:driverId` -> timestamp
const offlineNotificationCache = new Map<string, number>();
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export function recordOfflineNotification(vendorId: string, driverId: string) {
  offlineNotificationCache.set(`${vendorId}:${driverId}`, Date.now());
}

export function canNotifyOffline(vendorId: string, driverId: string): boolean {
  const lastSent = offlineNotificationCache.get(`${vendorId}:${driverId}`);
  if (!lastSent) return true;
  return Date.now() - lastSent > TWENTY_FOUR_HOURS_MS;
}

