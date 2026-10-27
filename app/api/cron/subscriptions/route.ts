import { NextResponse } from "next/server";
import { runDailySubscriptionCron } from "@/lib/notchpay";
import { guardCron } from "@/lib/cron-auth";

export async function GET(request: Request) {
  const denied = guardCron(request);
  if (denied) return denied;

  try {
    const result = await runDailySubscriptionCron();
    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[GET /api/cron/subscriptions] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'exécution du cron d'abonnements." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
