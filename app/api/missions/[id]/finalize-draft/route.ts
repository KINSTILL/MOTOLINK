import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logEvent } from "@/lib/audit";
import { sendNotification, normalizeChannel } from "@/lib/notifications";
import {
  hasActiveSubscriptionOrCredits,
  consumeCreditIfNeeded,
} from "@/lib/social-commerce";
import { MISSION_TYPES } from "@/lib/validations/mission";

const finalizeSchema = z.object({
  buyerName: z.string().trim().optional().nullable(),
  buyerPhone: z.string().trim().optional(),
  address: z.string().trim().min(5).optional(),
  articlePhotoUrls: z
    .array(z.string().min(1))
    .min(1, "Ajoutez au moins 1 photo de l'article (1 à 2 obligatoires).")
    .max(2, "Maximum 2 photos autorisées."),
  type: z.enum(MISSION_TYPES).default("PARCEL"),
  gasCertified: z.boolean().optional().default(false),
  price: z.coerce.number().gt(0, "Le prix proposé doit être supérieur à 0 FCFA."),
  description: z.string().trim().max(200).optional().nullable(),
});

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== "VENDOR") {
      return NextResponse.json({ error: "Accès réservé aux vendeurs." }, { status: 403 });
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
      },
    });

    if (!mission) {
      return NextResponse.json({ error: "Mission introuvable." }, { status: 404 });
    }

    if (mission.vendorId !== session.userId) {
      return NextResponse.json({ error: "Non autorisé à modifier cette mission." }, { status: 403 });
    }

    if (mission.status !== "DRAFT") {
      return NextResponse.json(
        { error: "Cette mission a déjà été finalisée ou n'est plus en brouillon." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = finalizeSchema.safeParse(body);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      const firstError = Object.values(fieldErrors).flat()[0] || "Données invalides.";
      return NextResponse.json({ error: firstError, fieldErrors }, { status: 400 });
    }

    const {
      buyerName,
      buyerPhone,
      address,
      articlePhotoUrls,
      type,
      gasCertified,
      price,
      description,
    } = parsed.data;

    // Vérifier abonnement ou crédits
    const { allowed } = await hasActiveSubscriptionOrCredits(session.userId);
    if (!allowed) {
      return NextResponse.json(
        { error: "Abonnement actif ou crédit requis pour finaliser et publier la mission." },
        { status: 403 }
      );
    }

    // Consommer le crédit si nécessaire
    await consumeCreditIfNeeded(session.userId);

    const publicToken = crypto.randomUUID();

    const updatedMission = await prisma.mission.update({
      where: { id: mission.id },
      data: {
        status: "CREATED",
        buyerName: buyerName !== undefined ? (buyerName ? buyerName.trim() : null) : mission.buyerName,
        buyerPhone: buyerPhone || mission.buyerPhone,
        address: address || mission.address,
        articlePhotoUrls,
        type,
        gasCertified: type === "GAS" ? Boolean(gasCertified) : false,
        price,
        description: description !== undefined ? (description ? description.trim() : null) : mission.description,
        publicToken,
        notifStatus: "PENDING",
      },
    });

    // Audit log
    await logEvent("MISSION_STATUS_CHANGED", "MISSION", mission.id, session.userId, {
      from: "DRAFT",
      to: "CREATED",
      source: mission.source,
      price,
      type,
    });

    // Notifier l'acheteur
    const trackingLink = `https://motolink.cm/s/${publicToken}`;
    const shopLabel = mission.vendor.shopName || mission.vendor.name || "Votre vendeur";
    const notifChannel = normalizeChannel(
      mission.vendor.preferredChannel || mission.vendor.notificationChannel
    );

    try {
      await sendNotification(
        updatedMission.buyerPhone,
        "mission_created",
        {
          buyerName: updatedMission.buyerName || "Client",
          shopName: shopLabel,
          link: trackingLink,
        },
        notifChannel
      );
    } catch (notifErr) {
      console.warn("[PATCH finalize-draft] Erreur notification acheteur:", notifErr);
    }

    return NextResponse.json({
      success: true,
      mission: {
        ...updatedMission,
        price: Number(updatedMission.price),
      },
    });
  } catch (error) {
    console.error("[PATCH /api/missions/[id]/finalize-draft] Erreur:", error);
    return NextResponse.json({ error: "Erreur serveur lors de la finalisation." }, { status: 500 });
  }
}

