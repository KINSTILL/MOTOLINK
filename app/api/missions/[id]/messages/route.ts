import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logEvent } from "@/lib/audit";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Authentification requise." },
        { status: 401 }
      );
    }

    const mission = await prisma.mission.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        vendorId: true,
        driverId: true,
      },
    });

    if (!mission) {
      return NextResponse.json(
        { error: "Mission introuvable." },
        { status: 404 }
      );
    }

    // Seuls le vendeur expéditeur ou le livreur assigné peuvent lire les messages
    if (
      session.userId !== mission.vendorId &&
      session.userId !== mission.driverId
    ) {
      return NextResponse.json(
        { error: "Accès refusé à cette conversation." },
        { status: 403 }
      );
    }

    const messages = await prisma.message.findMany({
      where: { missionId: mission.id },
      orderBy: { createdAt: "asc" },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            shopName: true,
            role: true,
            phone: true,
          },
        },
      },
    });

    return NextResponse.json({ messages });
  } catch (error) {
    console.error("[GET /api/missions/[id]/messages] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des messages." },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Authentification requise." },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const content = (body.content || "").trim();

    if (!content) {
      return NextResponse.json(
        { error: "Le contenu du message ne peut pas être vide." },
        { status: 400 }
      );
    }

    const mission = await prisma.mission.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        vendorId: true,
        driverId: true,
      },
    });

    if (!mission) {
      return NextResponse.json(
        { error: "Mission introuvable." },
        { status: 404 }
      );
    }

    if (
      session.userId !== mission.vendorId &&
      session.userId !== mission.driverId
    ) {
      return NextResponse.json(
        { error: "Vous ne participez pas à cette mission." },
        { status: 403 }
      );
    }

    const created = await prisma.message.create({
      data: {
        missionId: mission.id,
        senderId: session.userId,
        content,
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            shopName: true,
            role: true,
            phone: true,
          },
        },
      },
    });

    // Journal d'audit non-bloquant
    try {
      await logEvent(
        "MISSION_STATUS_CHANGED" as any,
        "MISSION",
        mission.id,
        session.userId,
        { messageId: created.id }
      );
    } catch (auditErr) {
      console.warn("[messages] Audit log non-bloquant:", auditErr);
    }

    return NextResponse.json({ message: created }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/missions/[id]/messages] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur lors de la création du message." },
      { status: 500 }
    );
  }
}
