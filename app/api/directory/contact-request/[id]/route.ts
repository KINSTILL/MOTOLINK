import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { DirectoryError, respondToContactRequest } from "@/lib/directory";

const bodySchema = z.object({ response: z.enum(["accepted", "refused"]) });

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (session.role !== "DRIVER") {
      return NextResponse.json(
        { error: "Seul le livreur sollicité peut répondre." },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "La réponse doit être « accepted » ou « refused »." },
        { status: 400 }
      );
    }

    const { request: updated } = await respondToContactRequest(
      params.id,
      session.userId,
      parsed.data.response
    );

    return NextResponse.json({
      success: true,
      status: updated.status,
      // Le numéro du livreur est désormais accessible au vendeur (flotte + liste de ses demandes)
      phoneRevealed: updated.status === "accepted",
    });
  } catch (error) {
    if (error instanceof DirectoryError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[PATCH /api/directory/contact-request/[id]] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur lors du traitement de la réponse." },
      { status: 500 }
    );
  }
}

