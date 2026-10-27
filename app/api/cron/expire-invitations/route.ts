import { NextResponse } from "next/server";
import { expireStaleInvitations } from "@/lib/referral";

export async function GET() {
  try {
    const expiredCount = await expireStaleInvitations();

    return NextResponse.json({
      success: true,
      expiredCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[GET /api/cron/expire-invitations] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'expiration des invitations." },
      { status: 500 }
    );
  }
}

export async function POST() {
  return GET();
}

