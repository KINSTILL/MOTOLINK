import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { getActiveSubscription } from "@/lib/notchpay";
import {
  DirectoryError,
  checkContactRequestRateLimit,
  listContactRequests,
  requestContact,
} from "@/lib/directory";

const bodySchema = z.object({ driverId: z.string().min(1) });

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (session.role !== "VENDOR") {
      return NextResponse.json(
        { error: "Accès réservé aux vendeurs." },
        { status: 403 }
      );
    }

    const activeSub = await getActiveSubscription(session.userId);
    if (!activeSub) {
      return NextResponse.json(
        { error: "Abonnement actif requis pour contacter un livreur." },
        { status: 403 }
      );
    }

    if (!checkContactRequestRateLimit(session.userId)) {
      return NextResponse.json(
        { error: "Trop de demandes. Veuillez patienter une minute." },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Le champ « driverId » est requis." },
        { status: 400 }
      );
    }

    const contactRequest = await requestContact(
      session.userId,
      parsed.data.driverId
    );

    return NextResponse.json(
      {
        success: true,
        request: {
          id: contactRequest.id,
          status: contactRequest.status,
          driverNotified: contactRequest.driverNotifStatus === "sent",
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof DirectoryError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[POST /api/directory/contact-request] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'envoi de la demande de contact." },
      { status: 500 }
    );
  }
}

/** Vendeur : demandes envoyées (numéro visible uniquement si acceptée). Livreur : demandes reçues. */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const requests = await listContactRequests(session.userId, session.role);
    return NextResponse.json({ requests });
  } catch (error) {
    if (error instanceof DirectoryError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[GET /api/directory/contact-request] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des demandes." },
      { status: 500 }
    );
  }
}

