import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logEvent } from "@/lib/audit";
import { getActiveSubscription } from "@/lib/notchpay";
import {
  formatDoualaDateOnly,
  formatDoualaTime,
  TWO_HOURS_MS,
  validateScheduledDate,
} from "@/lib/scheduled-missions";
import { normalizeChannel, sendNotification } from "@/lib/notifications";

const rescheduleSchema = z.object({
  scheduledAt: z.string().min(1, "Nouvelle date/heure requise"),
});

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    if (session.role !== "VENDOR") {
      return NextResponse.json(
        { error: "Seul le vendeur propriétaire peut reprogrammer la mission." },
        { status: 403 }
      );
    }

    const activeSub = await getActiveSubscription(session.userId);
    if (!activeSub) {
      return NextResponse.json(
        { error: "Abonnement actif requis pour reprogrammer une livraison." },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = rescheduleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Format de date/heure invalide." },
        { status: 400 }
      );
    }

    const mission = await prisma.mission.findUnique({
      where: { id: params.id },
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

    if (!mission) {
      return NextResponse.json(
        { error: "Mission introuvable." },
        { status: 404 }
      );
    }

    if (mission.vendorId !== session.userId) {
      return NextResponse.json(
        { error: "Vous n'êtes pas le propriétaire de cette mission." },
        { status: 403 }
      );
    }

    if (mission.status === "DELIVERED" || mission.status === "CANCELLED" || mission.scheduledStatus === "cancelled") {
      return NextResponse.json(
        { error: "Impossible de reprogrammer une mission terminée ou annulée." },
        { status: 400 }
      );
    }

    // Règle des 2h : Si la mission est déjà programmée, on ne peut plus la modifier moins de 2h avant
    if (mission.scheduledAt) {
      const currentDiffMs = mission.scheduledAt.getTime() - Date.now();
      if (currentDiffMs < TWO_HOURS_MS) {
        return NextResponse.json(
          { error: "La mission est verrouillée à moins de 2h de l'échéance." },
          { status: 400 }
        );
      }
    }

    // Valider la nouvelle date : doit être >= 2h dans le futur
    let newScheduledDate: Date;
    try {
      newScheduledDate = validateScheduledDate(parsed.data.scheduledAt);
    } catch (err: any) {
      return NextResponse.json(
        { error: err?.message || "La nouvelle date doit être fixée au moins 2h à l'avance." },
        { status: 400 }
      );
    }

    const previousScheduledAt = mission.scheduledAt;

    // Mise à jour en base et réinitialisation des drapeaux de rappel
    const updated = await prisma.mission.update({
      where: { id: mission.id },
      data: {
        scheduledAt: newScheduledDate,
        scheduledReminderDayBeforeSent: false,
        scheduledReminderOneHourSent: false,
        scheduledReminderDueSent: false,
      },
    });

    // Journal d'audit
    await logEvent(
      "MISSION_RESCHEDULED",
      "MISSION",
      mission.id,
      session.userId,
      {
        previousScheduledAt: previousScheduledAt?.toISOString() || null,
        newScheduledAt: newScheduledDate.toISOString(),
      }
    );

    // Notification au coursier si assigné
    if (mission.driver) {
      const shopName = mission.vendor?.shopName || mission.vendor?.name || "Votre vendeur";
      const scheduledTime = formatDoualaTime(newScheduledDate);
      const scheduledDate = formatDoualaDateOnly(newScheduledDate);
      const channel = normalizeChannel(
        mission.driver.preferredChannel || mission.driver.notificationChannel
      );

      await sendNotification(
        mission.driver.phone,
        "scheduled_mission_rescheduled",
        {
          driverName: mission.driver.name || "Livreur",
          shopName,
          scheduledTime,
          scheduledDate,
          link: `https://motolink.cm/missions/${mission.id}`,
        },
        channel
      );
    }

    return NextResponse.json({
      success: true,
      mission: {
        id: updated.id,
        scheduledAt: updated.scheduledAt?.toISOString(),
        scheduledStatus: updated.scheduledStatus,
      },
    });
  } catch (error) {
    console.error("[PATCH /api/missions/[id]/reschedule] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur lors de la reprogrammation de la mission." },
      { status: 500 }
    );
  }
}
