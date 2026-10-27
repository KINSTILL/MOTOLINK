import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logEvent } from "@/lib/audit";
import { decodeBase64DataUrl, uploadProofFile } from "@/lib/proof-pdf";
import { compressImageBase64 } from "@/lib/image-compression";
import {
  buildShortTrackingLink,
  normalizeChannel,
  sendNotification,
} from "@/lib/notifications";

const buyerUnreachableSchema = z.object({
  photoBase64: z.string().min(20, "Photo du client absent requise"),
  note: z.string().max(250).nullable().optional(),
});

/**
 * POST /api/missions/[id]/buyer-unreachable
 *
 * Le livreur signale que l'acheteur est injoignable (ne répond pas) :
 *  - enregistre l'horodatage buyerUnreachableAt,
 *  - téléverse la photo "client absent" (buyerUnreachablePhoto),
 *  - enregistre une note libre (buyerUnreachableNote),
 *  - notifie l'acheteur (WhatsApp/SMS) + journalise l'audit.
 *
 * Aucun blocage : le livreur reste libre de poursuivre la procédure.
 */
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
    const parsed = buyerUnreachableSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Photo du client absent obligatoire." },
        { status: 400 }
      );
    }

    const mission = await prisma.mission.findFirst({
      where: {
        OR: [{ id: params.id }, { publicToken: params.id }],
      },
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
        { error: "Seul le livreur assigné peut signaler un client absent." },
        { status: 403 }
      );
    }

    const { photoBase64, note } = parsed.data;

    // Upload de la photo "client absent" (compressée)
    let photoUrl: string;
    try {
      const compressed = await compressImageBase64(photoBase64, {
        maxSizeBytes: 1024 * 1024,
        maxWidthOrHeight: 1280,
      });
      const decoded = decodeBase64DataUrl(compressed);
      const ext = decoded.mimeType.includes("png") ? "png" : "jpg";
      photoUrl = await uploadProofFile(
        `unreachable_${mission.id}_${Date.now()}.${ext}`,
        decoded.buffer
      );
    } catch (uploadErr) {
      console.error(
        "[buyer-unreachable] Erreur upload photo client absent:",
        uploadErr
      );
      return NextResponse.json(
        { error: "Échec de l'enregistrement de la photo." },
        { status: 500 }
      );
    }

    const now = new Date();

    await prisma.mission.update({
      where: { id: mission.id },
      data: {
        buyerUnreachableAt: now,
        buyerUnreachablePhoto: photoUrl,
        buyerUnreachableNote: note?.trim() || null,
      },
    });

    await logEvent(
      "BUYER_UNREACHABLE_REPORTED",
      "MISSION",
      mission.id,
      session.userId,
      {
        buyerUnreachablePhoto: photoUrl,
        buyerUnreachableNote: note?.trim() || null,
      }
    );

    // Notification non-bloquante à l'acheteur
    try {
      const link = buildShortTrackingLink(mission.publicToken);
      const preferred = normalizeChannel(
        mission.vendor.preferredChannel || mission.vendor.notificationChannel
      );
      await sendNotification(
        mission.buyerPhone,
        "buyer_unreachable",
        {
          buyerName: mission.buyerName || "Client",
          driverName:
            mission.driver?.name || mission.driver?.phone || "Votre livreur",
          shopName:
            mission.vendor.shopName || mission.vendor.name || "MotoLink",
          link,
        },
        preferred
      );
    } catch (notifErr) {
      console.warn(
        "[buyer-unreachable] Échec notification acheteur:",
        notifErr
      );
    }

    return NextResponse.json({
      success: true,
      buyerUnreachableAt: now.toISOString(),
      buyerUnreachablePhoto: photoUrl,
    });
  } catch (error) {
    console.error(
      "[POST /api/missions/[id]/buyer-unreachable] Erreur:",
      error
    );
    return NextResponse.json(
      { error: "Erreur interne lors du signalement." },
      { status: 500 }
    );
  }
}
