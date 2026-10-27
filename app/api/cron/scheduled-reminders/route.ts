import { NextResponse } from "next/server";
import { processScheduledMissionReminders } from "@/lib/scheduled-missions";

export async function GET() {
  try {
    const result = await processScheduledMissionReminders();
    return NextResponse.json({
      success: true,
      reminders: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[GET /api/cron/scheduled-reminders] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur lors du traitement des rappels programmés." },
      { status: 500 }
    );
  }
}

export async function POST() {
  return GET();
}
