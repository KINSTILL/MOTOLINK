import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logEvent } from "@/lib/audit";
import { verifyDeliveryCode } from "@/lib/delivery-code";

const MAX_ATTEMPTS = 3;

const verifyCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "Le code doit contenir exactement 4 chiffres."),
});

export async function POST(
  request: Request,
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

    const body = await request.json().catch(() => ({}));
    const parsed = verifyCodeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Code invalide (4 chiffres attendus)." },
        { status: 400 }
      );
    }

    const mission = await prisma.mission.findFirst({
      where: {
        OR: [{ id: params.id }, { publicToken: params.id }],
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
        { error: "Seul le livreur assigné peut valider le code." },
        { status: 403 }
      );
    }

    if (!mission.deliveryCode) {
      return NextResponse.json(
        { error: "Aucun code de remise n'a été généré pour cette mission." },
        { status: 400 }
      );
    }

    // Déjà validé : succès idempotent
    if (mission.deliveryCodeVerifiedAt) {
      return NextResponse.json({ success: true, alreadyVerified: true });
    }

    // Blocage après 3 échecs
    if (mission.deliveryCodeAttempts >= MAX_ATTEMPTS) {
      return NextResponse.json(
        {
          error:
            "Code incorrect 3 fois. Contactez le support ou demandez un nouveau code au vendeur.",
          remainingAttempts: 0,
          locked: true,
        },
        { status: 429 }
      );
    }

    const isValid = await verifyDeliveryCode(parsed.data.code, mission.deliveryCode);

    if (!isValid) {
      const updated = await prisma.mission.update({
        where: { id: mission.id },
        data: { deliveryCodeAttempts: { increment: 1 } },
        select: { deliveryCodeAttempts: true },
      });

      await logEvent(
        "DELIVERY_CODE_FAILED",
        "MISSION",
        mission.id,
        session.userId,
        { attempts: updated.deliveryCodeAttempts }
      );

      const remainingAttempts = Math.max(0, MAX_ATTEMPTS - updated.deliveryCodeAttempts);

      return NextResponse.json(
        {
          error: "Code incorrect. Réessayez.",
          remainingAttempts,
          locked: remainingAttempts <= 0,
        },
        { status: 400 }
      );
    }

    // Code valide : enregistre la validation, remet les tentatives à 0
    await prisma.mission.update({
      where: { id: mission.id },
      data: {
        deliveryCodeVerifiedAt: new Date(),
        deliveryCodeAttempts: 0,
      },
    });

    await logEvent(
      "DELIVERY_CODE_VERIFIED",
      "MISSION",
      mission.id,
      session.userId,
      { note: "Code de remise validé par le livreur." }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(
      "[POST /api/missions/[id]/verify-code] Erreur:",
      error
    );
    return NextResponse.json(
      { error: "Erreur interne lors de la vérification du code." },
      { status: 500 }
    );
  }
}
