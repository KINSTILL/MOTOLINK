import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyTimestamp } from "@/lib/tsa-verify";

export async function GET(
  _request: Request,
  { params }: { params: { hash: string } }
) {
  try {
    const hash = params.hash?.trim().toLowerCase();
    if (!hash) {
      return NextResponse.json(
        { error: "Empreinte SHA-256 manquante." },
        { status: 400 }
      );
    }

    const proof = await prisma.proof.findUnique({
      where: { proofHash: hash },
      select: {
        proofHash: true,
        tsaToken: true,
        tsaTimestamp: true,
        tsaUrl: true,
        tsaVerified: true,
      },
    });

    if (!proof) {
      return NextResponse.json(
        { error: "Preuve introuvable." },
        { status: 404 }
      );
    }

    if (!proof.tsaVerified || !proof.tsaToken) {
      return NextResponse.json({
        tsaTimestamp: null,
        tsaUrl: proof.tsaUrl || null,
        valid: false,
        tsaToken: null,
      });
    }

    const verification = await verifyTimestamp(
      proof.proofHash,
      proof.tsaToken,
      proof.tsaUrl || undefined
    );

    return NextResponse.json({
      tsaTimestamp: verification.timestamp || proof.tsaTimestamp,
      tsaUrl: verification.tsaUrl || proof.tsaUrl,
      valid: verification.valid,
      tsaToken: proof.tsaToken,
    });
  } catch (error) {
    console.error("[GET /api/proofs/[hash]/tsa] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur lors de la vérification du token TSA." },
      { status: 500 }
    );
  }
}

