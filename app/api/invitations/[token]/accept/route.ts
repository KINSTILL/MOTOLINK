import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logEvent } from "@/lib/audit";
import { calculateReward, applyDiscount } from "@/lib/referral";
import { sendNotification } from "@/lib/notifications";

export async function POST(
  _request: Request,
  { params }: { params: { token: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Veuillez vous connecter pour accepter l'invitation." },
        { status: 401 }
      );
    }

    if (session.role === "VENDOR") {
      return NextResponse.json(
        { error: "Cette invitation est réservée aux livreurs." },
        { status: 403 }
      );
    }

    const invitation = await prisma.invitation.findUnique({
      where: { token: params.token },
      include: {
        vendor: {
          select: {
            id: true,
            shopName: true,
            name: true,
            phone: true,
          },
        },
      },
    });

    if (!invitation) {
      return NextResponse.json(
        { error: "Invitation introuvable." },
        { status: 404 }
      );
    }

    const now = new Date();

    if (invitation.expiresAt < now || invitation.status === "expired") {
      return NextResponse.json(
        { error: "Cette invitation a expiré." },
        { status: 410 }
      );
    }

    if (invitation.status === "accepted") {
      return NextResponse.json(
        { error: "Cette invitation a déjà été acceptée." },
        { status: 410 }
      );
    }

    const driverId = session.userId;
    const endsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Transaction atomique : acceptation invitation, parrainage, abonnement offert, flotte
    const result = await prisma.$transaction(async (tx) => {
      // 1. Mise à jour de l'invitation
      const updatedInvite = await tx.invitation.update({
        where: { id: invitation.id },
        data: {
          status: "accepted",
          acceptedAt: now,
        },
      });

      // 2. Mise à jour du rôle et du parrain sur le User livreur
      const updatedDriver = await tx.user.update({
        where: { id: driverId },
        data: {
          role: "DRIVER",
          sponsorVendorId: invitation.vendorId,
          subscriptionPaidBy: "vendor",
          subscriptionStatus: "ACTIVE",
        },
      });

      // 3. Création ou prolongation de la Subscription livreur (payée par le vendeur)
      const pspRef = `sponsored_${invitation.id}_${Date.now()}`;
      await tx.subscription.create({
        data: {
          userId: driverId,
          role: "DRIVER",
          plan: "WEEKLY",
          status: "ACTIVE",
          startsAt: now,
          endsAt,
          priceFCFA: 250,
          pspRef,
        },
      });

      // 4. Ajout direct dans FavoriteDriver avec source 'sponsored' et 3 missions prioritaires
      await tx.favoriteDriver.upsert({
        where: {
          buyerId_driverId: {
            buyerId: invitation.vendorId,
            driverId,
          },
        },
        create: {
          buyerId: invitation.vendorId,
          driverId,
          source: "sponsored",
          priorityMissionsRemaining: 3,
        },
        update: {
          source: "sponsored",
          priorityMissionsRemaining: 3,
        },
      });

      // 5. Enregistrement du Referral VENDOR_TO_DRIVER
      const referral = await tx.referral.upsert({
        where: { refereeId: driverId },
        create: {
          referrerId: invitation.vendorId,
          refereeId: driverId,
          type: "VENDOR_TO_DRIVER",
          status: "ACTIVE",
          priorityMissionsRemaining: 3,
          priorityMissionsUsed: 0,
        },
        update: {
          referrerId: invitation.vendorId,
          type: "VENDOR_TO_DRIVER",
          status: "ACTIVE",
          priorityMissionsRemaining: 3,
        },
      });

      return { updatedInvite, updatedDriver, referral };
    });

    // 6. Calcul et application de la réduction vendeur (-10% à -50%)
    const reward = await calculateReward(invitation.vendorId, "VENDOR_TO_DRIVER");
    if (reward.discountPercent > 0) {
      await applyDiscount(invitation.vendorId, reward.discountPercent);
    }

    // 7. AuditLogs
    await logEvent(
      "INVITATION_ACCEPTED",
      "INVITATION",
      invitation.id,
      driverId,
      {
        invitationId: invitation.id,
        vendorId: invitation.vendorId,
        driverId,
        acceptedAt: now.toISOString(),
      }
    );

    await logEvent(
      "REFERRAL_CREATED",
      "REFERRAL",
      result.referral.id,
      invitation.vendorId,
      {
        referralId: result.referral.id,
        referrerId: invitation.vendorId,
        refereeId: driverId,
        type: "VENDOR_TO_DRIVER",
        priorityMissionsRemaining: 3,
        vendorDiscountEarned: reward.discountPercent,
      }
    );

    // 8. Notification non-bloquante au vendeur
    try {
      const driverName = result.updatedDriver.name || "Votre coursier";
      await sendNotification(
        invitation.vendor.phone,
        "driver_assigned",
        {
          buyerName: invitation.vendor.name || "Commerçant",
          shopName: invitation.vendor.shopName || "MotoLink",
          driverName,
          link: "https://motolink.cm/dashboard/vendor/fleet",
        },
        "whatsapp"
      );
    } catch {
      // Ignorer
    }

    return NextResponse.json({
      success: true,
      redirectTo: "/dashboard/driver",
      message: "Invitation acceptée avec succès. Bienvenue dans la flotte !",
    });
  } catch (error) {
    console.error("[/api/invitations/[token]/accept POST] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur serveur lors de l'acceptation de l'invitation." },
      { status: 500 }
    );
  }
}

