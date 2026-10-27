import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import {
  checkGlobalNotifyRateLimit,
  sendOfflineNotification,
} from "@/lib/offline-notification";

const notifySchema = z.object({
  driverId: z.string().min(1, "ID du livreur requis"),
  channel: z.enum(["whatsapp", "sms"]).default("whatsapp"),
});

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session || session.role !== "VENDOR") {
      return NextResponse.json(
        { error: "Accès réservé aux vendeurs." },
        { status: 403 }
      );
    }

    if (!checkGlobalNotifyRateLimit(session.userId)) {
      return NextResponse.json(
        { error: "Trop de requêtes de notification. Veuillez patienter une minute." },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = notifySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Paramètres invalides (driverId et channel requis)." },
        { status: 400 }
      );
    }

    const { driverId, channel } = parsed.data;

    // 1. Vérifier que le livreur est bien dans la flotte du vendeur
    const favorite = await prisma.favoriteDriver.findFirst({
      where: {
        buyerId: session.userId,
        driverId,
      },
      include: {
        driver: {
          select: {
            id: true,
            name: true,
            driverStatus: true,
          },
        },
      },
    });

    if (!favorite) {
      return NextResponse.json(
        { error: "Livreur non trouvé dans votre flotte." },
        { status: 403 }
      );
    }

    // 2. Vérifier que le livreur est OFFLINE
    if (favorite.driver.driverStatus !== "OFFLINE") {
      return NextResponse.json(
        { error: "Le livreur n'est pas hors ligne." },
        { status: 400 }
      );
    }

    // 3. Envoyer la notification (avec contrôle strict du rate-limit 24h par couple)
    const result = await sendOfflineNotification(
      session.userId,
      driverId,
      channel
    );

    if (!result.success) {
      const isRateLimit = result.error?.includes("24h");
      return NextResponse.json(
        { success: false, error: result.error },
        { status: isRateLimit ? 429 : 500 }
      );
    }

    return NextResponse.json({
      success: true,
      notificationId: result.notificationId,
      channel: result.channel,
      message: `Notification envoyée avec succès à ${favorite.driver.name}.`,
    });
  } catch (error) {
    console.error("[/api/vendors/notify-offline-driver POST] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur serveur lors de l'envoi de la notification." },
      { status: 500 }
    );
  }
}

