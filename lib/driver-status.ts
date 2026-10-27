/**
 * MotoLink - Gestion du statut livreur à 3 états :
 * AVAILABLE | ON_MISSION | OFFLINE
 * Fournit les helpers de transition, de traçabilité d'audit et de restauration après livraison.
 */

import { DriverStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import { logEvent } from "@/lib/audit";

/**
 * Met à jour manuellement ou programmatiquement le statut d'un livreur et enregistre l'audit log.
 */
export async function setDriverStatus(
  driverId: string,
  status: DriverStatus
): Promise<void> {
  const driver = await prisma.user.findUnique({
    where: { id: driverId },
    select: { id: true, driverStatus: true, role: true },
  });

  if (!driver || driver.role !== "DRIVER") {
    throw new Error("Livreur introuvable ou rôle invalide.");
  }

  const previousStatus = driver.driverStatus;
  if (previousStatus === status) {
    return;
  }

  await prisma.user.update({
    where: { id: driverId },
    data: { driverStatus: status },
  });

  try {
    await logEvent(
      "DRIVER_STATUS_CHANGED",
      "DRIVER",
      driverId,
      driverId,
      {
        previousStatus,
        newStatus: status,
      }
    );
  } catch (auditErr) {
    console.warn("[driver-status] Audit DRIVER_STATUS_CHANGED non-bloquant:", auditErr);
  }
}

/**
 * Récupère le statut actuel du livreur.
 */
export async function getDriverStatus(driverId: string): Promise<DriverStatus> {
  const driver = await prisma.user.findUnique({
    where: { id: driverId },
    select: { driverStatus: true },
  });
  return driver?.driverStatus || "OFFLINE";
}

/**
 * Passe automatiquement le livreur à ON_MISSION lors de l'acceptation d'une course.
 */
export async function setDriverOnMission(driverId: string): Promise<void> {
  await setDriverStatus(driverId, "ON_MISSION");
}

/**
 * Repasse le livreur en AVAILABLE (uniquement s'il n'était pas OFFLINE au départ).
 */
export async function setDriverAvailable(driverId: string): Promise<void> {
  await setDriverStatus(driverId, "AVAILABLE");
}

/**
 * Restaure le statut précédent du livreur après la fin ou l'annulation d'une mission.
 * Si le livreur était AVAILABLE avant d'accepter → repasse AVAILABLE.
 * Si le livreur était OFFLINE avant d'accepter → repasse OFFLINE.
 */
export async function restoreDriverStatusAfterMission(
  driverId: string,
  statusBeforeMission?: string | null
): Promise<DriverStatus> {
  const targetStatus: DriverStatus =
    statusBeforeMission === "AVAILABLE" ? "AVAILABLE" : "OFFLINE";

  await setDriverStatus(driverId, targetStatus);
  return targetStatus;
}

// Rate limiter en mémoire : max 10 changements par heure par livreur
const statusRateLimitMap = new Map<string, { count: number; firstAttempt: number }>();
const MAX_CHANGES_PER_HOUR = 10;
const ONE_HOUR_MS = 60 * 60 * 1000;

export function checkStatusRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = statusRateLimitMap.get(userId);
  if (!entry || now - entry.firstAttempt > ONE_HOUR_MS) {
    statusRateLimitMap.set(userId, { count: 1, firstAttempt: now });
    return true;
  }
  if (entry.count >= MAX_CHANGES_PER_HOUR) {
    return false;
  }
  entry.count += 1;
  return true;
}

export function resetStatusRateLimit(userId?: string) {
  if (userId) {
    statusRateLimitMap.delete(userId);
  } else {
    statusRateLimitMap.clear();
  }
}


