import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import {
  buildShortTrackingLink,
  normalizeChannel,
  sendNotification,
} from "@/lib/notifications";
import { getActiveSubscription } from "@/lib/notchpay";
import { logEvent } from "@/lib/audit";
import { setDriverOnMission } from "@/lib/driver-status";

const respondSchema = z.object({
  response: z.enum(["ACCEPTED", "REFUSED"]),
});

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== "DRIVER") {
      return NextResponse.json(
        { error: "Accès réservé aux livreurs." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = respondSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Réponse invalide (ACCEPTED ou REFUSED attendu)." },
        { status: 400 }
      );
    }

    const proposal = await prisma.directProposal.findUnique({
      where: { id: params.id },
      include: {
        mission: {
          include: {
            vendor: {
              select: {
                id: true,
                phone: true,
                shopName: true,
                name: true,
                preferredChannel: true,
                notificationChannel: true,
              },
            },
          },
        },
        driver: {
          select: {
            id: true,
            name: true,
            phone: true,
            kycStatus: true,
            driverStatus: true,
          },
        },
      },
    });

    if (!proposal || proposal.driverId !== session.userId) {
      return NextResponse.json(
        { error: "Proposition introuvable ou non autorisée." },
        { status: 404 }
      );
    }

    if (proposal.status !== "PENDING") {
      return NextResponse.json(
        { error: `Cette proposition a déjà été traitée (${proposal.status}).` },
        { status: 409 }
      );
    }

    // Vérifie l'expiration (> 2h)
    if (Date.now() - proposal.createdAt.getTime() > TWO_HOURS_MS) {
      const expired = await prisma.directProposal.update({
        where: { id: proposal.id },
        data: {
          status: "EXPIRED",
          respondedAt: new Date(),
        },
      });
      return NextResponse.json(
        {
          error:
            "Cette proposition directe a expiré (délai de 2h dépassé) et la mission a été ouverte au marché.",
          proposal: expired,
        },
        { status: 410 }
      );
    }

    const decision = parsed.data.response;
    const now = new Date();

    if (decision === "ACCEPTED") {
      const activeSub = await getActiveSubscription(session.userId);
      if (!activeSub) {
        return NextResponse.json(
          { error: "Abonnez-vous pour accepter des missions" },
          { status: 403 }
        );
      }

      if (proposal.driver.kycStatus !== "VERIFIED") {
        return NextResponse.json(
          { error: "Complétez votre vérification d'identité" },
          { status: 403 }
        );
      }

      const updatedProposal = await prisma.$transaction(async (tx) => {
        const p = await tx.directProposal.update({
          where: { id: proposal.id },
          data: {
            status: "ACCEPTED",
            respondedAt: now,
          },
        });

        await tx.mission.update({
          where: { id: proposal.missionId },
          data: {
            driverId: session.userId,
            status: "ACCEPTED",
            driverStatusBeforeMission: proposal.driver.driverStatus,
          },
        });

        await tx.checkpoint.create({
          data: {
            missionId: proposal.missionId,
            type: "PICKED_UP",
            note: "Proposition directe acceptée par le livreur préféré",
          },
        });

        return p;
      });

      // Statut livreur -> ON_MISSION
      await setDriverOnMission(session.userId);

      await logEvent(
        "DIRECT_PROPOSAL_ACCEPTED",
        "MISSION",
        proposal.missionId,
        session.userId,
        {
          proposalId: proposal.id,
          missionId: proposal.missionId,
          buyerId: proposal.buyerId,
        }
      );

      // Notification non-bloquante au vendeur et à l'acheteur
      try {
        const link = buildShortTrackingLink(proposal.mission.publicToken);
        const preferred = normalizeChannel(
          proposal.mission.vendor.preferredChannel ||
            proposal.mission.vendor.notificationChannel
        );
        const driverName = proposal.driver.name || proposal.driver.phone;
        const shopName =
          proposal.mission.vendor.shopName ||
          proposal.mission.vendor.name ||
          "MotoLink";

        await sendNotification(
          proposal.mission.buyerPhone,
          "driver_assigned",
          {
            buyerName: proposal.mission.buyerName || "Client",
            shopName,
            driverName,
            link,
          },
          preferred
        );
      } catch (notifErr) {
        console.error(
          "[PATCH /api/direct-proposals/[id]/respond] Erreur notification:",
          notifErr
        );
      }

      return NextResponse.json({
        proposal: updatedProposal,
        missionStatus: "ACCEPTED",
      });
    }

    // Cas REFUSED : DirectProposal.status = REFUSED, Mission reste CREATED
    const refusedProposal = await prisma.directProposal.update({
      where: { id: proposal.id },
      data: {
        status: "REFUSED",
        respondedAt: now,
      },
    });

    await logEvent(
      "DIRECT_PROPOSAL_REFUSED",
      "MISSION",
      proposal.missionId,
      session.userId,
      {
        proposalId: proposal.id,
        missionId: proposal.missionId,
        buyerId: proposal.buyerId,
      }
    );

    return NextResponse.json({
      proposal: refusedProposal,
      missionStatus: "CREATED",
    });
  } catch (error) {
    console.error("[PATCH /api/direct-proposals/[id]/respond] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur lors du traitement de la proposition." },
      { status: 500 }
    );
  }
}

