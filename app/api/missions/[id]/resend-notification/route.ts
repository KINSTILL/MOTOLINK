import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import {
  buildShortTrackingLink,
  normalizeChannel,
  sendNotification,
} from "@/lib/notifications";

const MAX_RESENDS_PER_MISSION = 3;

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

    if (mission.notifResendCount >= MAX_RESENDS_PER_MISSION) {
      return NextResponse.json(
        {
          error: `Limite atteinte (${MAX_RESENDS_PER_MISSION} renvois maximum par mission).`,
          remainingResends: 0,
        },
        { status: 429 }
      );
    }

    const link = buildShortTrackingLink(mission.publicToken);
    const preferredChannel = normalizeChannel(
      mission.vendor.preferredChannel || mission.vendor.notificationChannel
    );
    const shopName =
      mission.vendor.shopName || mission.vendor.name || "Votre vendeur";

    const result = await sendNotification(
      mission.buyerPhone,
      "mission_created",
      {
        buyerName: mission.buyerName || "Client",
        shopName,
        link,
      },
      preferredChannel
    );

    const nextResendCount = mission.notifResendCount + 1;
    const notifStatus = result.success ? "SENT" : "FAILED";
    const notifSentAt = result.success ? new Date() : mission.notifSentAt;

    await prisma.mission.update({
      where: { id: mission.id },
      data: {
        notifChannelUsed: result.channel,
        notifSentAt,
        notifStatus,
        notifResendCount: nextResendCount,
        notificationSent: result.success,
        notificationChannel:
          result.channel === "whatsapp" ? "WhatsApp" : "SMS",
      },
    });

    return NextResponse.json({
      success: result.success,
      sent: result.success,
      channel: result.channel,
      channelLabel: result.channel === "whatsapp" ? "WhatsApp" : "SMS",
      notifStatus,
      notifSentAt,
      resendCount: nextResendCount,
      remainingResends: Math.max(0, MAX_RESENDS_PER_MISSION - nextResendCount),
      error: result.error,
    });
  } catch (error) {
    console.error(
      "[POST /api/missions/[id]/resend-notification] Erreur:",
      error
    );
    return NextResponse.json(
      { error: "Impossible de renvoyer la notification." },
      { status: 500 }
    );
  }
}

