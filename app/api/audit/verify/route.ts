import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { verifyChain } from "@/lib/audit";

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const url = new URL(request.url);
    const startId = url.searchParams.get("startId")?.trim() || undefined;

    const result = await verifyChain(startId);

    return NextResponse.json({
      valid: result.valid,
      brokenAt: result.brokenAt ?? null,
      totalLogs: result.totalLogs,
    });
  } catch (error) {
    console.error("[GET /api/audit/verify] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur lors de la vérification de la chaîne d'audit." },
      { status: 500 }
    );
  }
}

