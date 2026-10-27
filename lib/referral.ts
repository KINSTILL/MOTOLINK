import crypto from "crypto";
import prisma from "@/lib/prisma";
import { logEvent } from "@/lib/audit";

/**
 * Génère un code de parrainage unique sous la forme MOTO-{SLUG}-{YEAR}
 */
export async function generateReferralCode(name: string): Promise<string> {
  const clean = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  const slug = clean.slice(0, 10) || "USER";
  const year = new Date().getFullYear();
  let candidate = `MOTO-${slug}-${year}`;

  const existing = await prisma.user.findUnique({
    where: { referralCode: candidate },
  });

  if (!existing) return candidate;

  // En cas de collision, ajoute un suffixe numérique séquentiel (-2, -3, ...)
  let suffix = 2;
  while (true) {
    const candidateWithSuffix = `${candidate}-${suffix}`;
    const exists = await prisma.user.findUnique({
      where: { referralCode: candidateWithSuffix },
    });
    if (!exists) return candidateWithSuffix;
    suffix++;
  }
}

/**
 * Assure qu'un utilisateur dispose d'un code de parrainage et le sauvegarde en DB si nécessaire
 */
export async function ensureReferralCode(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, referralCode: true, name: true, phone: true },
  });

  if (!user) {
    throw new Error("Utilisateur introuvable");
  }

  if (user.referralCode) {
    return user.referralCode;
  }

  const baseName = user.name || "LIVREUR";
  const code = await generateReferralCode(baseName);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      referralCode: code,
      referralCodeGeneratedAt: new Date(),
    },
  });

  return code;
}

/**
 * Génère un token aléatoire sécurisé de 32 caractères hexadécimaux pour l'invitation
 */
export function generateInvitationToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

export interface RewardCalculation {
  discountPercent: number;
  badge: string;
  activeCount: number;
  nextTarget: number;
  nextDiscount: number;
}

/**
 * Calcule la récompense et le pourcentage de réduction selon le nombre de parrainages actifs
 * - 1 actif  -> 10%
 * - 3 actifs -> 20%
 * - 5 actifs -> 30%
 * - 10 actifs -> 50%
 */
export async function calculateReward(
  referrerId: string,
  type: "VENDOR_TO_DRIVER" | "DRIVER_TO_DRIVER" = "VENDOR_TO_DRIVER"
): Promise<RewardCalculation> {
  const count = await prisma.referral.count({
    where: {
      referrerId,
      status: type === "VENDOR_TO_DRIVER" ? "ACTIVE" : "COMPLETED",
    },
  });

  if (count >= 10) {
    return {
      discountPercent: 50,
      badge: "Parrain Diamant (-50%)",
      activeCount: count,
      nextTarget: 10,
      nextDiscount: 50,
    };
  }
  if (count >= 5) {
    return {
      discountPercent: 30,
      badge: "Parrain Or (-30%)",
      activeCount: count,
      nextTarget: 10,
      nextDiscount: 50,
    };
  }
  if (count >= 3) {
    return {
      discountPercent: 20,
      badge: "Parrain Argent (-20%)",
      activeCount: count,
      nextTarget: 5,
      nextDiscount: 30,
    };
  }
  if (count >= 1) {
    return {
      discountPercent: 10,
      badge: "Parrain Bronze (-10%)",
      activeCount: count,
      nextTarget: 3,
      nextDiscount: 20,
    };
  }

  return {
    discountPercent: 0,
    badge: "Nouveau Parrain",
    activeCount: 0,
    nextTarget: 1,
    nextDiscount: 10,
  };
}

/**
 * Applique une réduction de parrainage sur l'utilisateur si elle n'a pas encore été consommée
 */
export async function applyDiscount(
  userId: string,
  discountPercent: number
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralDiscount: true, referralDiscountUsed: true },
  });

  if (!user || user.referralDiscountUsed) return;

  if (discountPercent > user.referralDiscount) {
    await prisma.user.update({
      where: { id: userId },
      data: { referralDiscount: discountPercent },
    });
  }
}

/**
 * Consomme une mission prioritaire lors de l'acceptation d'une mission provenant du parrain
 */
export async function usePriorityMission(
  driverId: string,
  missionId: string,
  vendorId?: string
): Promise<boolean> {
  const referral = await prisma.referral.findFirst({
    where: {
      refereeId: driverId,
      ...(vendorId ? { referrerId: vendorId } : {}),
      status: "ACTIVE",
      priorityMissionsRemaining: { gt: 0 },
    },
  });

  if (!referral) return false;

  const nextRemaining = referral.priorityMissionsRemaining - 1;
  const nextUsed = referral.priorityMissionsUsed + 1;

  await prisma.$transaction([
    prisma.referral.update({
      where: { id: referral.id },
      data: {
        priorityMissionsRemaining: nextRemaining,
        priorityMissionsUsed: nextUsed,
      },
    }),
    prisma.favoriteDriver.updateMany({
      where: {
        buyerId: referral.referrerId,
        driverId,
      },
      data: {
        priorityMissionsRemaining: nextRemaining,
      },
    }),
  ]);

  try {
    await logEvent(
      "PRIORITY_MISSION_USED",
      "REFERRAL",
      referral.id,
      driverId,
      {
        missionId,
        referrerId: referral.referrerId,
        priorityMissionsRemaining: nextRemaining,
        priorityMissionsUsed: nextUsed,
      }
    );
  } catch (err) {
    console.warn("[referral] Audit PRIORITY_MISSION_USED non-bloquant:", err);
  }

  return true;
}

/**
 * Expire les invitations en attente dont la date de validité est dépassée
 */
export async function expireStaleInvitations(): Promise<number> {
  const now = new Date();
  const staleInvitations = await prisma.invitation.findMany({
    where: {
      status: "pending",
      expiresAt: { lt: now },
    },
  });

  if (staleInvitations.length === 0) return 0;

  for (const inv of staleInvitations) {
    await prisma.invitation.update({
      where: { id: inv.id },
      data: { status: "expired" },
    });

    try {
      await logEvent(
        "INVITATION_EXPIRED",
        "VENDOR",
        inv.vendorId,
        inv.vendorId,
        {
          invitationId: inv.id,
          driverPhone: inv.driverPhone,
          token: inv.token,
        }
      );
    } catch (err) {
      console.warn("[referral] Audit INVITATION_EXPIRED non-bloquant:", err);
    }
  }

  return staleInvitations.length;
}
