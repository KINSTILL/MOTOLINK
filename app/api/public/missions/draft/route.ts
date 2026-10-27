import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import prisma from "@/lib/prisma";
import { normalizePhone } from "@/lib/utils";
import { logEvent } from "@/lib/audit";
import { sendNotification, normalizeChannel } from "@/lib/notifications";
import {
  checkPublicDraftRateLimit,
  hasActiveSubscriptionOrCredits,
} from "@/lib/social-commerce";

const draftSchema = z.object({
  slug: z.string().trim().min(1, "Le slug du vendeur est requis."),
  buyerName: z.string().trim().max(100).optional().nullable(),
  buyerPhone: z
    .string()
    .transform((val) => normalizePhone(val))
    .refine((val) => /^\+237\d{9}$/.test(val), {
      message: "Numéro de téléphone camerounais invalide (+237XXXXXXXXX).",
    }),
  address: z
    .string()
    .trim()
    .min(10, "L'adresse / quartier doit contenir au moins 10 caractères."),
  description: z.string().trim().max(300).optional().nullable(),
});

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "127.0.0.1";
}

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    if (!checkPublicDraftRateLimit(ip)) {
      return NextResponse.json(
        { error: "Limite de soumissions atteinte. Veuillez réessayer plus tard." },
        { status: 429 }
      );
    }

    const body = await request.json();
    const parsed = draftSchema.safeParse(body);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      const firstError = Object.values(fieldErrors).flat()[0] || "Données invalides.";
      return NextResponse.json({ error: firstError, fieldErrors }, { status: 400 });
    }

    const { slug, buyerName, buyerPhone, address, description } = parsed.data;

    const vendor = await prisma.user.findUnique({
      where: { publicSlug: slug },
      select: {
        id: true,
        phone: true,
        name: true,
        shopName: true,
        role: true,
        preferredChannel: true,
        notificationChannel: true,
      },
    });

    if (!vendor || vendor.role !== "VENDOR") {
      return NextResponse.json({ error: "Lien de livraison introuvable ou invalide." }, { status: 404 });
    }

    const { allowed } = await hasActiveSubscriptionOrCredits(vendor.id);
    if (!allowed) {
      return NextResponse.json(
        { error: "Ce vendeur ne peut pas recevoir de commandes actuellement." },
        { status: 403 }
      );
    }

    const draftToken = crypto.randomBytes(16).toString("hex");

    const mission = await prisma.mission.create({
      data: {
        vendorId: vendor.id,
        buyerName: buyerName ? buyerName.trim() : null,
        buyerPhone,
        address: address.trim(),
        description: description ? description.trim() : null,
        price: 0,
        type: "PARCEL",
        status: "DRAFT",
        source: "link",
        submittedByBuyer: true,
        draftToken,
        notifStatus: "PENDING",
      },
    });

    await logEvent("DRAFT_CREATED_VIA_LINK", "MISSION", mission.id, vendor.id, {
      slug,
      draftToken,
      buyerPhone,
      source: "link",
    });

    // Notifier le vendeur
    const vendorChannel = normalizeChannel(vendor.preferredChannel || vendor.notificationChannel);
    const notifName = buyerName ? buyerName.trim() : "Un acheteur";
    await sendNotification(
      vendor.phone,
      "draft_received",
      {
        buyerName: notifName,
        link: "https://motolink.cm/missions/drafts",
      },
      vendorChannel
    );

    return NextResponse.json(
      {
        success: true,
        draftToken,
        draftId: mission.id,
        message: "Merci ! Votre commande a été enregistrée. Le vendeur va préparer votre colis.",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/public/missions/draft] Erreur:", error);
    return NextResponse.json({ error: "Erreur serveur lors de la soumission." }, { status: 500 });
  }
}

