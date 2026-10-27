import { NextResponse } from "next/server";
import { z } from "zod";
import { markNotificationStatus } from "@/lib/offline-notification";
import prisma from "@/lib/prisma";

const updateStatusSchema = z.object({
  status: z.enum(["sent", "failed", "delivered", "read"]),
});

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const notification = await prisma.offlineNotification.findUnique({
      where: { id: params.id },
    });

    if (!notification) {
      return NextResponse.json(
        { error: "Notification introuvable." },
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = updateStatusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Statut invalide (delivered ou read attendu)." },
        { status: 400 }
      );
    }

    await markNotificationStatus(notification.id, parsed.data.status);

    return NextResponse.json({
      success: true,
      status: parsed.data.status,
    });
  } catch (error) {
    console.error("[/api/vendors/notify-offline-driver/[id] PATCH] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour du statut." },
      { status: 500 }
    );
  }
}

