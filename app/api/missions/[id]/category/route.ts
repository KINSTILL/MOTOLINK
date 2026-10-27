import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { JEV_CATEGORIES } from "@/lib/jev-constants";

const updateCategorySchema = z.object({
  category: z.enum(JEV_CATEGORIES),
});

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = updateCategorySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            "Catégorie invalide (fragile, standard, volumineux ou urgent attendu).",
        },
        { status: 400 }
      );
    }

    const mission = await prisma.mission.findUnique({
      where: { id: params.id },
      select: { id: true, vendorId: true },
    });

    if (!mission) {
      return NextResponse.json(
        { error: "Mission introuvable." },
        { status: 404 }
      );
    }

    if (mission.vendorId !== session.userId) {
      return NextResponse.json(
        { error: "Seul le créateur de la mission peut modifier la catégorie." },
        { status: 403 }
      );
    }

    const updated = await prisma.mission.update({
      where: { id: mission.id },
      data: {
        category: parsed.data.category,
        categorySource: "manual",
      },
      select: {
        id: true,
        category: true,
        categorySource: true,
      },
    });

    return NextResponse.json({
      mission: updated,
    });
  } catch (error) {
    console.error("[PATCH /api/missions/[id]/category] Erreur:", error);
    return NextResponse.json(
      { error: "Impossible de modifier la catégorie." },
      { status: 500 }
    );
  }
}

