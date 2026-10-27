import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import {
  buildShortTrackingLink,
  normalizeChannel,
  sendNotification,
} from "@/lib/notifications";
import { getActiveSubscription } from "@/lib/notchpay";
import { logEvent } from "@/lib/audit";
import { setDriverOnMission } from "@/lib/driver-status";
import { usePriorityMission } from "@/lib/referral";

async function handleAcceptMission(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // N8 v2 — corps optionnel : le livreur doit accepter explicitement le délai s'il existe
    const body = await request.json().catch(() => ({} as any));
    const acceptDuration = body?.acceptDuration === true;

    const session = await getSession();
    if (!session || session.role !== "DRIVER") {
      return NextResponse.json(
        { error: "Accès réservé aux livreurs." },
        { status: 403 }
      );
    }

    // Vérifie que le livreur a une Subscription ACTIVE
    const activeSub = await getActiveSubscription(session.userId);
    if (!activeSub) {
      return NextResponse.json(
        { error: "Abonnez-vous pour accepter des missions" },
        { status: 403 }
      );
    }

    const driver = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        name: true,
        phone: true,
        kycStatus: true,
        verified: true,
        driverStatus: true,
      },
    });

    if (!driver || driver.kycStatus !== "VERIFIED") {
      return NextResponse.json(
        { error: "Complétez votre vérification d'identité" },
        { status: 403 }
      );
    }

    const mission = await prisma.mission.findUnique({
      where: { id: params.id },
      include: {
        vendor: {
          select: {
            shopName: true,
            name: true,
            preferredChannel: true,
            notificationChannel: true,
          },
        },
      },
    });

    if (!mission || mission.status !== "CREATED" || mission.driverId) {
      return NextResponse.json(
        { error: "Cette mission n'est plus disponible." },
        { status: 409 }
      );
    }

    // N8 v2 — Un délai négocié avec l'acheteur doit être accepté explicitement.
    const requiresDurationAcceptance =
      mission.estimatedDurationMinutes !== null &&
      mission.estimatedDurationMinutes !== undefined;
    if (requiresDurationAcceptance) {
      if (!acceptDuration) {
        return NextResponse.json(
          {
            error: "requiresDurationAcceptance",
            message:
              "Vous devez accepter explicitement le délai de livraison convenu avec l'acheteur.",
            estimatedDurationMinutes: mission.estimatedDurationMinutes,
          },
          { status: 400 }
        );
      }
    }

    const driverAcceptedDurationAt = requiresDurationAcceptance
      ? new Date()
      : null;

    const updated = await prisma.mission.update({
      where: { id: mission.id },
      data: {
        driverId: driver.id,
        status: "ACCEPTED",
        driverStatusBeforeMission: driver.driverStatus,
        ...(requiresDurationAcceptance
          ? {
              driverAcceptedDuration: true,
              driverAcceptedDurationAt,
            }
          : {}),
      },
    });

    // Passage automatique du statut du livreur à ON_MISSION
    await setDriverOnMission(driver.id);

    // Décompte de la mission prioritaire si parrainé par ce vendeur
    let priorityMissionUsed = false;
    try {
      priorityMissionUsed = await usePriorityMission(driver.id, mission.id, mission.vendorId);
    } catch (priorityErr) {
      console.warn("[accept] Erreur décompte mission prioritaire:", priorityErr);
    }

    await logEvent(
      "MISSION_STATUS_CHANGED",
      "MISSION",
      mission.id,
      driver.id,
      {
        previousStatus: mission.status,
        newStatus: "ACCEPTED",
        driverId: driver.id,
      }
    );

    // N8 v2 — Audit : acceptation explicite du délai convenu
    if (driverAcceptedDurationAt) {
      try {
        await logEvent(
          "DRIVER_ACCEPTED_DURATION",
          "MISSION",
          mission.id,
          driver.id,
          {
            estimatedDurationMinutes: mission.estimatedDurationMinutes,
            driverAcceptedDurationAt: driverAcceptedDurationAt.toISOString(),
          }
        );
      } catch (auditErr) {
        console.error("[accept] Audit DRIVER_ACCEPTED_DURATION:", auditErr);
      }
    }

    // Notification "driver_assigned" non-bloquante
    try {
      const link = buildShortTrackingLink(mission.publicToken);
      const preferred = normalizeChannel(
        mission.vendor.preferredChannel || mission.vendor.notificationChannel
      );
      await sendNotification(
        mission.buyerPhone,
        "driver_assigned",
        {
          buyerName: mission.buyerName || "Client",
          shopName:
            mission.vendor.shopName || mission.vendor.name || "MotoLink",
          driverName: driver.name || driver.phone,
          link,
        },
        preferred
      );
    } catch (notifErr) {
      console.error("[accept] Notification non-bloquante échouée:", notifErr);
    }

    return NextResponse.json({
      mission: updated,
      priorityMissionUsed,
    });
  } catch (error) {
    console.error("[/api/missions/[id]/accept] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'acceptation de la mission." },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  context: { params: { id: string } }
) {
  return handleAcceptMission(request, context);
}

export async function PATCH(
  request: Request,
  context: { params: { id: string } }
) {
  return handleAcceptMission(request, context);
}

