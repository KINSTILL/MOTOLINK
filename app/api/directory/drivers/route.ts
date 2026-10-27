import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getActiveSubscription } from "@/lib/notchpay";
import { listDirectoryDrivers } from "@/lib/directory";

/**
 * Annuaire des livreurs ayant consenti à être visibles.
 * Réservé aux vendeurs abonnés. Ne retourne JAMAIS de numéro de téléphone.
 */
export async function GET(request: Request) {
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
        { error: "Abonnement actif requis pour consulter l'annuaire." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limitParam = parseInt(searchParams.get("limit") || "20", 10);
    const statusParam = (searchParams.get("status") || "").toLowerCase();
    const status = (["available", "on_mission", "offline"] as const).find(
      (s) => s === statusParam
    );

    const drivers = await listDirectoryDrivers({
      vendorId: session.userId,
      city: searchParams.get("city") || undefined,
      search: searchParams.get("search") || undefined,
      status,
      verifiedOnly: searchParams.get("verified") === "true",
      limit: Number.isNaN(limitParam) ? 20 : limitParam,
    });

    return NextResponse.json({ drivers });
  } catch (error) {
    console.error("[GET /api/directory/drivers] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération de l'annuaire." },
      { status: 500 }
    );
  }
}

