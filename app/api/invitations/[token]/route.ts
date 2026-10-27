import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

function maskPhone(phone: string): string {
  if (phone.length < 8) return phone;
  // +237 6XX XXX XX 12
  const last2 = phone.slice(-2);
  const prefix = phone.startsWith("+237") ? "+237 6" : "6";
  return `${prefix}XX XXX XX ${last2}`;
}

export async function GET(
  _request: Request,
  { params }: { params: { token: string } }
) {
  try {
    const invitation = await prisma.invitation.findUnique({
      where: { token: params.token },
      include: {
        vendor: {
          select: {
            shopName: true,
            name: true,
            brandingLogoUrl: true,
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

    // Vérification expiration (410)
    if (invitation.expiresAt < now || invitation.status === "expired") {
      if (invitation.status === "pending") {
        await prisma.invitation.update({
          where: { id: invitation.id },
          data: { status: "expired" },
        });
      }
      return NextResponse.json(
        { error: "Cette invitation a expiré." },
        { status: 410 }
      );
    }

    // Vérification statut
    if (invitation.status === "accepted") {
      return NextResponse.json(
        { error: "Cette invitation a déjà été acceptée." },
        { status: 410 }
      );
    }

    if (invitation.status === "cancelled") {
      return NextResponse.json(
        { error: "Cette invitation a été annulée." },
        { status: 410 }
      );
    }

    return NextResponse.json({
      invitationId: invitation.id,
      vendor: {
        shopName:
          invitation.vendor.shopName ||
          invitation.vendor.name ||
          "Vendeur MotoLink",
        brandingLogoUrl: invitation.vendor.brandingLogoUrl || null,
      },
      driverName: invitation.driverName,
      driverPhone: maskPhone(invitation.driverPhone),
      status: invitation.status,
      expiresAt: invitation.expiresAt,
    });
  } catch (error) {
    console.error("[/api/invitations/[token] GET] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur serveur lors de la récupération de l'invitation." },
      { status: 500 }
    );
  }
}

