import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const publicToken = searchParams.get("publicToken");

    if (!publicToken) {
      return NextResponse.json(
        { error: "Paramètre publicToken manquant." },
        { status: 400 }
      );
    }

    const mission = await prisma.mission.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        publicToken: true,
        buyerPresenceConfirmedAt: true,
      },
    });

    if (!mission) {
      return NextResponse.json(
        { error: "Mission introuvable." },
        { status: 404 }
      );
    }

    if (mission.publicToken !== publicToken) {
      return NextResponse.json(
        { error: "Jeton public non valide." },
        { status: 403 }
      );
    }

    return NextResponse.json({
      buyerPresenceConfirmed: mission.buyerPresenceConfirmedAt !== null,
      confirmedAt: mission.buyerPresenceConfirmedAt,
    });
  } catch (error) {
    console.error("[GET /api/missions/[id]/presence-status] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur serveur." },
      { status: 500 }
    );
  }
}

