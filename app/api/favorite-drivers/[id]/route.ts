import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const target = await prisma.favoriteDriver.findFirst({
      where: {
        buyerId: session.userId,
        OR: [{ id: params.id }, { driverId: params.id }],
      },
    });

    if (!target) {
      return NextResponse.json(
        { error: "Livreur préféré introuvable." },
        { status: 404 }
      );
    }

    await prisma.favoriteDriver.delete({
      where: { id: target.id },
    });

    return NextResponse.json({ success: true, deletedId: target.id });
  } catch (error) {
    console.error("[DELETE /api/favorite-drivers/[id]] Erreur:", error);
    return NextResponse.json(
      { error: "Impossible de retirer ce livreur préféré." },
      { status: 500 }
    );
  }
}

