import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logEvent } from "@/lib/audit";
import { recordOfflineNotification } from "@/lib/fleet";

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== "VENDOR") {
      return NextResponse.json(
        { error: "Accès réservé aux vendeurs." },
        { status: 403 }
      );
    }

    const favorite = await prisma.favoriteDriver.findUnique({
      where: { id: params.id },
      include: {
        driver: {
          select: { id: true, name: true, phone: true },
        },
      },
    });

    if (!favorite || favorite.buyerId !== session.userId) {
      return NextResponse.json(
        { error: "Livreur introuvable dans votre flotte." },
        { status: 404 }
      );
    }

    // Suppression du lien favori uniquement (l'utilisateur et son abonnement restent intacts)
    await prisma.favoriteDriver.delete({
      where: { id: favorite.id },
    });

    // Journal d'audit append-only
    await logEvent(
      "FLEET_DRIVER_REMOVED",
      "FLEET",
      favorite.id,
      session.userId,
      {
        favoriteId: favorite.id,
        driverId: favorite.driverId,
        driverName: favorite.driver?.name,
        driverPhone: favorite.driver?.phone,
        vendorId: session.userId,
      }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[/api/vendors/fleet/[id] DELETE] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur lors du retrait du livreur de votre flotte." },
      { status: 500 }
    );
  }
}

// Endpoint pratique pour notifier un livreur hors-ligne ("Lui demander s'il est disponible")
export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== "VENDOR") {
      return NextResponse.json(
        { error: "Accès réservé aux vendeurs." },
        { status: 403 }
      );
    }

    const favorite = await prisma.favoriteDriver.findUnique({
      where: { id: params.id },
    });

    if (!favorite || favorite.buyerId !== session.userId) {
      return NextResponse.json(
        { error: "Livreur introuvable dans votre flotte." },
        { status: 404 }
      );
    }

    recordOfflineNotification(session.userId, favorite.driverId);

    // Enregistrement persistant en base de données
    await prisma.offlineNotification.create({
      data: {
        vendorId: session.userId,
        driverId: favorite.driverId,
        channel: "whatsapp",
        status: "sent",
      },
    });

    return NextResponse.json({
      success: true,
      message: "Demande de disponibilité envoyée au livreur.",
    });
  } catch (error) {
    console.error("[/api/vendors/fleet/[id] POST] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur lors de la notification." },
      { status: 500 }
    );
  }
}

