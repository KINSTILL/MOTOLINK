import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";

const COOLDOWN_MS = 24 * 60 * 60 * 1000;

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        kycStatus: true,
        verified: true,
        kycDocuments: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
    }

    const getLatestForType = (type: "ID_CARD" | "SYNDICATE_CARD" | "ENROLLMENT_CERT") => {
      const doc = user.kycDocuments.find((d) => d.type === type);
      if (!doc) return null;

      let canResubmit = doc.status === "REJECTED";
      let canResubmitAt: string | null = null;

      if (doc.status === "REJECTED" && doc.rejectedAt) {
        const unlockTime = new Date(doc.rejectedAt).getTime() + COOLDOWN_MS;
        canResubmit = Date.now() >= unlockTime;
        canResubmitAt = new Date(unlockTime).toISOString();
      }

      return {
        id: doc.id,
        type: doc.type,
        status: doc.status,
        syndicateName: doc.syndicateName,
        rejectionReason: doc.rejectionReason,
        rejectedAt: doc.rejectedAt,
        reviewedAt: doc.reviewedAt,
        createdAt: doc.createdAt,
        canResubmit,
        canResubmitAt,
      };
    };

    return NextResponse.json({
      kycStatus: user.kycStatus,
      verified: user.verified,
      levels: {
        idCard: getLatestForType("ID_CARD"),
        syndicate: getLatestForType("SYNDICATE_CARD"),
        enrollment: getLatestForType("ENROLLMENT_CERT"),
      },
    });
  } catch (error) {
    console.error("[GET /api/kyc/status] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération du statut KYC." },
      { status: 500 }
    );
  }
}

