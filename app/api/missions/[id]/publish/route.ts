import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const mission = await prisma.mission.findUnique({
      where: { id: params.id },
    });

    if (!mission || mission.vendorId !== session.userId) {
      return NextResponse.json(
        { error: "Mission introuvable." },
        { status: 404 }
      );
    }

    // Expire toute proposition directe encore en attente afin de publier sur le marché ouvert
    await prisma.directProposal.updateMany({
      where: {
        missionId: mission.id,
        status: "PENDING",
      },
      data: {
        status: "EXPIRED",
        respondedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      publishedOnOpenMarket: true,
    });
  } catch (error) {
    console.error("[POST /api/missions/[id]/publish] Erreur:", error);
    return NextResponse.json(
      { error: "Impossible de publier la mission sur le marché ouvert." },
      { status: 500 }
    );
  }
}

