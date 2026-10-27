import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logEvent } from "@/lib/audit";
import {
  detectSelfReferral,
  detectRapidReferrals,
  detectSameDeviceMultipleAccounts,
  hashIp,
} from "@/lib/antifraud";
import { sendNotification } from "@/lib/notifications";

const applyReferralSchema = z.object({
  code: z.string().min(1, "Le code de parrainage est requis."),
  deviceFingerprint: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session || session.role !== "DRIVER") {
      return NextResponse.json(
        { error: "Accès réservé aux livreurs connectés." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = applyReferralSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Données invalides." },
        { status: 400 }
      );
    }

    const referee = await prisma.user.findUnique({
      where: { id: session.userId },
      include: {
        referralReceived: true,
      },
    });

    if (!referee) {
      return NextResponse.json(
        { error: "Compte livreur introuvable." },
        { status: 404 }
      );
    }

    // 2. Vérifie que User n'a pas déjà un parrain
    if (referee.sponsorDriverId || referee.referralReceived) {
      return NextResponse.json(
        { error: "Vous bénéficiez déjà d'un parrainage actif." },
        { status: 400 }
      );
    }

    // 3. Récupère le parrain par son referralCode (case-insensitive)
    const codeQuery = parsed.data.code.trim().toUpperCase();
    const referrer = await prisma.user.findFirst({
      where: {
        referralCode: {
          equals: codeQuery,
          mode: "insensitive",
        },
      },
    });

    if (!referrer) {
      return NextResponse.json(
        { error: "Code de parrainage invalide ou introuvable." },
        { status: 404 }
      );
    }

    // 4. Vérifie que le parrain est un DRIVER
    if (referrer.role !== "DRIVER") {
      return NextResponse.json(
        { error: "Ce code de parrainage n'appartient pas à un livreur." },
        { status: 400 }
      );
    }

    // 5. Vérifie éligibilité du filleul : nouvel utilisateur (< 7 jours) OU pas d'abonnement actif
    const isNew = Date.now() - referee.createdAt.getTime() < 7 * 24 * 60 * 60 * 1000;
    const hasActiveSub = referee.subscriptionStatus === "ACTIVE";
    if (!isNew && hasActiveSub) {
      return NextResponse.json(
        { error: "Le parrainage est réservé aux nouveaux livreurs ou sans abonnement actif." },
        { status: 400 }
      );
    }

    // 6. Récupération IP du filleul
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "127.0.0.1";
    const refereeIpHash = hashIp(ip);

    // 7. Détection auto-parrainage (téléphone, device, IP)
    const selfCheck = await detectSelfReferral(
      referrer.id,
      referee.phone,
      parsed.data.deviceFingerprint,
      ip
    );
    if (selfCheck.isFraud) {
      await logEvent(
        "REFERRAL_FRAUD_DETECTED",
        "REFERRAL",
        referee.id,
        referee.id,
        {
          reason: selfCheck.reason,
          referrerId: referrer.id,
          refereeId: referee.id,
          phone: referee.phone,
          deviceFingerprint: parsed.data.deviceFingerprint,
          ipHash: refereeIpHash,
        }
      );
      return NextResponse.json(
        { error: `Parrainage non autorisé : ${selfCheck.reason}` },
        { status: 400 }
      );
    }

    // 8. Détection parrainages en rafale (> 5 en 24h)
    const rapidCheck = await detectRapidReferrals(referrer.id);
    if (rapidCheck.isFraud) {
      await logEvent(
        "REFERRAL_FRAUD_DETECTED",
        "REFERRAL",
        referrer.id,
        referee.id,
        {
          reason: rapidCheck.reason,
          referrerId: referrer.id,
          refereeId: referee.id,
        }
      );
      return NextResponse.json(
        { error: "Trop de parrainages récents. Réessayez plus tard." },
        { status: 429 }
      );
    }

    // 9. Détection comptes multiples sur le même appareil
    const deviceCheck = await detectSameDeviceMultipleAccounts(
      parsed.data.deviceFingerprint
    );
    if (deviceCheck.isFraud) {
      await logEvent(
        "REFERRAL_FRAUD_DETECTED",
        "REFERRAL",
        referee.id,
        referee.id,
        {
          reason: deviceCheck.reason,
          referrerId: referrer.id,
          refereeId: referee.id,
          deviceFingerprint: parsed.data.deviceFingerprint,
        }
      );
      return NextResponse.json(
        { error: "Plusieurs comptes sur le même appareil" },
        { status: 400 }
      );
    }

    // 10. Transaction atomique de parrainage
    const referral = await prisma.$transaction(async (tx) => {
      // a. Création de la relation Referral
      const ref = await tx.referral.create({
        data: {
          referrerId: referrer.id,
          refereeId: referee.id,
          type: "DRIVER_TO_DRIVER",
          status: "ACTIVE",
          priorityMissionsRemaining: 3,
          priorityMissionsUsed: 0,
          refereePhone: referee.phone,
          refereeDeviceFingerprint: parsed.data.deviceFingerprint || null,
          refereeIpHash,
        },
      });

      // b. Mise à jour du filleul
      await tx.user.update({
        where: { id: referee.id },
        data: {
          sponsorDriverId: referrer.id,
          ...(parsed.data.deviceFingerprint
            ? { lastDeviceFingerprint: parsed.data.deviceFingerprint }
            : {}),
          lastIpHash: refereeIpHash,
        },
      });

      // c. Ajout dans la flotte / livreurs favoris du parrain
      const existingFav = await tx.favoriteDriver.findFirst({
        where: { buyerId: referrer.id, driverId: referee.id },
      });
      if (existingFav) {
        await tx.favoriteDriver.update({
          where: { id: existingFav.id },
          data: {
            source: "sponsored",
            priorityMissionsRemaining: 3,
          },
        });
      } else {
        await tx.favoriteDriver.create({
          data: {
            buyerId: referrer.id,
            driverId: referee.id,
            source: "sponsored",
            priorityMissionsRemaining: 3,
            note: "Filleul parrainé",
          },
        });
      }

      return ref;
    });

    // 11. Journal d'audit append-only chaîné SHA-256
    await logEvent(
      "REFERRAL_CREATED",
      "REFERRAL",
      referral.id,
      referee.id,
      {
        referrerId: referrer.id,
        refereeId: referee.id,
        type: "DRIVER_TO_DRIVER",
        priorityMissions: 3,
      }
    );

    // 12. Notification au parrain
    try {
      const refereeDisplayName = referee.name || referee.phone;
      await sendNotification(
        referrer.phone,
        "driver_referral_used",
        {
          driverName: referrer.name || "Livreur",
          refereeName: refereeDisplayName,
        },
        "whatsapp"
      );
    } catch (notifErr) {
      console.warn("[/api/referrals/apply] Notification parrain non-bloquante:", notifErr);
    }

    return NextResponse.json({
      success: true,
      priorityMissions: 3,
      message: "Code de parrainage appliqué ! Vous bénéficiez de 3 missions prioritaires.",
    });
  } catch (error) {
    console.error("[POST /api/referrals/apply] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur serveur lors de l'application du parrainage." },
      { status: 500 }
    );
  }
}

