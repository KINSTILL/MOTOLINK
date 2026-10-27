import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { AUTH_COOKIE_NAME, ONBOARDING_COOKIE_NAME, getSession } from "@/lib/auth";

const updateProfileSchema = z.object({
  name: z.string().max(80).nullable().optional(),
  shopName: z.string().max(80).nullable().optional(),
  city: z.string().max(60).nullable().optional(),
  workZones: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  brandingLogoUrl: z.string().nullable().optional(),
  brandingColorHex: z.string().max(20).nullable().optional(),
  catalogUrl: z.string().nullable().optional(),
  notificationChannel: z.enum(["WHATSAPP", "SMS", "whatsapp", "sms"]).optional(),
  preferredChannel: z.enum(["whatsapp", "sms", "WHATSAPP", "SMS"]).optional(),
});

export async function PATCH(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = updateProfileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides" }, { status: 400 });
    }

    const rawChannel =
      parsed.data.preferredChannel || parsed.data.notificationChannel;
    const normalizedLower = rawChannel
      ? rawChannel.toLowerCase() === "sms"
        ? "sms"
        : "whatsapp"
      : undefined;
    const normalizedUpper = normalizedLower
      ? normalizedLower === "sms"
        ? "SMS"
        : "WHATSAPP"
      : undefined;

    const updated = await prisma.user.update({
      where: { id: session.userId },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.shopName !== undefined
          ? { shopName: parsed.data.shopName }
          : {}),
        ...(parsed.data.city !== undefined
          ? { city: parsed.data.city?.trim() || null }
          : {}),
        ...(parsed.data.workZones !== undefined
          ? { workZones: Array.from(new Set(parsed.data.workZones)) }
          : {}),
        ...(parsed.data.brandingLogoUrl !== undefined
          ? { brandingLogoUrl: parsed.data.brandingLogoUrl }
          : {}),
        ...(parsed.data.brandingColorHex !== undefined
          ? { brandingColorHex: parsed.data.brandingColorHex }
          : {}),
        ...(parsed.data.catalogUrl !== undefined
          ? { catalogUrl: parsed.data.catalogUrl }
          : {}),
        ...(normalizedLower !== undefined
          ? {
              preferredChannel: normalizedLower,
              notificationChannel: normalizedUpper,
            }
          : {}),
      },
    });

    return NextResponse.json({
      user: {
        id: updated.id,
        name: updated.name,
        shopName: updated.shopName,
        phone: updated.phone,
        role: updated.role,
        preferredChannel: updated.preferredChannel,
        notificationChannel: updated.notificationChannel,
      },
    });
  } catch (error) {
    console.error("[PATCH /api/profile] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour du profil." },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    await prisma.user.delete({
      where: { id: session.userId },
    });

    const response = NextResponse.json({ success: true });
    response.cookies.delete(AUTH_COOKIE_NAME);
    response.cookies.delete(ONBOARDING_COOKIE_NAME);
    return response;
  } catch (error) {
    console.error("[DELETE /api/profile] Erreur:", error);
    return NextResponse.json(
      { error: "Impossible de supprimer le compte." },
      { status: 500 }
    );
  }
}
