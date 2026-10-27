import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logEvent } from "@/lib/audit";
import { generateSlug } from "@/lib/carnet";

const bodySchema = z.object({
  carnetVisible: z.boolean().optional(),
  carnetZones: z.string().max(200).optional(),
});

/**
 * PATCH /api/users/me/carnet-settings
 * Active/désactive la visibilité du carnet public + enregistre les zones.
 * Réservé aux livreurs. Génère le slug à la première activation.
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "DRIVER") {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides" }, { status: 400 });
    }

    const current = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { driverSlug: true, name: true, carnetVisible: true },
    });
    if (!current) {
      return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
    }

    let slug = current.driverSlug;
    if (!slug) {
      slug = generateSlug(current.name || "driver");
      // sécurité : si collision, régénère
      let exists = await prisma.user.findUnique({ where: { driverSlug: slug } });
      let attempts = 0;
      while (exists && attempts < 5) {
        slug = generateSlug(current.name || "driver");
        exists = await prisma.user.findUnique({ where: { driverSlug: slug } });
        attempts++;
      }
    }

    const updated = await prisma.user.update({
      where: { id: session.userId },
      data: {
        driverSlug: slug,
        ...(parsed.data.carnetVisible !== undefined && {
          carnetVisible: parsed.data.carnetVisible,
        }),
        ...(parsed.data.carnetZones !== undefined && {
          carnetZones: parsed.data.carnetZones,
        }),
      },
      select: {
        driverSlug: true,
        carnetVisible: true,
        carnetZones: true,
      },
    });

    if (parsed.data.carnetVisible !== undefined) {
      await logEvent(
        "CARNET_VISIBILITY_TOGGLED",
        "USER",
        session.userId,
        session.userId,
        { visible: parsed.data.carnetVisible }
      );
    }

    return NextResponse.json({ success: true, carnet: updated });
  } catch (error) {
    console.error("Erreur PATCH carnet-settings:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
