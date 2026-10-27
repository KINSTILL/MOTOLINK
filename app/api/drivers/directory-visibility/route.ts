import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { DirectoryError, setDirectoryVisibility } from "@/lib/directory";

const bodySchema = z.object({ visible: z.boolean() });

export async function PATCH(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (session.role !== "DRIVER") {
      return NextResponse.json(
        { error: "Réservé aux livreurs." },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Le champ « visible » (booléen) est requis." },
        { status: 400 }
      );
    }

    const result = await setDirectoryVisibility(
      session.userId,
      parsed.data.visible
    );

    return NextResponse.json({
      success: true,
      visible: result.visible,
      visibleAt: result.visibleAt,
    });
  } catch (error) {
    if (error instanceof DirectoryError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[PATCH /api/drivers/directory-visibility] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour de la visibilité." },
      { status: 500 }
    );
  }
}

