import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logEvent } from "@/lib/audit";

export async function POST(
  _request: Request,
  { params }: { params: { hash: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const identifier = params.hash?.trim();
    const proof = await prisma.proof.findFirst({
      where: {
        OR: [{ id: identifier }, { proofHash: identifier }],
      },
      select: {
        id: true,
        missionId: true,
        pdfUrl: true,
        proofHash: true,
      },
    });

    if (!proof) {
      return NextResponse.json(
        { error: "Preuve introuvable." },
        { status: 404 }
      );
    }

    await logEvent("PROOF_EXPORTED", "PROOF", proof.id, session.userId, {
      missionId: proof.missionId,
      proofHash: proof.proofHash,
      pdfUrl: proof.pdfUrl,
      actorRole: session.role,
    });

    return NextResponse.json({
      success: true,
      proofId: proof.id,
      pdfUrl: proof.pdfUrl,
      proofHash: proof.proofHash,
    });
  } catch (error) {
    console.error("[POST /api/proofs/[id]/export] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'export du certificat PDF." },
      { status: 500 }
    );
  }
}

