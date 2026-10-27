import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logEvent } from "@/lib/audit";

const idCardSchema = z.object({
  frontKey: z.string().min(5, "Photo CNI recto requise"),
  backKey: z.string().min(5, "Photo CNI verso requise"),
  selfieKey: z.string().min(5, "Selfie tenant la CNI requis"),
});

const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 heures

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = idCardSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Veuillez téléverser les 3 photos (recto, verso et selfie)." },
        { status: 400 }
      );
    }

    // Vérifier la contrainte des 24h après un rejet
    const lastDoc = await prisma.kycDocument.findFirst({
      where: {
        userId: session.userId,
        type: "ID_CARD",
      },
      orderBy: { createdAt: "desc" },
    });

    if (lastDoc?.status === "REJECTED" && lastDoc.rejectedAt) {
      const elapsed = Date.now() - new Date(lastDoc.rejectedAt).getTime();
      if (elapsed < COOLDOWN_MS) {
        const remainingHours = Math.ceil((COOLDOWN_MS - elapsed) / (60 * 60 * 1000));
        return NextResponse.json(
          {
            error: `Un dossier rejeté ne peut être renvoyé qu'après 24h (encore ${remainingHours}h d'attente).`,
          },
          { status: 429 }
        );
      }
    }

    const { frontKey, backKey, selfieKey } = parsed.data;

    const doc = await prisma.$transaction(async (tx) => {
      const created = await tx.kycDocument.create({
        data: {
          userId: session.userId,
          type: "ID_CARD",
          status: "PENDING",
          frontKey,
          backKey,
          selfieKey,
        },
      });

      await tx.user.update({
        where: { id: session.userId },
        data: {
          kycStatus: "PENDING",
        },
      });

      return created;
    });

    await logEvent("KYC_SUBMITTED", "KYC", doc.id, session.userId, {
      docType: "ID_CARD",
      userId: session.userId,
    });

    return NextResponse.json({ document: doc }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/kyc/id-card] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'enregistrement de la CNI." },
      { status: 500 }
    );
  }
}

