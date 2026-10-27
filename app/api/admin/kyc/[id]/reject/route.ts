import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logEvent } from "@/lib/audit";

const rejectSchema = z.object({
  reason: z.string().trim().min(3, "Le motif de rejet est obligatoire"),
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
    const parsed = rejectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Le motif de rejet est obligatoire." },
        { status: 400 }
      );
    }

    const doc = await prisma.kycDocument.findUnique({
      where: { id: params.id },
      include: { user: true },
    });

    if (!doc) {
      return NextResponse.json(
        { error: "Dossier KYC introuvable." },
        { status: 404 }
      );
    }

    const now = new Date();
    const { reason } = parsed.data;

    const updatedDoc = await prisma.$transaction(async (tx) => {
      const rejected = await tx.kycDocument.update({
        where: { id: doc.id },
        data: {
          status: "REJECTED",
          rejectionReason: reason,
          rejectedAt: now,
          reviewedAt: now,
        },
      });

      if (doc.type === "ID_CARD") {
        await tx.user.update({
          where: { id: doc.userId },
          data: {
            kycStatus: "REJECTED",
            verified: false,
          },
        });
      }

      return rejected;
    });

    await logEvent("KYC_REJECTED", "KYC", doc.id, session.userId, {
      docType: doc.type,
      reason,
      targetUserId: doc.userId,
      reviewedBy: session.userId,
    });

    console.log(
      `🔔 [PUSH NOTIFICATION] Livreur ${doc.user.phone} : Votre document KYC (${doc.type}) a été REJETÉ. Motif : ${reason}`
    );

    return NextResponse.json({ document: updatedDoc });
  } catch (error) {
    console.error("[PATCH /api/admin/kyc/[id]/reject] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur lors du rejet du dossier KYC." },
      { status: 500 }
    );
  }
}

