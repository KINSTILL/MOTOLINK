import prisma from "@/lib/prisma";
import { logEvent } from "@/lib/audit";
import { sendNotification } from "@/lib/notifications";

/**
 * Met à jour le badge du parrain en fonction du nombre de filleuls ayant franchi les paliers
 * - Filleul à 5 livraisons (ou 0 COMPLETED mais actif) : "sponsor" (Parrain)
 * - 1 filleul COMPLETED (20 livraisons) : "sponsor_confirmed" (Parrain confirmé)
 * - 3 filleuls COMPLETED : "sponsor_gold" (Parrain Or)
 * - 5+ filleuls COMPLETED : "sponsor_platinum" (Parrain Platine)
 */
export async function updateReferrerBadge(referrerId: string): Promise<string | null> {
  const completedCount = await prisma.referral.count({
    where: {
      referrerId,
      type: "DRIVER_TO_DRIVER",
      status: "COMPLETED",
    },
  });

  let newBadge: string | null = null;
  if (completedCount >= 5) {
    newBadge = "sponsor_platinum";
  } else if (completedCount >= 3) {
    newBadge = "sponsor_gold";
  } else if (completedCount >= 1) {
    newBadge = "sponsor_confirmed";
  } else {
    // Vérifier si au moins un filleul a complété 5 livraisons
    const referrals = await prisma.referral.findMany({
      where: {
        referrerId,
        type: "DRIVER_TO_DRIVER",
      },
      include: {
        referee: {
          select: {
            driverMissions: {
              where: { status: "DELIVERED" },
              select: { id: true },
            },
          },
        },
      },
    });

    const has5MissionsReferee = referrals.some(
      (r) => r.referee.driverMissions.length >= 5
    );
    if (has5MissionsReferee) {
      newBadge = "sponsor";
    }
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: referrerId },
    select: { referrerBadge: true, referrerCount: true },
  });

  if (currentUser) {
    const badgeChanged = currentUser.referrerBadge !== newBadge;
    const countChanged = currentUser.referrerCount !== completedCount;

    if (badgeChanged || countChanged) {
      await prisma.user.update({
        where: { id: referrerId },
        data: {
          referrerBadge: newBadge,
          referrerCount: completedCount,
        },
      });

      if (badgeChanged && newBadge) {
        await logEvent(
          "REFERRER_BADGE_UPDATED",
          "USER",
          referrerId,
          referrerId,
          {
            previousBadge: currentUser.referrerBadge,
            newBadge,
            completedCount,
          }
        );
      }
    }
  }

  return newBadge;
}

/**
 * Vérifie et actualise la progression d'un livreur filleul après la validation d'une livraison
 * Déclenchée après chaque mission DELIVERED (dans le flux de preuve)
 */
export async function checkReferralProgress(driverId: string): Promise<void> {
  const referral = await prisma.referral.findFirst({
    where: {
      refereeId: driverId,
      type: "DRIVER_TO_DRIVER",
    },
    include: {
      referrer: {
        select: {
          id: true,
          phone: true,
          name: true,
        },
      },
      referee: {
        select: {
          id: true,
          phone: true,
          name: true,
        },
      },
    },
  });

  if (!referral) return;

  const deliveredCount = await prisma.mission.count({
    where: {
      driverId,
      status: "DELIVERED",
    },
  });

  const refereeDisplayName = referral.referee.name || referral.referee.phone;
  const referrerDisplayName = referral.referrer.name || "Livreur";

  const existingLogs = await prisma.auditLog.findMany({
    where: {
      eventType: "REFERRAL_COMPLETED",
      entityId: referral.id,
    },
    select: { metadata: true },
  });

  // PALIER 1 : 5 livraisons (au moins 5 livraisons atteintes)
  if (deliveredCount >= 5) {
    const alreadyLogged5 = existingLogs.some(
      (l) => (l.metadata as any)?.milestone === 5
    );

    if (!alreadyLogged5) {
      await updateReferrerBadge(referral.referrerId);

      await logEvent(
        "REFERRAL_COMPLETED",
        "REFERRAL",
        referral.id,
        driverId,
        {
          milestone: 5,
          referrerId: referral.referrerId,
          refereeId: driverId,
          deliveredCount,
        }
      );

      try {
        await sendNotification(
          referral.referrer.phone,
          "driver_referral_milestone_5",
          {
            driverName: referrerDisplayName,
            refereeName: refereeDisplayName,
          },
          "whatsapp"
        );
      } catch (notifErr) {
        console.warn("[referral-progress] Notification palier 5 non-bloquante:", notifErr);
      }
    }
  }

  // PALIER 2 : 20 livraisons (statut COMPLETED)
  if (deliveredCount >= 20 && referral.status !== "COMPLETED") {
    const alreadyLogged20 = existingLogs.some(
      (l) => (l.metadata as any)?.milestone === 20
    );

    if (!alreadyLogged20) {
      await prisma.referral.update({
        where: { id: referral.id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
        },
      });

      await updateReferrerBadge(referral.referrerId);

      await logEvent(
        "REFERRAL_COMPLETED",
        "REFERRAL",
        referral.id,
        driverId,
        {
          milestone: 20,
          referrerId: referral.referrerId,
          refereeId: driverId,
          deliveredCount,
        }
      );

      try {
        await sendNotification(
          referral.referrer.phone,
          "driver_referral_milestone_20",
          {
            driverName: referrerDisplayName,
            refereeName: refereeDisplayName,
          },
          "whatsapp"
        );
      } catch (notifErr) {
        console.warn("[referral-progress] Notification palier 20 non-bloquante:", notifErr);
      }
    }
  }
}

