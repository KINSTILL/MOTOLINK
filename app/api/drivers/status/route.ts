import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getActiveSubscription } from "@/lib/notchpay";
import { checkStatusRateLimit, setDriverStatus } from "@/lib/driver-status";
import { DriverStatus } from "@prisma/client";

const statusUpdateSchema = z.object({
  status: z.enum(["AVAILABLE", "OFFLINE"]),
});

export async function GET() {
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
        driverStatus: true,
        kycStatus: true,
      },
    });

    if (!driver) {
      return NextResponse.json(
        { error: "Livreur introuvable." },
        { status: 404 }
      );
    }

    // Vérification de la présence d'une mission en cours
    const activeMission = await prisma.mission.findFirst({
      where: {
        driverId: session.userId,
        status: { in: ["ACCEPTED", "IN_PROGRESS"] },
      },
      select: { id: true },
    });

    const hasActiveMission = Boolean(activeMission) || driver.driverStatus === "ON_MISSION";
    const activeSub = await getActiveSubscription(session.userId);
    const isKycVerified = driver.kycStatus === "VERIFIED";

    let canChange = true;
    let reason: string | null = null;

    if (hasActiveMission) {
      canChange = false;
      reason = "En mission (course en cours).";
    } else if (!isKycVerified) {
      canChange = false;
      reason = "Vérification d'identité (KYC) requise.";
    } else if (!activeSub) {
      canChange = false;
      reason = "Abonnement hebdomadaire actif requis.";
    }

    return NextResponse.json({
      status: driver.driverStatus,
      canChange,
      reason,
    });
  } catch (error) {
    console.error("[/api/drivers/status GET] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération du statut." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
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
        driverStatus: true,
        kycStatus: true,
      },
    });

    if (!driver) {
      return NextResponse.json(
        { error: "Livreur introuvable." },
        { status: 404 }
      );
    }

    // 1. Si déjà en mission -> interdiction absolue de basculer
    const activeMission = await prisma.mission.findFirst({
      where: {
        driverId: session.userId,
        status: { in: ["ACCEPTED", "IN_PROGRESS"] },
      },
      select: { id: true },
    });

    if (driver.driverStatus === "ON_MISSION" || activeMission) {
      return NextResponse.json(
        { error: "En mission : impossible de modifier votre statut pendant une course en cours." },
        { status: 403 }
      );
    }

    // 2. Vérification KYC (403)
    if (driver.kycStatus !== "VERIFIED") {
      return NextResponse.json(
        { error: "Complétez votre vérification d'identité avant de pouvoir activer votre statut." },
        { status: 403 }
      );
    }

    // 3. Vérification Abonnement actif (402 Payment Required)
    const activeSub = await getActiveSubscription(session.userId);
    if (!activeSub) {
      return NextResponse.json(
        { error: "Abonnement hebdomadaire actif requis pour passer en ligne." },
        { status: 402 }
      );
    }

    // 4. Rate Limiting (max 10 changements / heure)
    if (!checkStatusRateLimit(session.userId)) {
      return NextResponse.json(
        { error: "Limite de changements de statut atteinte (maximum 10 par heure)." },
        { status: 429 }
      );
    }

    // 5. Validation du body
    const body = await request.json().catch(() => ({}));
    const parsed = statusUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Statut invalide. Valeurs acceptées : AVAILABLE, OFFLINE." },
        { status: 400 }
      );
    }

    const targetStatus = parsed.data.status as DriverStatus;

    // 6. Mise à jour avec journal d'audit
    await setDriverStatus(session.userId, targetStatus);

    return NextResponse.json({
      success: true,
      status: targetStatus,
    });
  } catch (error) {
    console.error("[/api/drivers/status PATCH] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour du statut." },
      { status: 500 }
    );
  }
}

