import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logEvent } from "@/lib/audit";
import { calculateReward, applyDiscount } from "@/lib/referral";

export async function POST() {
  try {
    const session = await getSession();
    if (!session || session.role !== "DRIVER") {
      return NextResponse.json(
        { error: "Accès réservé aux livreurs." },
        { status: 403 }
      );
    }

    const driver = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        name: true,
        phone: true,
        sponsorVendorId: true,
      },
    });

    if (!driver || !driver.sponsorVendorId) {
      return NextResponse.json(
        { error: "Vous n'avez pas de parrain vendeur actif." },
        { status: 400 }
      );
    }

    const sponsorVendorId = driver.sponsorVendorId;

    await prisma.$transaction(async (tx) => {
      // 1. Désolidarisation du livreur
      await tx.user.update({
        where: { id: driver.id },
        data: {
          sponsorVendorId: null,
          subscriptionPaidBy: "self",
        },
      });

      // 2. Annulation de l'abonnement parrainé
      await tx.subscription.updateMany({
        where: {
          userId: driver.id,
          pspRef: { startsWith: "sponsored_" },
          status: "ACTIVE",
        },
        data: {
          status: "CANCELLED",
        },
      });

      // 3. Retrait de la flotte du vendeur
      await tx.favoriteDriver.deleteMany({
        where: {
          buyerId: sponsorVendorId,
          driverId: driver.id,
        },
      });

      // 4. Clôture du parrainage
      await tx.referral.updateMany({
        where: {
          refereeId: driver.id,
          referrerId: sponsorVendorId,
        },
        data: {
          status: "CANCELLED",
          completedAt: new Date(),
        },
      });
    });

    // 5. Recalcul de la réduction du vendeur
    const vendorReward = await calculateReward(sponsorVendorId, "VENDOR_TO_DRIVER");
    await applyDiscount(sponsorVendorId, vendorReward.discountPercent);

    // 6. Journal d'audit append-only
    await logEvent(
      "UNSPONSORED",
      "DRIVER",
      driver.id,
      driver.id,
      {
        driverId: driver.id,
        previousSponsorVendorId: sponsorVendorId,
      }
    );

    return NextResponse.json({
      success: true,
      message: "Désolidarisation réussie. Vous pouvez désormais vous abonner directement.",
    });
  } catch (error) {
    console.error("[/api/drivers/unsponsor POST] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur serveur lors de la désolidarisation." },
      { status: 500 }
    );
  }
}

