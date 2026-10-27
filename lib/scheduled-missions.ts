import prisma from "@/lib/prisma";
import { logEvent } from "@/lib/audit";
import { normalizeChannel, sendNotification } from "@/lib/notifications";

export const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
export const ONE_HOUR_MS = 60 * 60 * 1000;
export const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export class ScheduledMissionError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ScheduledMissionError";
    this.status = status;
  }
}

/**
 * Valide que la date programmée est fixée au moins 2h dans le futur.
 */
export function validateScheduledDate(
  scheduledAtInput: string | Date,
  minHours = 2,
  referenceDate: Date = new Date()
): Date {
  const d = typeof scheduledAtInput === "string" ? new Date(scheduledAtInput) : scheduledAtInput;
  if (isNaN(d.getTime())) {
    throw new ScheduledMissionError(400, "Date de programmation invalide.");
  }
  const minRequiredMs = minHours * 60 * 60 * 1000;
  if (d.getTime() - referenceDate.getTime() < minRequiredMs - 1000) {
    throw new ScheduledMissionError(
      400,
      `La livraison programmée doit être fixée au moins ${minHours} heures à l'avance.`
    );
  }
  return d;
}

/**
 * Formate l'heure en fuseau horaire Cameroun / Douala (ex: "14h30")
 */
export function formatDoualaTime(date: Date): string {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Africa/Douala",
  }).format(date);
  return parts.replace(":", "h");
}

/**
 * Formate la date en fuseau horaire Cameroun / Douala (ex: "24/10/2026")
 */
export function formatDoualaDateOnly(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Africa/Douala",
  }).format(date);
}

export interface ReminderProcessResult {
  dayBeforeSent: number;
  oneHourSent: number;
  dueSent: number;
}

/**
 * Traite les rappels automatiques pour les missions programmées :
 * - J-1 (entre 12h et 24h avant l'échéance, typiquement vers 18h la veille)
 * - 1h avant l'échéance (fenêtre <= 60 minutes)
 * - Au moment de la course (échéance atteinte)
 */
export async function processScheduledMissionReminders(
  now: Date = new Date()
): Promise<ReminderProcessResult> {
  const result: ReminderProcessResult = {
    dayBeforeSent: 0,
    oneHourSent: 0,
    dueSent: 0,
  };

  // Récupère toutes les missions programmées non encore annulées ni livrées avec un livreur assigné
  const missions = await prisma.mission.findMany({
    where: {
      scheduledAt: { not: null },
      scheduledStatus: { in: ["pending", "assigned"] },
      status: { in: ["CREATED", "ACCEPTED"] },
      driverId: { not: null },
    },
    include: {
      driver: {
        select: {
          id: true,
          name: true,
          phone: true,
          preferredChannel: true,
          notificationChannel: true,
        },
      },
      vendor: {
        select: {
          id: true,
          shopName: true,
          name: true,
        },
      },
    },
  });

  const nowMs = now.getTime();

  for (const m of missions) {
    if (!m.scheduledAt || !m.driver) continue;
    const schedMs = m.scheduledAt.getTime();
    const diffMs = schedMs - nowMs;
    const shopName = m.vendor?.shopName || m.vendor?.name || "Votre vendeur";
    const driverPhone = m.driver.phone;
    const driverChannel = normalizeChannel(
      m.driver.preferredChannel || m.driver.notificationChannel
    );
    const scheduledTime = formatDoualaTime(m.scheduledAt);
    const scheduledDate = formatDoualaDateOnly(m.scheduledAt);
    const link = `https://motolink.cm/missions/${m.id}`;

    // 1. Rappel J-1 : Entre 1h et 24h avant (si diffMs <= 24h et scheduledReminderDayBeforeSent = false)
    if (diffMs > ONE_HOUR_MS && diffMs <= TWENTY_FOUR_HOURS_MS && !m.scheduledReminderDayBeforeSent) {
      await sendNotification(
        driverPhone,
        "scheduled_mission_reminder_day_before",
        {
          driverName: m.driver.name || "Livreur",
          shopName,
          scheduledTime,
          scheduledDate,
          link,
        },
        driverChannel
      );

      await prisma.mission.update({
        where: { id: m.id },
        data: { scheduledReminderDayBeforeSent: true },
      });

      await logEvent(
        "SCHEDULED_MISSION_REMINDER_SENT",
        "MISSION",
        m.id,
        null,
        {
          type: "DAY_BEFORE",
          driverId: m.driver.id,
          scheduledAt: m.scheduledAt.toISOString(),
        }
      );
      result.dayBeforeSent++;
    }

    // 2. Rappel 1h avant : Entre 0 et 1h avant (diffMs > 0 && diffMs <= 60 minutes)
    if (diffMs > 0 && diffMs <= ONE_HOUR_MS && !m.scheduledReminderOneHourSent) {
      await sendNotification(
        driverPhone,
        "scheduled_mission_reminder_one_hour",
        {
          driverName: m.driver.name || "Livreur",
          shopName,
          scheduledTime,
          link,
        },
        driverChannel
      );

      await prisma.mission.update({
        where: { id: m.id },
        data: { scheduledReminderOneHourSent: true },
      });

      await logEvent(
        "SCHEDULED_MISSION_REMINDER_SENT",
        "MISSION",
        m.id,
        null,
        {
          type: "ONE_HOUR",
          driverId: m.driver.id,
          scheduledAt: m.scheduledAt.toISOString(),
        }
      );
      result.oneHourSent++;
    }

    // 3. Rappel "C'est l'heure !" : Échéance atteinte (diffMs <= 0 et retard < 2h)
    if (diffMs <= 0 && diffMs >= -TWO_HOURS_MS && !m.scheduledReminderDueSent) {
      await sendNotification(
        driverPhone,
        "scheduled_mission_reminder_due",
        {
          driverName: m.driver.name || "Livreur",
          shopName,
          link,
        },
        driverChannel
      );

      await prisma.mission.update({
        where: { id: m.id },
        data: { scheduledReminderDueSent: true },
      });

      await logEvent(
        "SCHEDULED_MISSION_REMINDER_SENT",
        "MISSION",
        m.id,
        null,
        {
          type: "DUE",
          driverId: m.driver.id,
          scheduledAt: m.scheduledAt.toISOString(),
        }
      );
      result.dueSent++;
    }
  }

  return result;
}
