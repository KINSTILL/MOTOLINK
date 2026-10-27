import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getActiveSubscription } from "@/lib/notchpay";
import { isValidCameroonPhone, normalizePhone } from "@/lib/utils";
import { generateInvitationToken } from "@/lib/referral";
import { sendNotification } from "@/lib/notifications";
import { logEvent } from "@/lib/audit";

const inviteSchema = z.object({
  driverPhone: z.string().min(8, "Numéro de téléphone requis"),
  driverName: z.string().min(2, "Nom du livreur requis (au moins 2 caractères)"),
  channel: z.enum(["whatsapp", "sms"]).default("whatsapp"),
});

const MAX_INVITATIONS_PER_DAY = 10;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session || session.role !== "VENDOR") {
      return NextResponse.json(
        { error: "Accès réservé aux vendeurs." },
        { status: 403 }
      );
    }

    // 1. Vérification abonnement vendeur
    const activeSub = await getActiveSubscription(session.userId);
    if (!activeSub) {
      return NextResponse.json(
        { error: "Abonnement actif requis pour parrainer un livreur." },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = inviteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides : nom (min 2 car.) et téléphone valides requis." },
        { status: 400 }
      );
    }

    const { driverPhone, driverName, channel } = parsed.data;

    // 2. Validation et normalisation du téléphone (+237XXXXXXXXX)
    if (!isValidCameroonPhone(driverPhone)) {
      return NextResponse.json(
        { error: "Format de numéro camerounais invalide (+237... attendu)." },
        { status: 400 }
      );
    }
    const normalizedPhone = normalizePhone(driverPhone);

    // 3. Rate limiting (max 10 invitations par 24h par vendeur)
    const recentInvitesCount = await prisma.invitation.count({
      where: {
        vendorId: session.userId,
        createdAt: { gte: new Date(Date.now() - TWENTY_FOUR_HOURS_MS) },
      },
    });

    if (recentInvitesCount >= MAX_INVITATIONS_PER_DAY) {
      return NextResponse.json(
        { error: "Limite d'invitations atteinte (maximum 10 par jour)." },
        { status: 429 }
      );
    }

    // 4. Vérification numéro déjà utilisé par un User existant (409)
    const existingUser = await prisma.user.findUnique({
      where: { phone: normalizedPhone },
      select: { id: true },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Ce numéro est déjà utilisé par un compte existant." },
        { status: 409 }
      );
    }

    // 5. Vérification qu'aucune invitation en cours (non expirée) n'existe déjà pour ce numéro par ce vendeur
    const pendingInvite = await prisma.invitation.findFirst({
      where: {
        vendorId: session.userId,
        driverPhone: normalizedPhone,
        status: "pending",
        expiresAt: { gt: new Date() },
      },
    });

    if (pendingInvite) {
      return NextResponse.json(
        { error: "Une invitation est déjà en cours pour ce numéro." },
        { status: 409 }
      );
    }

    // 6. Récupération des informations de la boutique
    const vendor = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { shopName: true, name: true, phone: true },
    });
    const shopName = vendor?.shopName || vendor?.name || "Votre vendeur MotoLink";

    // 7. Création de l'invitation (validité 7 jours)
    const token = generateInvitationToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invitation = await prisma.invitation.create({
      data: {
        vendorId: session.userId,
        driverPhone: normalizedPhone,
        driverName: driverName.trim(),
        token,
        channel,
        status: "pending",
        expiresAt,
      },
    });

    // 8. Envoi de la notification avec mention explicite "pas employeur"
    const inviteLink = `https://motolink.cm/invite/${token}`;
    await sendNotification(
      normalizedPhone,
      "vendor_invite",
      {
        driverName: driverName.trim(),
        shopName,
        link: inviteLink,
      },
      channel
    );

    // 9. Journal d'audit append-only chaîné SHA-256
    await logEvent(
      "INVITATION_SENT",
      "INVITATION",
      invitation.id,
      session.userId,
      {
        invitationId: invitation.id,
        driverPhone: normalizedPhone,
        driverName: driverName.trim(),
        channel,
        expiresAt: expiresAt.toISOString(),
      }
    );

    return NextResponse.json(
      {
        success: true,
        invitationId: invitation.id,
        token: invitation.token,
        inviteUrl: inviteLink,
        message: `Invitation envoyée avec succès à ${driverName.trim()}.`,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[/api/vendors/invite-driver POST] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur serveur lors de la création de l'invitation." },
      { status: 500 }
    );
  }
}
