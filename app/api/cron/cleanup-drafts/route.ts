import { NextResponse } from "next/server";
import { cleanupExpiredDrafts } from "@/lib/social-commerce";

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { deletedCount } = await cleanupExpiredDrafts();

    return NextResponse.json({
      success: true,
      deletedCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[CRON cleanup-drafts] Erreur:", error);
    return NextResponse.json({ error: "Erreur lors du nettoyage des brouillons" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}

