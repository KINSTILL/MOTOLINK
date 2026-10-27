import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";

const syndicateSchema = z.object({
  frontKey: z.string().min(5, "Photo de la carte de syndicat requise"),
  syndicateName: z.enum(["SYNPROCOMON", "SYPROCOMON", "Autre"], {
    errorMap: () => ({ message: "Veuillez choisir un syndicat dans la liste" }),
  }),
});

const COOLDOWN_MS = 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    // Vérifier que le Niveau 1 (ID_CARD) est validé
    const verifiedIdCard = await prisma.kycDocument.findFirst({
      where: {
        userId: session.userId,
        type: "ID_CARD",
        status: "VERIFIED",
      },
    });

    if (!verifiedIdCard) {
      return NextResponse.json(
        {
          error:
            "Le Niveau 1 (CNI vérifiée) doit être validé avant d'ajouter votre carte de syndicat.",
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = syndicateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Veuillez sélectionner votre syndicat et téléverser la carte." },
        { status: 400 }
      );
    }

    const lastDoc = await prisma.kycDocument.findFirst({
      where: {
        userId: session.userId,
        type: "SYNDICATE_CARD",
      },
      orderBy: { createdAt: "desc" },
    });

    if (lastDoc?.status === "REJECTED" && lastDoc.rejectedAt) {
      const elapsed = Date.now() - new Date(lastDoc.rejectedAt).getTime();
      if (elapsed < COOLDOWN_MS) {
        const remainingHours = Math.ceil((COOLDOWN_MS - elapsed) / (60 * 60 * 1000));
        return NextResponse.json(
          {
            error: `Vous pourrez renvoyer votre carte de syndicat dans ${remainingHours}h.`,
          },
          { status: 429 }
        );
      }
    }

    const doc = await prisma.kycDocument.create({
      data: {
        userId: session.userId,
        type: "SYNDICATE_CARD",
        status: "PENDING",
        frontKey: parsed.data.frontKey,
        syndicateName: parsed.data.syndicateName,
      },
    });

    return NextResponse.json({ document: doc }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/kyc/syndicate] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'envoi de la carte de syndicat." },
      { status: 500 }
    );
  }
}

