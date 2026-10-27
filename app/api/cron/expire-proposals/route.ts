import { NextResponse } from "next/server";
import { expireStaleDirectProposals } from "@/lib/proposals";
import prisma from "@/lib/prisma";
import { guardCron } from "@/lib/cron-auth";

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

export async function GET(request: Request) {
  const denied = guardCron(request);
  if (denied) return denied;

  try {
    const cutoff = new Date(Date.now() - TWO_HOURS_MS);
    const expired = await prisma.directProposal.updateMany({
      where: {
        status: "PENDING",
        createdAt: { lt: cutoff },
      },
      data: {
        status: "EXPIRED",
        respondedAt: new Date(),
      },
    });

    await expireStaleDirectProposals();

    return NextResponse.json({
      success: true,
      expiredCount: expired.count,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[GET /api/cron/expire-proposals] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'expiration des propositions." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
