import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logEvent } from "@/lib/audit";
import { restoreDriverStatusAfterMission } from "@/lib/driver-status";
import {
  buildShortTrackingLink,
  normalizeChannel,
  sendNotification,
} from "@/lib/notifications";
import { decodeBase64DataUrl, uploadProofFile } from "@/lib/proof-pdf";
import { compressImageBase64 } from "@/lib/image-compression";

const checkpointSchema = z.object({
  type: z.enum([
    "PICKED_UP",
    "IN_TRANSIT",
    "NEARBY",
    "DELIVERED",
    "CUSTOM",
  ]),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  note: z.string().max(250).nullable().optional(),
  photoBase64: z.string().nullable().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== "DRIVER") {
      return NextResponse.json(
        { error: "Accès réservé aux livreurs." },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = checkpointSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Type de jalon invalide." },
        { status: 400 }
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
        driver: {
          select: {
            id: true,
            name: true,
            phone: true,
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

    if (mission.driverId !== session.userId) {
      return NextResponse.json(
        { error: "Seul le livreur assigné à cette mission peut ajouter un jalon." },
        { status: 403 }
      );
    }

    const { type, lat, lng, note, photoBase64 } = parsed.data;
    const hasGps = typeof lat === "number" && typeof lng === "number";

    // 1. Validation stricte de la photo de prise en charge pour PICKED_UP
    let pickupPhotoUrl: string | null = null;
    if (type === "PICKED_UP") {
      if (!photoBase64 || photoBase64.trim().length < 20) {
        return NextResponse.json(
          { error: "Photo de prise en charge obligatoire" },
          { status: 400 }
        );
      }

      try {
        const compressed = await compressImageBase64(photoBase64, {
          maxSizeBytes: 1024 * 1024,
          maxWidthOrHeight: 1280,
        });
        const decoded = decodeBase64DataUrl(compressed);
        const ext = decoded.mimeType.includes("png") ? "png" : "jpg";
        pickupPhotoUrl = await uploadProofFile(
          `pickup_${mission.id}_${Date.now()}.${ext}`,
          decoded.buffer
        );
      } catch (uploadErr) {
        console.error("[checkpoint] Erreur upload photo prise en charge:", uploadErr);
        return NextResponse.json(
          { error: "Échec de l'enregistrement de la photo de prise en charge." },
          { status: 500 }
        );
      }
    }

    const previousStatus = mission.status;
    let nextStatus = mission.status;

    if (type === "DELIVERED") {
      nextStatus = "DELIVERED";
    } else if (
      type === "PICKED_UP" ||
      type === "IN_TRANSIT" ||
      type === "NEARBY"
    ) {
      nextStatus = "IN_PROGRESS";
    }

    const result = await prisma.$transaction(async (tx) => {
      const checkpoint = await tx.checkpoint.create({
        data: {
          missionId: mission.id,
          type,
          lat: hasGps ? lat : null,
          lng: hasGps ? lng : null,
          photoUrl: pickupPhotoUrl,
          note:
            note?.trim() ||
            (!hasGps ? "Position GPS non disponible (jalon partiel)" : null),
        },
      });

      const updatedMission = await tx.mission.update({
        where: { id: mission.id },
        data: {
          status: nextStatus,
        },
      });

      return { checkpoint, updatedMission };
    });

    if (nextStatus === "DELIVERED" && mission.driverId) {
      try {
        await restoreDriverStatusAfterMission(
          mission.driverId,
          mission.driverStatusBeforeMission
        );
      } catch (statusErr) {
        console.warn("[checkpoint] Échec restauration statut livreur:", statusErr);
      }
    }

    // Journal d'audit statut modifié
    await logEvent(
      "MISSION_STATUS_CHANGED",
      "MISSION",
      mission.id,
      session.userId,
      {
        checkpointId: result.checkpoint.id,
        checkpointType: type,
        previousStatus,
        newStatus: nextStatus,
        partialGps: !hasGps,
        hasPickupPhoto: Boolean(pickupPhotoUrl),
      }
    );

    // Spécificités par type de jalon :
    // CAS 1 : PICKED_UP
    if (type === "PICKED_UP") {
      return NextResponse.json(
        {
          checkpoint: result.checkpoint,
          photoUrl: pickupPhotoUrl,
          missionStatus: result.updatedMission.status,
          partial: !hasGps,
        },
        { status: 201 }
      );
    }

    // CAS 2 : NEARBY
    if (type === "NEARBY") {
      // Audit log spécifique BUYER_CONTACT_VIEWED
      try {
        await logEvent(
          "BUYER_CONTACT_VIEWED",
          "MISSION",
          mission.id,
          session.userId,
          {
            buyerPhone: mission.buyerPhone,
            checkpointId: result.checkpoint.id,
          }
        );
      } catch (auditErr) {
        console.warn("[checkpoint] Audit BUYER_CONTACT_VIEWED:", auditErr);
      }

      const driverName =
        mission.driver?.name || mission.driver?.phone || "Votre livreur";
      const buyerName = mission.buyerName || "Client";
      const publicLink = `https://motolink.cm/s/${mission.publicToken}`;
      const messageTemplate = `Bonjour ${buyerName}, votre livreur ${driverName} est arrivé avec votre colis. Confirmez-vous être sur place ? Suivez ici : ${publicLink}`;

      return NextResponse.json(
        {
          checkpoint: result.checkpoint,
          missionStatus: result.updatedMission.status,
          buyerContact: {
            phone: mission.buyerPhone,
            name: mission.buyerName,
          },
          messageTemplate,
          buyerPresenceConfirmed: mission.buyerPresenceConfirmedAt !== null,
          partial: !hasGps,
        },
        { status: 201 }
      );
    }

    // CAS 3 : DELIVERED
    if (type === "DELIVERED") {
      try {
        const link = buildShortTrackingLink(mission.publicToken);
        const preferred = normalizeChannel(
          mission.vendor.preferredChannel || mission.vendor.notificationChannel
        );
        await sendNotification(
          mission.buyerPhone,
          "delivered",
          {
            buyerName: mission.buyerName || "Client",
            shopName:
              mission.vendor.shopName || mission.vendor.name || "MotoLink",
            link,
          },
          preferred
        );
      } catch (notifErr) {
        console.error(
          "[POST /api/missions/[id]/checkpoint] Erreur notification delivered:",
          notifErr
        );
      }
    }

    // CAS PAR DÉFAUT (IN_TRANSIT, CUSTOM, etc.)
    return NextResponse.json(
      {
        checkpoint: result.checkpoint,
        missionStatus: result.updatedMission.status,
        partial: !hasGps,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/missions/[id]/checkpoint] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur serveur lors de l'enregistrement du jalon." },
      { status: 500 }
    );
  }
}
