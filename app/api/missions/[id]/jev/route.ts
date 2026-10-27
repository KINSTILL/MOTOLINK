import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(
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
      select: {
        id: true,
        category: true,
        categorySource: true,
        jevDecisions: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!mission) {
      return NextResponse.json(
        { error: "Mission introuvable." },
        { status: 404 }
      );
    }

    const enabledRaw = (process.env.JEV_ENABLED ?? "true")
      .trim()
      .toLowerCase();
    const jevEnabled =
      enabledRaw !== "false" && enabledRaw !== "0" && enabledRaw !== "off";

    const latestDecision = mission.jevDecisions[0] || null;

    return NextResponse.json({
      category: mission.category,
      categorySource: mission.categorySource,
      jevEnabled,
      latestDecision: latestDecision
        ? {
            id: latestDecision.id,
            category: latestDecision.category,
            confidence: latestDecision.confidence,
            status: latestDecision.status,
            latencyMs: latestDecision.latencyMs,
            createdAt: latestDecision.createdAt,
          }
        : null,
    });
  } catch (error) {
    console.error("[GET /api/missions/[id]/jev] Erreur:", error);
    return NextResponse.json(
      { error: "Impossible de récupérer l'état Jev." },
      { status: 500 }
    );
  }
}

