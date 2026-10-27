import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { ensureReferralCode } from "@/lib/referral";
import { ensureVendorPublicSlug } from "@/lib/slug";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ user: null });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        phone: true,
        name: true,
        shopName: true,
        role: true,
        referralCode: true,
        publicSlug: true,
        sponsorDriverId: true,
        sponsorVendorId: true,
        referrerBadge: true,
        referrerCount: true,
        kycStatus: true,
        subscriptionStatus: true,
        showBuyerReliability: true,
        driverSlug: true,
        carnetVisible: true,
        carnetZones: true,
      },
    });

    if (user && user.role === "DRIVER" && !user.referralCode) {
      user.referralCode = await ensureReferralCode(user.id);
    }

    if (user && user.role === "VENDOR" && !user.publicSlug) {
      user.publicSlug = await ensureVendorPublicSlug(user.id);
    }

    return NextResponse.json({ user });
  } catch (error) {
    console.error("[GET /api/users/me] Erreur:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

