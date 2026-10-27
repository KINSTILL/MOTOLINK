import { NextRequest, NextResponse } from "next/server";
import { getCarnetBySlug } from "@/lib/carnet";

/**
 * GET /api/public/drivers/[slug]
 * Lecture publique (sans auth) du carnet de bord d'un livreur.
 * getCarnetBySlug ne renvoie que des champs non sensibles.
 */
export async function GET(
  _request: Request,
  { params }: { params: { slug: string } }
) {
  try {
    const carnet = await getCarnetBySlug(params.slug);
    if (!carnet) {
      return NextResponse.json({ error: "Carnet introuvable" }, { status: 404 });
    }
    return NextResponse.json({ carnet });
  } catch (error) {
    console.error("Erreur GET public drivers:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
