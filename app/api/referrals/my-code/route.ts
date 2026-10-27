import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { ensureReferralCode } from "@/lib/referral";

export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== "DRIVER") {
      return NextResponse.json(
        { error: "Accès réservé aux livreurs connectés." },
        { status: 403 }
      );
    }

    const code = await ensureReferralCode(session.userId);
    const shareUrl = `https://motolink.cm/join?ref=${code}`;
    const message = `Rejoins MotoLink avec mon code ${code} et reçois 3 missions prioritaires : ${shareUrl}`;

    return NextResponse.json({
      code,
      shareUrl,
      message,
    });
  } catch (error) {
    console.error("[GET /api/referrals/my-code] Erreur:", error);
    return NextResponse.json(
      { error: "Impossible de récupérer votre code de parrainage." },
      { status: 500 }
    );
  }
}

