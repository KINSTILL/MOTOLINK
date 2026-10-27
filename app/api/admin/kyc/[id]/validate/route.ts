import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logEvent } from "@/lib/audit";

export async function PATCH(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
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

    const updatedDoc = await prisma.$transaction(async (tx) => {
      const validated = await tx.kycDocument.update({
        where: { id: doc.id },
        data: {
          status: "VERIFIED",
          reviewedAt: new Date(),
          rejectionReason: null,
        },
      });

      await tx.user.update({
        where: { id: doc.userId },
        data: {
          kycStatus: "VERIFIED",
          verified: true,
        },
      });

      return validated;
    });

    await logEvent("KYC_VALIDATED", "KYC", doc.id, session.userId, {
      docType: doc.type,
      syndicateName: doc.syndicateName,
      targetUserId: doc.userId,
      reviewedBy: session.userId,
    });

    console.log(
      `🔔 [PUSH NOTIFICATION] Livreur ${doc.user.phone} : Votre document KYC (${doc.type}) a été VALIDÉ !`
    );

    return NextResponse.json({ document: updatedDoc });
  } catch (error) {
    console.error("[PATCH /api/admin/kyc/[id]/validate] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur lors de la validation du dossier KYC." },
      { status: 500 }
    );
  }
}

