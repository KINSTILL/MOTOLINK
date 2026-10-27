import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";

const enrollmentSchema = z.object({
  frontKey: z.string().min(5, "Photo de l'attestation d'enrôlement requise"),
});

const COOLDOWN_MS = 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = enrollmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Veuillez téléverser la photo de votre attestation." },
        { status: 400 }
      );
    }

    const lastDoc = await prisma.kycDocument.findFirst({
      where: {
        userId: session.userId,
        type: "ENROLLMENT_CERT",
      },
      orderBy: { createdAt: "desc" },
    });

    if (lastDoc?.status === "REJECTED" && lastDoc.rejectedAt) {
      const elapsed = Date.now() - new Date(lastDoc.rejectedAt).getTime();
      if (elapsed < COOLDOWN_MS) {
        const remainingHours = Math.ceil((COOLDOWN_MS - elapsed) / (60 * 60 * 1000));
        return NextResponse.json(
          {
            error: `Vous pourrez renvoyer votre attestation dans ${remainingHours}h.`,
          },
          { status: 429 }
        );
      }
    }

    const doc = await prisma.kycDocument.create({
      data: {
        userId: session.userId,
        type: "ENROLLMENT_CERT",
        status: "PENDING",
        frontKey: parsed.data.frontKey,
      },
    });

    return NextResponse.json({ document: doc }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/kyc/enrollment] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'envoi de l'attestation d'enrôlement." },
      { status: 500 }
    );
  }
}

