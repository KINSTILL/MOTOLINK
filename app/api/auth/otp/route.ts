import { NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { isValidCameroonPhone, normalizePhone } from "@/lib/utils";

const otpRequestSchema = z.object({
  phone: z.string().min(9, "Numéro de téléphone requis"),
});

/**
 * Provider SMS (Mock en développement, passerelle SMS / Twilio en production)
 */
async function sendSmsOtp(phone: string, code: string): Promise<void> {
  if (process.env.NODE_ENV === "production" && process.env.SMS_API_KEY) {
    console.info(`[SMS PROD] Envoi OTP vers ${phone}`);
    return;
  }

  console.log("\n==========================================");
  console.log("📩 [MOTOLINK SMS MOCK - AFRICA/DOUALA]");
  console.log(`📞 Destinataire : ${phone}`);
  console.log(`🔐 Code OTP     : ${code}`);
  console.log("⏱️  Validité     : 5 minutes");
  console.log("==========================================\n");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = otpRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Format de requête invalide." },
        { status: 400 }
      );
    }

    const phone = normalizePhone(parsed.data.phone);

    if (!isValidCameroonPhone(phone)) {
      return NextResponse.json(
        {
          error:
            "Numéro invalide. Utilisez le format camerounais +237 6XX XXX XXX.",
        },
        { status: 400 }
      );
    }

    // Rate limiting : max 3 OTP par téléphone par heure en production (50 en dev pour faciliter les tests)
    const maxOtpPerHour = process.env.NODE_ENV === "production" ? 3 : 50;
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const otpCountLastHour = await prisma.otpCode.count({
      where: {
        phone,
        createdAt: {
          gte: oneHourAgo,
        },
      },
    });

    if (otpCountLastHour >= maxOtpPerHour) {
      return NextResponse.json(
        {
          error:
            "Limite atteinte (max 3 codes par heure). Veuillez patienter avant de réessayer.",
        },
        { status: 429 }
      );
    }

    // Génération d'un code aléatoire cryptographique à 6 chiffres
    const code = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await prisma.otpCode.create({
      data: {
        phone,
        code,
        expiresAt,
        used: false,
      },
    });

    await sendSmsOtp(phone, code);

    return NextResponse.json({
      success: true,
      ...(process.env.NODE_ENV !== "production" ? { devCode: code } : {}),
    });
  } catch (error) {
    console.error("[API /api/auth/otp] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur interne lors de l'envoi du code." },
      { status: 500 }
    );
  }
}
