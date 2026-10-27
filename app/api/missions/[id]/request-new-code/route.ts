import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { normalizeChannel, sendNotification } from "@/lib/notifications";

/**
 * Le livreur demande au vendeur de renvoyer un nouveau code de remise
 * (après blocage ou code perdu côté acheteur).
 */
export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== "DRIVER") {
      return NextResponse.json(
        { error: "Accès réservé aux livreurs." },
        { status: 403 }
      );
    }

    const mission = await prisma.mission.findUnique({
      where: { id: params.id },
      include: {
        vendor: {
          select: {
            id: true,
            shopName: true,
            name: true,
            phone: true,
            preferredChannel: true,
            notificationChannel: true,
          },
        },
        driver: { select: { name: true, phone: true } },
      },
    });

    if (!mission) {
      return NextResponse.json(
        { error: "Mission introuvable." },
        { status: 404 }
      );
    }

    if (mission.driverId !== session.userId) {
      return NextResponse.json(
        { error: "Seul le livreur assigné peut faire cette demande." },
        { status: 403 }
      );
    }

    // Notifie le vendeur (WhatsApp/SMS) qu'il doit renvoyer le code
    try {
      const channel = normalizeChannel(
        mission.vendor.preferredChannel || mission.vendor.notificationChannel
      );
      const driverName =
        mission.driver?.name || mission.driver?.phone || "Votre livreur";

      await sendNotification(
        mission.vendor.phone,
        "delivery_code_request",
        {
          shopName: mission.vendor.shopName || mission.vendor.name || "Vendeur",
          driverName,
          buyerName: mission.buyerName || "Client",
        },
        channel
      );
    } catch (notifErr) {
      console.warn(
        "[request-new-code] Notification vendeur échouée (non-bloquant):",
        notifErr
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[POST /api/missions/[id]/request-new-code] Erreur:", error);
    return NextResponse.json(
      { error: "Impossible d'envoyer la demande au vendeur." },
      { status: 500 }
    );
  }
}
