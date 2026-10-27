import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { normalizeChannel, sendNotification } from "@/lib/notifications";

const resendRateLimitMap = new Map<string, number>();
const MAX_RESEND_COUNT = 2;

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

    const currentCount = resendRateLimitMap.get(params.id) || 0;
    if (currentCount >= MAX_RESEND_COUNT) {
      return NextResponse.json(
        { error: "Limite de relances atteinte pour cette livraison (2 max)." },
        { status: 429 }
      );
    }

    const mission = await prisma.mission.findUnique({
      where: { id: params.id },
      include: {
        driver: {
          select: { name: true, phone: true },
        },
        vendor: {
          select: {
            shopName: true,
            name: true,
            preferredChannel: true,
            notificationChannel: true,
          },
        },
      },
    });

    if (!mission || mission.driverId !== session.userId) {
      return NextResponse.json(
        { error: "Mission introuvable ou non assignée à ce livreur." },
        { status: 403 }
      );
    }

    resendRateLimitMap.set(params.id, currentCount + 1);

    const driverName =
      mission.driver?.name || mission.driver?.phone || "Votre livreur";
    const buyerName = mission.buyerName || "Client";
    const publicLink = `https://motolink.cm/s/${mission.publicToken}`;

    const preferred = normalizeChannel(
      mission.vendor.preferredChannel || mission.vendor.notificationChannel
    );

    await sendNotification(
      mission.buyerPhone,
      "presence_reminder" as any,
      {
        buyerName,
        driverName,
        link: publicLink,
        message: `Bonjour ${buyerName}, votre livreur ${driverName} vous attend sur place. Veuillez confirmer votre présence : ${publicLink}`,
      },
      preferred
    );

    return NextResponse.json({
      success: true,
      remainingResends: MAX_RESEND_COUNT - (currentCount + 1),
    });
  } catch (error) {
    console.error("[resend-presence-notification] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur lors du renvoi de la relance." },
      { status: 500 }
    );
  }
}

