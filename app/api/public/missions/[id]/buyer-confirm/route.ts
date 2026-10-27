import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logEvent } from "@/lib/audit";
import {
  checkBuyerConfirmRateLimit,
  verifyBuyerConfirmToken,
} from "@/lib/order-confirmation";

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "127.0.0.1";
}

/**
 * Confirmation de commande par l'acheteur via le lien reçu par WhatsApp / SMS.
 * Body : { token }
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    if (!checkBuyerConfirmRateLimit(getClientIp(request))) {
      return NextResponse.json(
        { error: "Trop de tentatives. Réessayez dans quelques minutes." },
        { status: 429 }
      );
    }

    const missionId = params.id?.trim();
    const body = await request.json().catch(() => ({}));
    const token = typeof body?.token === "string" ? body.token.trim() : "";

    if (!missionId || !token) {
      return NextResponse.json(
        { error: "Identifiant de mission et token requis." },
        { status: 400 }
      );
    }

    const mission = await prisma.mission.findUnique({
      where: { id: missionId },
      select: {
        id: true,
        status: true,
        buyerConfirmToken: true,
        buyerConfirmedAt: true,
      },
    });

    if (!mission) {
      return NextResponse.json({ error: "Mission introuvable." }, { status: 404 });
    }

    if (!verifyBuyerConfirmToken(mission.buyerConfirmToken, token)) {
      return NextResponse.json(
        { error: "Lien de confirmation invalide." },
        { status: 403 }
      );
    }

    if (mission.status === "CANCELLED") {
      return NextResponse.json(
        { error: "Cette commande a été annulée." },
        { status: 409 }
      );
    }

    // Idempotent : un second clic ne modifie rien et ne génère pas de nouvel audit
    if (mission.buyerConfirmedAt) {
      return NextResponse.json({
        success: true,
        alreadyConfirmed: true,
        buyerConfirmedAt: mission.buyerConfirmedAt,
      });
    }

    const confirmedAt = new Date();
    const updated = await prisma.mission.updateMany({
      where: { id: mission.id, buyerConfirmedAt: null },
      data: { buyerConfirmedAt: confirmedAt, buyerConfirmedVia: "link" },
    });

    if (updated.count === 1) {
      await logEvent("BUYER_CONFIRMED", "MISSION", mission.id, null, {
        buyerConfirmedAt: confirmedAt.toISOString(),
        via: "link",
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[POST /api/public/missions/[id]/buyer-confirm] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur lors de la confirmation de la commande." },
      { status: 500 }
    );
  }
}

