import { NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { createMissionSchema } from "@/lib/validations/mission";
import {
  buildBuyerConfirmLink,
  buildShortTrackingLink,
  normalizeChannel,
  sendNotification,
} from "@/lib/notifications";
import {
  getActiveSubscription,
  VENDOR_FAIR_USE_WEEKLY_LIMIT,
} from "@/lib/notchpay";
import { triggerAsyncMissionClassification } from "@/lib/jev";
import { logEvent } from "@/lib/audit";
import { validateScheduledDate } from "@/lib/scheduled-missions";
import { expireStaleDirectProposals } from "@/lib/proposals";
import {
  generateBuyerConfirmToken,
  OrderConfirmationData,
  parseOrderConfirmation,
} from "@/lib/order-confirmation";
import {
  generateDeliveryCode,
  hashDeliveryCode,
} from "@/lib/delivery-code";
import { hashBuyerPhone } from "@/lib/buyer-reliability";

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const viewParam = searchParams.get("view");
    const roleParam = (
      searchParams.get("role") || session.role
    ).toUpperCase();

    await expireStaleDirectProposals();

    // Vue Agenda pour les missions programmées
    if (viewParam === "agenda") {
      if (session.role === "DRIVER") {
        const scheduledMissions = await prisma.mission.findMany({
          where: {
            scheduledAt: { not: null },
            scheduledStatus: { not: "cancelled" },
            status: { notIn: ["CANCELLED"] },
            OR: [
              { driverId: session.userId },
              { driverId: null, status: "CREATED" },
              { directProposals: { some: { driverId: session.userId, status: "PENDING" } } },
            ],
          },
          orderBy: { scheduledAt: "asc" },
          include: {
            vendor: { select: { id: true, shopName: true, name: true, phone: true } },
            driver: { select: { id: true, name: true, phone: true } },
          },
        });
        return NextResponse.json({ missions: scheduledMissions, agenda: scheduledMissions });
      }

      if (session.role === "VENDOR") {
        const scheduledMissions = await prisma.mission.findMany({
          where: {
            vendorId: session.userId,
            scheduledAt: { not: null },
          },
          orderBy: { scheduledAt: "asc" },
          include: {
            driver: { select: { id: true, name: true, phone: true } },
          },
        });
        return NextResponse.json({ missions: scheduledMissions, agenda: scheduledMissions });
      }
    }

    if (roleParam === "DRIVER") {
      const activeSub = await getActiveSubscription(session.userId);
      if (!activeSub) {
        return NextResponse.json({
          missions: [],
          directProposals: [],
          subscriptionRequired: true,
          message: "Abonnez-vous pour voir les missions",
        });
      }

      const [openMarketMissions, directProposals] = await Promise.all([
        prisma.mission.findMany({
          where: {
            status: "CREATED",
            driverId: null,
            directProposals: {
              none: {
                status: "PENDING",
              },
            },
          },
          include: {
            vendor: {
              select: {
                shopName: true,
                name: true,
                phone: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 25,
        }),
        prisma.directProposal.findMany({
          where: {
            driverId: session.userId,
            status: "PENDING",
            mission: {
              status: "CREATED",
              driverId: null,
            },
          },
          include: {
            mission: {
              include: {
                vendor: {
                  select: {
                    shopName: true,
                    name: true,
                    phone: true,
                  },
                },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        }),
      ]);

      return NextResponse.json({
        missions: openMarketMissions.map((m) => ({
          ...m,
          price: Number(m.price),
        })),
        directProposals,
        subscriptionRequired: false,
      });
    }

    // Vendeur : retourne ses missions
    const vendorMissions = await prisma.mission.findMany({
      where: { vendorId: session.userId },
      orderBy: { createdAt: "desc" },
      take: 25,
    });

    return NextResponse.json({
      missions: vendorMissions.map((m) => ({
        ...m,
        price: Number(m.price),
      })),
    });
  } catch (error) {
    console.error("[GET /api/missions] Erreur:", error);
    return NextResponse.json(
      { error: "Impossible de charger les missions." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: "Session requise. Veuillez vous connecter." },
        { status: 401 }
      );
    }

    if (session.role !== "VENDOR" && session.role !== "BUYER") {
      return NextResponse.json(
        { error: "Accès réservé aux vendeurs et acheteurs." },
        { status: 403 }
      );
    }

    // Vérifie que le vendeur a une Subscription ACTIVE
    if (session.role === "VENDOR") {
      const activeSub = await getActiveSubscription(session.userId);
      if (!activeSub) {
        return NextResponse.json(
          { error: "Abonnez-vous pour créer une mission" },
          { status: 402 }
        );
      }

      // Fair use : 50 missions / semaine
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const recentCount = await prisma.mission.count({
        where: {
          vendorId: session.userId,
          createdAt: { gte: sevenDaysAgo },
        },
      });

      if (recentCount >= VENDOR_FAIR_USE_WEEKLY_LIMIT) {
        return NextResponse.json(
          {
            error: `Limite de fair use atteinte (${VENDOR_FAIR_USE_WEEKLY_LIMIT} missions par semaine).`,
          },
          { status: 429 }
        );
      }
    }

    const body = await request.json();

    // Confirmation de commande obligatoire pour les vendeurs (appel / WhatsApp ou « continuer sans appeler »).
    // Les brouillons (lien personnel / Smart Paste) passent par d'autres routes et ne sont pas concernés.
    let orderConfirmation: OrderConfirmationData | null = null;
    if (session.role === "VENDOR") {
      const confirmation = parseOrderConfirmation(body);
      if (!confirmation.ok) {
        return NextResponse.json(
          { error: confirmation.error },
          { status: confirmation.status }
        );
      }
      orderConfirmation = confirmation.data;
    }
    // Vérification explicite certification gaz obligatoire
    if (body?.type === "GAS" && body?.gasCertified !== true) {
      return NextResponse.json(
        {
          error: "Certification gaz obligatoire",
          fieldErrors: {
            gasCertified: ["Certification gaz obligatoire"],
          },
        },
        { status: 400 }
      );
    }

    const parsed = createMissionSchema.safeParse(body);

    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      const gasErr = fieldErrors.gasCertified?.[0];
      return NextResponse.json(
        {
          error: gasErr || "Données du formulaire invalides.",
          fieldErrors,
        },
        { status: 400 }
      );
    }

    const {
      buyerName,
      buyerPhone,
      address,
      articlePhotoUrls,
      description,
      price,
      type,
      gasCertified,
      preferredDriverId,
      scheduledAt,
    } = parsed.data;

    let scheduledDate: Date | null = null;
    if (scheduledAt && scheduledAt.trim().length > 0) {
      if (session.role !== "VENDOR") {
        return NextResponse.json(
          { error: "La programmation de livraisons à l'avance est réservée aux vendeurs abonnés." },
          { status: 403 }
        );
      }
      const activeSub = await getActiveSubscription(session.userId);
      if (!activeSub) {
        return NextResponse.json(
          { error: "Abonnement actif requis pour programmer une livraison." },
          { status: 403 }
        );
      }
      try {
        scheduledDate = validateScheduledDate(scheduledAt);
      } catch (dateErr: any) {
        return NextResponse.json(
          { error: dateErr?.message || "La livraison programmée doit être fixée au moins 2 heures à l'avance." },
          { status: 400 }
        );
      }
    }

    const cleanPreferredDriverId =
      preferredDriverId && preferredDriverId.trim().length > 0
        ? preferredDriverId.trim()
        : null;

    // Transaction atomique : vérification livreur préféré, création mission + DirectProposal éventuelle
    const result = await prisma.$transaction(async (tx) => {
      const creator = await tx.user.findUnique({
        where: { id: session.userId },
        select: {
          id: true,
          role: true,
          shopName: true,
          name: true,
          preferredChannel: true,
          notificationChannel: true,
        },
      });

      if (cleanPreferredDriverId) {
        const fav = await tx.favoriteDriver.findUnique({
          where: {
            buyerId_driverId: {
              buyerId: session.userId,
              driverId: cleanPreferredDriverId,
            },
          },
        });

        if (!fav) {
          return { status: "NOT_FAVORITE_DRIVER" as const };
        }
      }

      const publicToken = crypto.randomUUID();
      const buyerConfirmToken = orderConfirmation
        ? generateBuyerConfirmToken()
        : null;

      const mission = await tx.mission.create({
        data: {
          vendorId: session.userId,
          buyerName: buyerName ? buyerName.trim() : null,
          buyerPhone,
          address,
          articlePhotoUrls,
          description: description ? description.trim() : null,
          price,
          type,
          gasCertified: type === "GAS" ? Boolean(gasCertified) : false,
          status: "CREATED",
          publicToken,
          notifStatus: "PENDING",
          scheduledAt: scheduledDate,
          scheduledStatus: scheduledDate ? (cleanPreferredDriverId ? "assigned" : "pending") : null,
          callInitiatedAt: orderConfirmation?.callInitiatedAt ?? null,
          callMethod: orderConfirmation?.callMethod ?? null,
          callTarget: orderConfirmation?.callTarget ?? null,
          buyerConfirmToken,
        },
      });

      let directProposal = null;
      if (cleanPreferredDriverId) {
        directProposal = await tx.directProposal.create({
          data: {
            missionId: mission.id,
            buyerId: session.userId,
            driverId: cleanPreferredDriverId,
            status: "PENDING",
          },
        });
      }

      return {
        status: "CREATED" as const,
        mission,
        directProposal,
        creator,
      };
    });

    if (result.status === "NOT_FAVORITE_DRIVER") {
      return NextResponse.json(
        {
          error:
            "Le livreur sélectionné ne figure pas dans vos livreurs préférés.",
        },
        { status: 400 }
      );
    }

    // Audit : confirmation de commande par le vendeur
    if (orderConfirmation) {
      try {
        if (orderConfirmation.callInitiatedAt) {
          await logEvent(
            "VENDOR_CALL_INITIATED",
            "MISSION",
            result.mission.id,
            session.userId,
            {
              callInitiatedAt: orderConfirmation.callInitiatedAt.toISOString(),
              callMethod: orderConfirmation.callMethod,
              callTarget: orderConfirmation.callTarget,
              note: "Horodatage du clic uniquement : l'aboutissement de l'appel n'est pas vérifié.",
            }
          );
        }
        await logEvent(
          "VENDOR_ORDER_CONFIRMED",
          "MISSION",
          result.mission.id,
          session.userId,
          {
            withCallInitiated: Boolean(orderConfirmation.callInitiatedAt),
            callMethod: orderConfirmation.callMethod,
          }
        );
      } catch (auditErr) {
        console.error("[POST /api/missions] Audit confirmation non-bloquant :", auditErr);
      }
    }

    // Audit log si mission programmée
    if (scheduledDate) {
      await logEvent(
        "MISSION_SCHEDULED",
        "MISSION",
        result.mission.id,
        session.userId,
        {
          scheduledAt: scheduledDate.toISOString(),
          scheduledStatus: result.mission.scheduledStatus,
        }
      );
    }

    // Classification Jev (TypeSafe AI) asynchrone fire-and-forget
    triggerAsyncMissionClassification({
      missionId: result.mission.id,
      description: result.mission.description,
      price: Number(result.mission.price),
      photoUrls: result.mission.articlePhotoUrls,
    });

    // Notification multicanale non-bloquante après création
    let notifChannelUsed: string | null = null;
    let notifSentAt: Date | null = null;
    let notifStatus = "FAILED";
    let notificationSent = false;

    try {
      const link = buildShortTrackingLink(result.mission.publicToken);
      const vendorPreferred = normalizeChannel(
        result.creator?.preferredChannel || result.creator?.notificationChannel
      );
      const shopName =
        result.creator?.shopName || result.creator?.name || "Votre vendeur";

      const notifResult = await sendNotification(
        result.mission.buyerPhone,
        "mission_created",
        {
          buyerName: result.mission.buyerName || "Client",
          shopName,
          link,
        },
        vendorPreferred
      );

      notifChannelUsed = notifResult.channel;
      notificationSent = notifResult.success;
      notifStatus = notifResult.success ? "SENT" : "FAILED";
      notifSentAt = notifResult.success ? new Date() : null;

      await prisma.mission.update({
        where: { id: result.mission.id },
        data: {
          notifChannelUsed,
          notifSentAt,
          notifStatus,
          notificationSent,
          notificationChannel:
            notifResult.channel === "whatsapp" ? "WhatsApp" : "SMS",
        },
      });
    } catch (notifError) {
      console.error(
        "[POST /api/missions] Erreur non-bloquante lors de la notification :",
        notifError
      );
    }

    // Demande de confirmation d'adresse / disponibilité à l'acheteur (non-bloquant)
    if (result.mission.buyerConfirmToken) {
      try {
        const vendorPreferred = normalizeChannel(
          result.creator?.preferredChannel || result.creator?.notificationChannel
        );
        await sendNotification(
          result.mission.buyerPhone,
          "buyer_confirm_request",
          {
            buyerName: result.mission.buyerName || "Client",
            shopName:
              result.creator?.shopName || result.creator?.name || "Votre vendeur",
            link: buildBuyerConfirmLink(
              result.mission.id,
              result.mission.buyerConfirmToken
            ),
          },
          vendorPreferred
        );
      } catch (confirmNotifError) {
        console.error(
          "[POST /api/missions] Notification de confirmation acheteur échouée (non-bloquant) :",
          confirmNotifError
        );
      }
    }

    // ── Code de remise à 4 chiffres (non-bloquant) ─────────────────────────
    try {
      const rawCode = generateDeliveryCode();
      const hashedCode = await hashDeliveryCode(rawCode);

      await prisma.mission.update({
        where: { id: result.mission.id },
        data: { deliveryCode: hashedCode },
      });

      await logEvent(
        "DELIVERY_CODE_GENERATED",
        "MISSION",
        result.mission.id,
        session.userId,
        { note: "Code de remise 4 chiffres généré et hashé (scrypt)." }
      );

      // Envoi du code à l'acheteur par WhatsApp/SMS
      try {
        const vendorPreferredForCode = normalizeChannel(
          result.creator?.preferredChannel || result.creator?.notificationChannel
        );
        const shopNameForCode =
          result.creator?.shopName || result.creator?.name || "Votre vendeur";

        const codeNotifResult = await sendNotification(
          result.mission.buyerPhone,
          "delivery_code",
          {
            buyerName: result.mission.buyerName || "Client",
            shopName: shopNameForCode,
            code: rawCode,
          },
          vendorPreferredForCode
        );

        if (codeNotifResult.success) {
          await prisma.mission.update({
            where: { id: result.mission.id },
            data: { deliveryCodeSentAt: new Date() },
          });
          await logEvent(
            "DELIVERY_CODE_SENT",
            "MISSION",
            result.mission.id,
            session.userId,
            { channel: codeNotifResult.channel }
          );
        }
      } catch (codeNotifError) {
        console.error(
          "[POST /api/missions] Envoi du code de remise échoué (non-bloquant) :",
          codeNotifError
        );
      }
    } catch (codeErr) {
      console.error(
        "[POST /api/missions] Génération du code de remise échouée (non-bloquant) :",
        codeErr
      );
    }

    // Le token de confirmation n'est jamais renvoyé au vendeur : seul l'acheteur le reçoit.
    const { buyerConfirmToken: _omitToken, deliveryCode: _omitCode, ...missionForResponse } = result.mission;

    return NextResponse.json(
      {
        mission: {
          ...missionForResponse,
          price: Number(result.mission.price),
          notifChannelUsed,
          notifSentAt,
          notifStatus,
          notificationSent,
          notificationChannel:
            notifChannelUsed === "whatsapp"
              ? "WhatsApp"
              : notifChannelUsed === "sms"
              ? "SMS"
              : null,
          directProposal: result.directProposal,
          isPublishedOnOpenMarket: !result.directProposal,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/missions] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur interne lors de la création de la mission." },
      { status: 500 }
    );
  }
}
