import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { normalizeChannel, sendNotification } from "@/lib/notifications";
import { logEvent } from "@/lib/audit";
import { generateDeliveryCode, hashDeliveryCode } from "@/lib/delivery-code";

const MAX_RESENDS = 5;

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

    const mission = await prisma.mission.findUnique({
      where: { id: params.id },
      include: {
        vendor: {
          select: {
            id: true,
            shopName: true,
            name: true,
            preferredChannel: true,
            notificationChannel: true,
          },
        },
      },
    });

    if (!mission || mission.vendorId !== session.userId) {
      return NextResponse.json(
        { error: "Mission introuvable." },
        { status: 404 }
      );
    }

    // Anti-spam : 5 régénérations maximum
    if (mission.deliveryCodeAttempts >= MAX_RESENDS) {
      return NextResponse.json(
        {
          error: `Limite atteinte (${MAX_RESENDS} renvois maximum). Contactez le support.`,
          remainingResends: 0,
        },
        { status: 429 }
      );
    }

    // Régénère le code (invalide l'ancien)
    const rawCode = generateDeliveryCode();
    const hashedCode = await hashDeliveryCode(rawCode);

    // Vérifie si le code a déjà été validé : on ne réinitialise pas la validation
    const updateData: {
      deliveryCode: string;
      deliveryCodeAttempts: { increment: number };
      deliveryCodeSentAt?: Date;
    } = {
      deliveryCode: hashedCode,
      deliveryCodeAttempts: { increment: 1 },
    };

    const preferredChannel = normalizeChannel(
      mission.vendor.preferredChannel || mission.vendor.notificationChannel
    );
    const shopName =
      mission.vendor.shopName || mission.vendor.name || "Votre vendeur";

    const result = await sendNotification(
      mission.buyerPhone,
      "delivery_code_resend",
      {
        buyerName: mission.buyerName || "Client",
        shopName,
        code: rawCode,
      },
      preferredChannel
    );

    if (result.success) {
      updateData.deliveryCodeSentAt = new Date();
    }

    await prisma.mission.update({
      where: { id: mission.id },
      data: updateData,
    });

    if (result.success) {
      await logEvent(
        "DELIVERY_CODE_SENT",
        "MISSION",
        mission.id,
        session.userId,
        { channel: result.channel, reason: "resend" }
      );
    }

    return NextResponse.json({
      success: result.success,
      sent: result.success,
      channel: result.channel,
      channelLabel: result.channel === "whatsapp" ? "WhatsApp" : "SMS",
      remainingResends: Math.max(
        0,
        MAX_RESENDS - (mission.deliveryCodeAttempts + 1)
      ),
      error: result.error,
    });
  } catch (error) {
    console.error(
      "[POST /api/missions/[id]/resend-delivery-code] Erreur:",
      error
    );
    return NextResponse.json(
      { error: "Impossible de renvoyer le code de remise." },
      { status: 500 }
    );
  }
}
