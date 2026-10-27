import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logEvent } from "@/lib/audit";

const callInitiatedSchema = z.object({
  phase: z.enum(["before_departure", "at_arrival"]),
  method: z.enum(["tel", "whatsapp"]),
});

/**
 * POST /api/missions/[id]/call-initiated
 *
 * Enregistre l'intention d'appel du LIVREUR à un moment critique :
 *  - "before_departure" : juste après la photo PICKED_UP (avant de partir)
 *  - "at_arrival"       : juste avant la validation NEARBY (à l'arrivée)
 *
 * On journalise uniquement l'horodatage de l'intention (le clic sur "Appeler" /
 * "WhatsApp"). Cela ne prouve PAS que l'appel a abouti. Aucun blocage : le
 * livreur reste libre de continuer sans appeler.
 */
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
    const parsed = callInitiatedSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Requête invalide (phase ou méthode incorrecte)." },
        { status: 400 }
      );
    }

    const mission = await prisma.mission.findFirst({
      where: {
        OR: [{ id: params.id }, { publicToken: params.id }],
      },
      select: {
        id: true,
        driverId: true,
        buyerPhone: true,
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
        { error: "Seul le livreur assigné peut enregistrer un appel." },
        { status: 403 }
      );
    }

    const { phase, method } = parsed.data;
    const now = new Date();

    if (phase === "before_departure") {
      await prisma.mission.update({
        where: { id: mission.id },
        data: {
          driverCallBeforeDepartureAt: now,
          driverCallBeforeDepartureMethod: method,
        },
      });
    } else {
      await prisma.mission.update({
        where: { id: mission.id },
        data: {
          driverCallAtArrivalAt: now,
          driverCallAtArrivalMethod: method,
        },
      });
    }

    await logEvent(
      phase === "before_departure"
        ? "DRIVER_CALL_INITIATED_BEFORE_DEPARTURE"
        : "DRIVER_CALL_INITIATED_AT_ARRIVAL",
      "MISSION",
      mission.id,
      session.userId,
      {
        phase,
        method,
        callTarget: mission.buyerPhone,
        note: "Horodatage de l'intention d'appel (n'atteste pas que l'appel a abouti).",
      }
    );

    return NextResponse.json({
      success: true,
      phase,
      method,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error(
      "[POST /api/missions/[id]/call-initiated] Erreur:",
      error
    );
    return NextResponse.json(
      { error: "Erreur interne lors de l'enregistrement de l'appel." },
      { status: 500 }
    );
  }
}
