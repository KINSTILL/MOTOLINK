import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { MAX_COMMENT_LENGTH, RatingError, submitRating } from "@/lib/rating";

const rateSchema = z.object({
  score: z.number().int().min(1).max(5),
  comment: z.string().max(MAX_COMMENT_LENGTH).nullable().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = rateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: `La note doit être un entier entre 1 et 5 (commentaire : ${MAX_COMMENT_LENGTH} caractères max).`,
        },
        { status: 400 }
      );
    }

    const mission = await prisma.mission.findUnique({
      where: { id: params.id },
      select: { id: true, status: true, vendorId: true, driverId: true },
    });
    if (!mission) {
      return NextResponse.json(
        { error: "Mission introuvable." },
        { status: 404 }
      );
    }

    if (mission.status !== "DELIVERED") {
      return NextResponse.json(
        { error: "Vous ne pouvez noter qu'une mission livrée." },
        { status: 400 }
      );
    }

    // L'utilisateur doit être le vendeur ou le livreur de la mission
    let toUserId: string | null = null;
    if (session.userId === mission.vendorId) {
      toUserId = mission.driverId;
    } else if (mission.driverId && session.userId === mission.driverId) {
      toUserId = mission.vendorId;
    } else {
      return NextResponse.json(
        { error: "Vous ne participez pas à cette mission." },
        { status: 403 }
      );
    }

    if (!toUserId) {
      return NextResponse.json(
        { error: "Aucun livreur n'est assigné à cette mission." },
        { status: 400 }
      );
    }

    await submitRating(
      mission.id,
      session.userId,
      toUserId,
      parsed.data.score,
      parsed.data.comment
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof RatingError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("[POST /api/missions/[id]/rate] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'enregistrement de la note." },
      { status: 500 }
    );
  }
}

