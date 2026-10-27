import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logEvent } from "@/lib/audit";
import {
  checkSmartPasteRateLimit,
  hasActiveSubscriptionOrCredits,
} from "@/lib/social-commerce";
import { extractFromRawText } from "@/lib/smart-paste";

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session || session.role !== "VENDOR") {
      return NextResponse.json({ error: "Accès réservé aux vendeurs." }, { status: 403 });
    }

    if (!checkSmartPasteRateLimit(session.userId)) {
      return NextResponse.json(
        { error: "Limite de requêtes Smart Paste atteinte. Veuillez réessayer plus tard." },
        { status: 429 }
      );
    }

    const { allowed } = await hasActiveSubscriptionOrCredits(session.userId);
    if (!allowed) {
      return NextResponse.json(
        { error: "Abonnement actif ou crédit requis pour utiliser Smart Paste." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const rawText = typeof body?.rawText === "string" ? body.rawText.trim() : "";

    if (!rawText) {
      return NextResponse.json({ error: "Le texte à analyser est vide." }, { status: 400 });
    }

    const extracted = extractFromRawText(rawText);

    // Si extraction échouée (confiance < 0.4)
    if (extracted.status === "failed") {
      await prisma.smartPasteLog.create({
        data: {
          vendorId: session.userId,
          rawText,
          jevResponse: {
            confidence: extracted.confidence,
            extracted,
          },
          status: "failed",
        },
      });

      await logEvent("SMART_PASTE_FAILED", "USER", session.userId, session.userId, {
        confidence: extracted.confidence,
        rawTextLength: rawText.length,
      });

      return NextResponse.json({
        success: false,
        message: "Impossible d'extraire. Utilisez le formulaire manuel.",
        confidence: extracted.confidence,
      });
    }

    // Success ou Partial : Créer le brouillon
    const draftToken = crypto.randomBytes(16).toString("hex");

    const mission = await prisma.mission.create({
      data: {
        vendorId: session.userId,
        buyerName: extracted.buyerName,
        buyerPhone: extracted.buyerPhone || "+237600000000",
        address: extracted.address || "Adresse à compléter",
        description: extracted.description,
        price: extracted.price || 0,
        type: "PARCEL",
        status: "DRAFT",
        source: "smart_paste",
        submittedByBuyer: false,
        draftToken,
        notifStatus: "PENDING",
      },
    });

    // Enregistrer le log
    await prisma.smartPasteLog.create({
      data: {
        vendorId: session.userId,
        rawText,
        jevResponse: {
          confidence: extracted.confidence,
          extracted,
        },
        status: extracted.status,
        missionId: mission.id,
      },
    });

    // Audits
    await logEvent("SMART_PASTE_SUCCESS", "MISSION", mission.id, session.userId, {
      confidence: extracted.confidence,
      status: extracted.status,
    });

    await logEvent("DRAFT_CREATED_VIA_PASTE", "MISSION", mission.id, session.userId, {
      draftToken,
      source: "smart_paste",
      missingFields: extracted.missingFields,
    });

    return NextResponse.json({
      success: true,
      draftId: mission.id,
      extracted: {
        buyerName: extracted.buyerName,
        buyerPhone: extracted.buyerPhone,
        address: extracted.address,
        description: extracted.description,
        price: extracted.price,
        confidence: extracted.confidence,
      },
      status: extracted.status,
      missingFields: extracted.missingFields,
    });
  } catch (error) {
    console.error("[POST /api/vendors/smart-paste] Erreur:", error);
    return NextResponse.json({ error: "Erreur serveur lors de l'analyse." }, { status: 500 });
  }
}

