import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logEvent } from "@/lib/audit";

const bodySchema = z.object({
  generateContractPdf: z.boolean().optional(),
});

/**
 * PATCH /api/users/me/contract-settings (N7)
 * Active/désactive la génération automatique du contrat PDF à chaque mission.
 * Réservé aux vendeurs.
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "VENDOR") {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides" }, { status: 400 });
    }

    if (parsed.data.generateContractPdf === undefined) {
      return NextResponse.json({ error: "Aucune donnée à mettre à jour" }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: session.userId },
      data: { generateContractPdf: parsed.data.generateContractPdf },
      select: { generateContractPdf: true },
    });

    await logEvent(
      "CONTRACT_PDF_GENERATED",
      "DRIVER",
      session.userId,
      session.userId,
      {
        settingsToggle: true,
        generateContractPdf: updated.generateContractPdf,
        note: "Préférence de génération du contrat PDF mise à jour.",
      }
    );

    return NextResponse.json({ success: true, settings: updated });
  } catch (error) {
    console.error("Erreur PATCH contract-settings:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

/**
 * GET /api/users/me/contract-settings (N7)
 * Lit la préférence courante du vendeur.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { generateContractPdf: true, role: true },
    });
    if (!user) {
      return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
    }
    return NextResponse.json({ settings: { generateContractPdf: user.generateContractPdf } });
  } catch (error) {
    console.error("Erreur GET contract-settings:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
