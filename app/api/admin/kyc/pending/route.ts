import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { createSignedKycUrl } from "@/lib/storage";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const docs = await prisma.kycDocument.findMany({
      where: {
        status: "PENDING",
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            phone: true,
            kycStatus: true,
            verified: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const formatted = docs.map((doc) => ({
      id: doc.id,
      type: doc.type,
      status: doc.status,
      syndicateName: doc.syndicateName,
      createdAt: doc.createdAt,
      user: doc.user,
      // URLs signées valables 1 heure (3600s) uniquement pour l'admin
      frontUrl: createSignedKycUrl(doc.frontKey, 3600),
      backUrl: doc.backKey ? createSignedKycUrl(doc.backKey, 3600) : null,
      selfieUrl: doc.selfieKey ? createSignedKycUrl(doc.selfieKey, 3600) : null,
    }));

    return NextResponse.json({ documents: formatted });
  } catch (error) {
    console.error("[GET /api/admin/kyc/pending] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur lors du chargement des dossiers KYC." },
      { status: 500 }
    );
  }
}

