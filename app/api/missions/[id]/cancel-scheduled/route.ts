import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logEvent } from "@/lib/audit";
import {
  formatDoualaDateOnly,
  formatDoualaTime,
  TWO_HOURS_MS,
} from "@/lib/scheduled-missions";
import { normalizeChannel, sendNotification } from "@/lib/notifications";

const cancelSchema = z.object({
  reason: z.string().trim().max(300).optional(),
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

    const body = await request.json().catch(() => ({}));
    const parsed = cancelSchema.safeParse(body);
    const reason = parsed.success ? parsed.data.reason : undefined;

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
            phone: true,
            preferredChannel: true,
            notificationChannel: true,
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

    const isVendor = session.userId === mission.vendorId;
    const isDriver = mission.driverId && session.userId === mission.driverId;

    if (!isVendor && !isDriver) {
      return NextResponse.json(
        { error: "Vous n'êtes pas partie prenante de cette mission." },
        { status: 403 }
      );
    }

    if (mission.status === "DELIVERED" || mission.status === "CANCELLED" || mission.scheduledStatus === "cancelled") {
      return NextResponse.json(
        { error: "La mission est déjà terminée ou annulée." },
        { status: 400 }
      );
    }

    // Contrôle strict de la règle des 2h
    if (mission.scheduledAt) {
      const diffMs = mission.scheduledAt.getTime() - Date.now();
      if (diffMs < TWO_HOURS_MS) {
        return NextResponse.json(
          {
            error:
              "Impossible d'annuler ou refuser une mission programmée moins de 2 heures avant l'échéance. La mission est verrouillée.",
          },
          { status: 400 }
        );
      }
    }

    const scheduledDateStr = mission.scheduledAt
      ? formatDoualaDateOnly(mission.scheduledAt)
      : "";
    const scheduledTimeStr = mission.scheduledAt
      ? formatDoualaTime(mission.scheduledAt)
      : "";

    if (isVendor) {
      // Le vendeur annule complètement la mission
      await prisma.mission.update({
        where: { id: mission.id },
        data: {
          status: "CANCELLED",
          scheduledStatus: "cancelled",
          scheduledCancelledReason: reason || "Annulée par le vendeur",
        },
      });

      // Notification au livreur si assigné
      if (mission.driver) {
        const channel = normalizeChannel(
          mission.driver.preferredChannel || mission.driver.notificationChannel
        );
        const shopName = mission.vendor?.shopName || mission.vendor?.name || "Votre vendeur";

        await sendNotification(
          mission.driver.phone,
          "scheduled_mission_cancelled",
          {
            shopName,
            scheduledDate: scheduledDateStr,
            scheduledTime: scheduledTimeStr,
          },
          channel
        );
      }
    } else {
      // Le livreur refuse / se désiste plus de 2h avant : la mission est libérée et retourne en attente
      await prisma.mission.update({
        where: { id: mission.id },
        data: {
          driverId: null,
          status: "CREATED",
          scheduledStatus: "pending",
          scheduledCancelledReason: reason || "Refusée par le livreur (plus de 2h avant)",
        },
      });

      // Notification au vendeur pour l'informer du désistement
      if (mission.vendor) {
        const vendorChannel = normalizeChannel(
          mission.vendor.preferredChannel || mission.vendor.notificationChannel
        );
        const driverName = mission.driver?.name || "Le livreur";

        await sendNotification(
          mission.vendor.phone,
          "scheduled_mission_cancelled",
          {
            shopName: driverName,
            scheduledDate: scheduledDateStr,
            scheduledTime: scheduledTimeStr,
          },
          vendorChannel
        );
      }
    }

    // Journal d'audit
    await logEvent(
      "SCHEDULED_MISSION_CANCELLED",
      "MISSION",
      mission.id,
      session.userId,
      {
        cancelledBy: session.role,
        isVendor,
        reason: reason || null,
        scheduledAt: mission.scheduledAt?.toISOString() || null,
      }
    );

    return NextResponse.json({
      success: true,
      message: isVendor
        ? "Mission programmée annulée avec succès."
        : "Vous avez décliné la mission programmée. Elle a été remise en recherche de livreur.",
    });
  } catch (error) {
    console.error("[PATCH /api/missions/[id]/cancel-scheduled] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'annulation de la mission programmée." },
      { status: 500 }
    );
  }
}
