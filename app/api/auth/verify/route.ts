import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { Role } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  AUTH_COOKIE_NAME,
  ONBOARDING_COOKIE_NAME,
  AuthTokenPayload,
  OnboardingTokenPayload,
  isValidCameroonPhone,
  normalizePhone,
  signJwt,
  verifyJwt,
} from "@/lib/auth";
import { hashIp } from "@/lib/antifraud";
import { ensureReferralCode } from "@/lib/referral";

const verifyRequestSchema = z.object({
  phone: z.string().min(9),
  code: z.string().length(6).regex(/^\d{6}$/).optional(),
  role: z.nativeEnum(Role).optional(),
  onboardingToken: z.string().optional(),
  acceptedCgu: z.boolean().optional(),
  acceptedPrivacy: z.boolean().optional(),
  deviceFingerprint: z.string().optional(),
});

const CGU_SUMMARY = {
  notice:
    "MotoLink est un constat de fait, pas une garantie de paiement ou de qualité.",
  cguUrl: "/legal/cgu",
  privacyUrl: "/legal/privacy",
  mentionsUrl: "/legal/mentions",
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = verifyRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données de vérification invalides." },
        { status: 400 }
      );
    }

    const phone = normalizePhone(parsed.data.phone);
    if (!isValidCameroonPhone(phone)) {
      return NextResponse.json(
        { error: "Numéro de téléphone invalide." },
        { status: 400 }
      );
    }

    const { code, role, onboardingToken, acceptedCgu, acceptedPrivacy, deviceFingerprint } =
      parsed.data;

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "127.0.0.1";
    const ipHash = ip ? hashIp(ip) : undefined;

    const getOnboardingCookie = (): string | undefined => {
      try {
        return cookies().get(ONBOARDING_COOKIE_NAME)?.value;
      } catch {
        return undefined;
      }
    };

    // CAS 1 : Finalisation de l'inscription depuis /onboarding (choix du rôle + acceptation CGU)
    if (!code && role) {
      if (!acceptedCgu || !acceptedPrivacy) {
        return NextResponse.json(
          {
            error:
              "Vous devez lire et accepter les CGU et la Politique de confidentialité pour continuer.",
            requiresCguAcceptance: true,
            cgu: CGU_SUMMARY,
          },
          { status: 400 }
        );
      }

      const tokenToVerify = onboardingToken || getOnboardingCookie();

      if (!tokenToVerify) {
        return NextResponse.json(
          { error: "Session d'inscription expirée. Veuillez vous reconnecter." },
          { status: 401 }
        );
      }

      const onboardingPayload =
        await verifyJwt<OnboardingTokenPayload>(tokenToVerify);

      if (
        !onboardingPayload ||
        onboardingPayload.purpose !== "onboarding" ||
        onboardingPayload.phone !== phone
      ) {
        return NextResponse.json(
          { error: "Jeton d'inscription invalide ou expiré." },
          { status: 401 }
        );
      }

      const now = new Date();
      const user = await prisma.user.upsert({
        where: { phone },
        update: {
          role,
          acceptedCguAt: now,
          acceptedPrivacyAt: now,
          ...(deviceFingerprint ? { lastDeviceFingerprint: deviceFingerprint } : {}),
          ...(ipHash ? { lastIpHash: ipHash } : {}),
        },
        create: {
          phone,
          role,
          acceptedCguAt: now,
          acceptedPrivacyAt: now,
          ...(deviceFingerprint ? { lastDeviceFingerprint: deviceFingerprint } : {}),
          ...(ipHash ? { lastIpHash: ipHash } : {}),
        },
      });

      if (user.role === "DRIVER" && !user.referralCode) {
        await ensureReferralCode(user.id);
      }

      const jwt = await signJwt<AuthTokenPayload>({
        userId: user.id,
        phone: user.phone,
        role: user.role,
        name: user.name,
      });

      const response = NextResponse.json({
        token: jwt,
        isNewUser: false,
        user: {
          id: user.id,
          role: user.role,
          name: user.name,
          acceptedCguAt: user.acceptedCguAt,
          acceptedPrivacyAt: user.acceptedPrivacyAt,
        },
      });

      response.cookies.set(AUTH_COOKIE_NAME, jwt, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 7, // 7 jours
      });
      response.cookies.delete(ONBOARDING_COOKIE_NAME);

      return response;
    }

    // CAS 2 : Vérification du code OTP à 6 chiffres
    if (!code) {
      return NextResponse.json(
        { error: "Le code à 6 chiffres est requis." },
        { status: 400 }
      );
    }

    const validOtp = await prisma.otpCode.findFirst({
      where: {
        phone,
        code,
        used: false,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!validOtp) {
      return NextResponse.json(
        { error: "Code OTP invalide, expiré ou déjà utilisé." },
        { status: 400 }
      );
    }

    // Marquer le code comme utilisé immédiatement
    await prisma.otpCode.update({
      where: { id: validOtp.id },
      data: { used: true },
    });

    // Vérifier si l'utilisateur existe déjà en base
    let user = await prisma.user.findUnique({
      where: { phone },
    });

    // Si nouvel utilisateur mais que le rôle a déjà été fourni dans l'appel
    if (!user && role) {
      if (!acceptedCgu || !acceptedPrivacy) {
        return NextResponse.json(
          {
            error:
              "Vous devez lire et accepter les CGU et la Politique de confidentialité pour créer un compte.",
            requiresCguAcceptance: true,
            cgu: CGU_SUMMARY,
          },
          { status: 400 }
        );
      }

      const now = new Date();
      user = await prisma.user.create({
        data: {
          phone,
          role,
          acceptedCguAt: now,
          acceptedPrivacyAt: now,
        },
      });
    }

    // Si nouvel utilisateur et pas encore de rôle choisi -> rediriger vers /onboarding (et retourne les CGU)
    if (!user) {
      const newOnboardingToken = await signJwt<OnboardingTokenPayload>(
        {
          phone,
          purpose: "onboarding",
        },
        60 * 15 // 15 minutes pour choisir son rôle et accepter les CGU
      );

      const response = NextResponse.json({
        isNewUser: true,
        requiresOnboarding: true,
        requiresCguAcceptance: true,
        cgu: CGU_SUMMARY,
        onboardingToken: newOnboardingToken,
        phone,
      });

      response.cookies.set(ONBOARDING_COOKIE_NAME, newOnboardingToken, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 15,
      });

      return response;
    }

    // Mise à jour de l'utilisateur (CGU + signaux anti-fraude IP / Device)
    const updatePayload: Record<string, any> = {
      ...(deviceFingerprint ? { lastDeviceFingerprint: deviceFingerprint } : {}),
      ...(ipHash ? { lastIpHash: ipHash } : {}),
    };

    if (acceptedCgu && acceptedPrivacy && !user.acceptedCguAt) {
      const now = new Date();
      updatePayload.acceptedCguAt = now;
      updatePayload.acceptedPrivacyAt = now;
    }

    if (Object.keys(updatePayload).length > 0) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: updatePayload,
      });
    }

    if (user.role === "DRIVER" && !user.referralCode) {
      await ensureReferralCode(user.id);
    }

    // Utilisateur existant (ou fraîchement créé avec rôle + CGU) -> générer le JWT final
    const jwt = await signJwt<AuthTokenPayload>({
      userId: user.id,
      phone: user.phone,
      role: user.role,
      name: user.name,
    });

    const response = NextResponse.json({
      token: jwt,
      isNewUser: false,
      cgu: !user.acceptedCguAt ? CGU_SUMMARY : undefined,
      user: {
        id: user.id,
        role: user.role,
        name: user.name,
        acceptedCguAt: user.acceptedCguAt,
        acceptedPrivacyAt: user.acceptedPrivacyAt,
      },
    });

    response.cookies.set(AUTH_COOKIE_NAME, jwt, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 jours
    });
    response.cookies.delete(ONBOARDING_COOKIE_NAME);

    return response;
  } catch (error) {
    console.error("[API /api/auth/verify] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur interne lors de la vérification du code." },
      { status: 500 }
    );
  }
}
