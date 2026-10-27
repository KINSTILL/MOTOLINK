import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  computeBuyerReliability,
  normalizePhone,
} from "@/lib/buyer-reliability";

/**
 * GET /api/buyer-reliability?phone=XXXX
 *
 * Retourne le score de fiabilité client agrégé (par téléphone hashé) au vendeur.
 * - Réservé aux vendeurs.
 * - Conditionné par User.showBuyerReliability (N4). Si désactivé → { enabled:false }.
 * - JAMAIS bloquant : renvoie toujours 200 sans PII (le téléphone n'est jamais renvoyé).
 */
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    if (session.role !== "VENDOR") {
      return NextResponse.json({ enabled: false, reliability: null });
    }

    const vendor = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { showBuyerReliability: true },
    });

    // Le vendeur n'a pas activé l'affichage → on ne calcule rien.
    if (!vendor?.showBuyerReliability) {
      return NextResponse.json({ enabled: false, reliability: null });
    }

    const { searchParams } = new URL(request.url);
    const phone = normalizePhone(searchParams.get("phone") || "");

    if (!phone) {
      return NextResponse.json(
        { enabled: true, reliability: null, error: "Numéro requis." },
        { status: 400 }
      );
    }

    const reliability = await computeBuyerReliability(phone);

    // Aucune PII renvoyée : uniquement l'agrégat.
    return NextResponse.json({ enabled: true, reliability });
  } catch (error) {
    console.error("[GET /api/buyer-reliability] Erreur (non-bloquant) :", error);
    return NextResponse.json({ enabled: false, reliability: null });
  }
}
