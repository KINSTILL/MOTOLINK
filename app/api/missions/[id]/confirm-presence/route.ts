import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logEvent } from "@/lib/audit";
import { normalizeChannel, sendNotification } from "@/lib/notifications";

// Rate limiter en mémoire : max 3 tentatives par mission
const rateLimitMap = new Map<string, { count: number; firstAttempt: number }>();
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(missionId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(missionId);

  if (!entry || now - entry.firstAttempt > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(missionId, { count: 1, firstAttempt: now });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count++;
  return true;
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const missionId = params.id;

    if (!checkRateLimit(missionId)) {
      return NextResponse.json(
        { error: "Nombre maximal de tentatives de confirmation atteint (3 max)." },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { publicToken } = body;

    if (!publicToken || typeof publicToken !== "string") {
      return NextResponse.json(
        { error: "Jeton public requis." },
        { status: 400 }
      );
    }

    const mission = await prisma.mission.findUnique({
      where: { id: missionId },
      include: {
        driver: {
          select: {
            id: true,
            phone: true,
            name: true,
            notificationChannel: true,
            preferredChannel: true,
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

    // Vérification stricte du jeton public
    if (mission.publicToken !== publicToken) {
      return NextResponse.json(
        { error: "Jeton public non valide pour cette mission." },
        { status: 403 }
      );
    }

    // Vérification du statut de la mission
    if (mission.status !== "IN_PROGRESS" && mission.status !== "ACCEPTED") {
      return NextResponse.json(
        { error: "La mission n'est pas en cours de livraison." },
        { status: 400 }
      );
    }

    // Si déjà confirmé, retour idempotent 200
    if (mission.buyerPresenceConfirmedAt) {
      return NextResponse.json({
        success: true,
        alreadyConfirmed: true,
        confirmedAt: mission.buyerPresenceConfirmedAt,
        message: "Présence déjà confirmée.",
      });
    }

    const confirmedAt = new Date();

    // Mise à jour mission et création du checkpoint BUYER_CONFIRMED_PRESENCE
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.mission.update({
        where: { id: mission.id },
        data: {
          buyerPresenceConfirmedAt: confirmedAt,
        },
      });

      const checkpoint = await tx.checkpoint.create({
        data: {
          missionId: mission.id,
          type: "BUYER_CONFIRMED_PRESENCE",
          note: "L'acheteur a confirmé sa présence sur les lieux.",
        },
      });

      return { updated, checkpoint };
    });

    // Journal d'audit BUYER_PRESENCE_CONFIRMED
    await logEvent(
      "BUYER_PRESENCE_CONFIRMED",
      "MISSION",
      mission.id,
      mission.driverId,
      {
        checkpointId: result.checkpoint.id,
        confirmedAt: confirmedAt.toISOString(),
      }
    );

    // Notification au livreur si assigné
    if (mission.driver) {
      try {
        const preferred = normalizeChannel(
          mission.driver.preferredChannel || mission.driver.notificationChannel
        );
        await sendNotification(
          mission.driver.phone,
          "buyer_confirmed_presence" as any,
          {
            buyerName: mission.buyerName || "Le client",
            address: mission.address,
            message: "✅ L'acheteur a confirmé sa présence sur place.",
          },
          preferred
        );
      } catch (notifErr) {
        console.warn("[confirm-presence] Erreur notification livreur:", notifErr);
      }
    }

    return NextResponse.json({
      success: true,
      confirmedAt: confirmedAt.toISOString(),
      checkpoint: result.checkpoint,
    });
  } catch (error) {
    console.error("[POST /api/missions/[id]/confirm-presence] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur lors de la confirmation de présence." },
      { status: 500 }
    );
  }
}

