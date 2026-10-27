import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logEvent } from "@/lib/audit";

export async function GET(
  request: Request,
  { params }: { params: { hash: string } }
) {
  try {
    const hash = params.hash?.trim().toLowerCase();
    if (!hash) {
      return NextResponse.json(
        { valid: false, error: "Empreinte SHA-256 manquante." },
        { status: 400 }
      );
    }

    const proof = await prisma.proof.findUnique({
      where: { proofHash: hash },
      select: {
        id: true,
        missionId: true,
        photoUrl: true,
        signatureUrl: true,
        pdfUrl: true,
        proofHash: true,
        lat: true,
        lng: true,
        gpsAccuracy: true,
        capturedAt: true,
        tsaVerified: true,
        tsaTimestamp: true,
        tsaUrl: true,
        mission: {
          select: {
            id: true,
            description: true,
            address: true,
            price: true,
            buyerName: true,
            buyerPhone: true,
            status: true,
            vendor: {
              select: { shopName: true, name: true, phone: true },
            },
            driver: {
              select: { name: true, phone: true },
            },
          },
        },
      },
    });

    if (!proof) {
      return NextResponse.json(
        { valid: false, error: "Preuve introuvable." },
        { status: 404 }
      );
    }

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip")?.trim() ||
      "127.0.0.1";

    // Journalise la vérification publique (PROOF_VERIFIED)
    await logEvent("PROOF_VERIFIED", "PROOF", proof.id, null, {
      proofHash: proof.proofHash,
      missionId: proof.missionId,
      actorIp: ip,
      actorRole: "PUBLIC",
    });

    const lastVerification = await prisma.auditLog.findFirst({
      where: {
        entityType: "PROOF",
        entityId: proof.id,
        eventType: "PROOF_VERIFIED",
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        actorIp: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      valid: true,
      proof,
      lastVerification,
    });
  } catch (error) {
    console.error("[GET /api/proofs/[hash]/verify] Erreur:", error);
    return NextResponse.json(
      { valid: false, error: "Erreur lors de la vérification de la preuve." },
      { status: 500 }
    );
  }
}

