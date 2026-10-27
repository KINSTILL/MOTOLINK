import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logEvent } from "@/lib/audit";

/**
 * GET /api/missions/[id]/contract
 * Téléchargement du contrat PDF de livraison (N7).
 * Accessible au vendeur propriétaire et au livreur assigné.
 */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const mission = await prisma.mission.findUnique({
      where: { id: params.id },
      select: {
        vendorId: true,
        driverId: true,
        contractPdfUrl: true,
      },
    });

    if (!mission) {
      return NextResponse.json({ error: "Mission introuvable" }, { status: 404 });
    }

    const isOwner = mission.vendorId === session.userId;
    const isDriver = mission.driverId === session.userId;
    if (!isOwner && !isDriver) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }

    if (!mission.contractPdfUrl) {
      // Pas de contrat : on ne révèle l'absence de document qu'au vendeur propriétaire,
      // un tiers non autorisé reçoit toujours 403 (pas de fuite d'existence).
      if (!isOwner) {
        return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
      }
      return NextResponse.json(
        { error: "Aucun contrat pour cette mission" },
        { status: 404 }
      );
    }

    await logEvent("CONTRACT_PDF_DOWNLOADED", "MISSION", params.id, session.userId);

    return NextResponse.redirect(new URL(mission.contractPdfUrl, "http://localhost"));
  } catch (error) {
    console.error("Erreur GET contract:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}


