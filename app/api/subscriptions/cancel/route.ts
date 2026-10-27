import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getActiveSubscription } from "@/lib/notchpay";

export async function POST() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const activeSub = await getActiveSubscription(session.userId);
    if (!activeSub) {
      return NextResponse.json(
        { error: "Aucun abonnement actif à annuler." },
        { status: 404 }
      );
    }

    const cancelled = await prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.update({
        where: { id: activeSub.id },
        data: {
          status: "CANCELLED",
        },
      });

      await tx.user.update({
        where: { id: session.userId },
        data: {
          subscriptionStatus: "CANCELLED",
        },
      });

      return sub;
    });

    return NextResponse.json({
      success: true,
      message:
        "Le renouvellement automatique a été annulé. Votre abonnement reste actif jusqu'à sa date d'échéance.",
      subscription: cancelled,
    });
  } catch (error) {
    console.error("[POST /api/subscriptions/cancel] Erreur:", error);
    return NextResponse.json(
      { error: "Impossible d'annuler le renouvellement." },
      { status: 500 }
    );
  }
}

