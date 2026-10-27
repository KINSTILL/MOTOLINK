import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logEvent } from "@/lib/audit";

export async function GET(
  request: Request,
  { params }: { params: { hash: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const url = new URL(request.url);
    const reason = url.searchParams.get("reason")?.trim() || null;
    const isAdminQuery =
      (session.role as string) === "ADMIN" ||
      url.searchParams.get("role")?.toUpperCase() === "ADMIN";

    if (isAdminQuery && !reason) {
      return NextResponse.json(
        {
          error:
            "Le paramètre 'reason' est obligatoire pour la consultation d'une preuve par un administrateur.",
        },
        { status: 400 }
      );
    }

    const identifier = params.hash?.trim();
    const proof = await prisma.proof.findFirst({
      where: {
        OR: [{ id: identifier }, { proofHash: identifier }],
      },
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
        deviceFingerprint: true,
        tsaTimestamp: true,
        tsaUrl: true,
        tsaVerified: true,
        capturedAt: true,
        createdAt: true,
        mission: {
          select: {
            id: true,
            vendorId: true,
            driverId: true,
            buyerName: true,
            buyerPhone: true,
            address: true,
            description: true,
            price: true,
            status: true,
          },
        },
      },
    });

    if (!proof) {
      return NextResponse.json(
        { error: "Preuve introuvable." },
        { status: 404 }
      );
    }

    await logEvent("PROOF_VIEWED", "PROOF", proof.id, session.userId, {
      missionId: proof.missionId,
      proofHash: proof.proofHash,
      actorRole: isAdminQuery ? "ADMIN" : session.role,
      reason,
    });

    return NextResponse.json({ proof });
  } catch (error) {
    console.error("[GET /api/proofs/[id]] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur lors de la consultation de la preuve." },
      { status: 500 }
    );
  }
}

