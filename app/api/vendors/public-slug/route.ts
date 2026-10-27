import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { ensureVendorPublicSlug } from "@/lib/slug";
import QRCode from "qrcode";

export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== "VENDOR") {
      return NextResponse.json({ error: "Accès réservé aux vendeurs." }, { status: 403 });
    }

    let user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, shopName: true, name: true, publicSlug: true },
    });

    if (!user) {
      return NextResponse.json({ error: "Utilisateur introuvable." }, { status: 404 });
    }

    let slug = user.publicSlug;
    if (!slug) {
      slug = await ensureVendorPublicSlug(user.id);
    }

    if (!slug) {
      return NextResponse.json({ error: "Impossible de générer le lien de livraison." }, { status: 500 });
    }

    const publicUrl = `https://motolink.cm/go/${slug}`;
    let qrCodeUrl: string | undefined;

    try {
      qrCodeUrl = await QRCode.toDataURL(publicUrl, {
        width: 300,
        margin: 2,
        color: {
          dark: "#0284c7", // Motolink Primary Blue
          light: "#ffffff",
        },
      });
    } catch (qrErr) {
      console.warn("[GET /api/vendors/public-slug] QR code error:", qrErr);
    }

    return NextResponse.json({
      slug,
      url: publicUrl,
      qrCodeUrl,
    });
  } catch (error) {
    console.error("[GET /api/vendors/public-slug] Erreur:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

