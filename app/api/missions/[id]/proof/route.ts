import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import {
  computeProofHash,
  decodeBase64DataUrl,
  generateProofPdf,
  uploadProofFile,
} from "@/lib/proof-pdf";
import { requestTimestamp } from "@/lib/tsa";
import { logEvent } from "@/lib/audit";
import { restoreDriverStatusAfterMission } from "@/lib/driver-status";
import { checkReferralProgress } from "@/lib/referral-progress";
import {
  buildShortTrackingLink,
  normalizeChannel,
  sendNotification,
} from "@/lib/notifications";

const createProofSchema = z.object({
  photoBase64: z.string().optional(),
  signatureBase64: z.string().min(10, "Signature de l'acheteur requise"),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  gpsAccuracy: z.number().nullable().optional(),
  deviceFingerprint: z.string().max(500).nullable().optional(),
  buyerSigned: z.boolean().optional(),
});

const DEFAULT_PACKAGE_PHOTO_BASE64 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const parsed = createProofSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Signature obligatoire pour sceller la preuve." },
        { status: 400 }
      );
    }

    const {
      photoBase64,
      signatureBase64,
      lat = null,
      lng = null,
      gpsAccuracy = null,
      deviceFingerprint = null,
      buyerSigned = false,
    } = parsed.data;

    let session = null;
    if (!buyerSigned) {
      session = await getSession();
      if (!session || session.role !== "DRIVER") {
        return NextResponse.json(
          { error: "Accès réservé aux livreurs." },
          { status: 403 }
        );
      }
      if (!photoBase64 || photoBase64.length < 10) {
        return NextResponse.json(
          { error: "Photo du colis obligatoire pour sceller la preuve." },
          { status: 400 }
        );
      }
    }

    const mission = await prisma.mission.findFirst({
      where: {
        OR: [{ id: params.id }, { publicToken: params.id }],
      },
      include: {
        vendor: {
          select: {
            id: true,
            shopName: true,
            name: true,
            phone: true,
            preferredChannel: true,
            notificationChannel: true,
          },
        },
        driver: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
        proof: true,
        checkpoints: {
          where: { type: "DELIVERED" },
          take: 1,
        },
      },
    });

    if (!mission) {
      return NextResponse.json(
        { error: "Mission introuvable." },
        { status: 404 }
      );
    }

    if (!buyerSigned && mission.driverId !== session?.userId) {
      return NextResponse.json(
        {
          error:
            "Seul le livreur assigné à cette mission peut sceller la preuve.",
        },
        { status: 403 }
      );
    }

    // Le code de remise doit être validé avant de sceller la preuve (livreur uniquement)
    if (!buyerSigned && !mission.deliveryCodeVerifiedAt) {
      return NextResponse.json(
        { error: "Code de remise non validé" },
        { status: 400 }
      );
    }

    if (
      mission.status !== "IN_PROGRESS" &&
      mission.status !== "ACCEPTED" &&
      !(mission.status === "DELIVERED" && !mission.proof)
    ) {
      return NextResponse.json(
        {
          error:
            "Cette mission doit être en cours de livraison (IN_PROGRESS) pour sceller la preuve.",
        },
        { status: 409 }
      );
    }

    const effectivePhotoBase64 =
      photoBase64 && photoBase64.length >= 10
        ? photoBase64
        : DEFAULT_PACKAGE_PHOTO_BASE64;

    // 2. Upload photo et signature
    const photoDecoded = decodeBase64DataUrl(effectivePhotoBase64);
    const sigDecoded = decodeBase64DataUrl(signatureBase64);

    const ts = Date.now();
    const photoExt = photoDecoded.mimeType.includes("png") ? "png" : "jpg";
    const photoUrl = await uploadProofFile(
      `proof_photo_${mission.id}_${ts}.${photoExt}`,
      photoDecoded.buffer
    );
    const signatureUrl = await uploadProofFile(
      `proof_sig_${mission.id}_${ts}.png`,
      sigDecoded.buffer
    );

    // 3 & 4. capturedAt serveur + calcul SHA-256
    const capturedAt = new Date();
    const proofHash = computeProofHash({
      missionId: mission.id,
      photoUrl,
      signatureUrl,
      lat,
      lng,
      capturedAtIso: capturedAt.toISOString(),
      deviceFingerprint,
    });

    // 4b. Ancrage externe RFC 3161 (TSA) — non-bloquant en cas d'échec
    let tsaToken: string | null = null;
    let tsaTimestamp: Date | null = null;
    let tsaUrl: string | null = null;
    let tsaVerified = false;

    const tsaResult = await requestTimestamp(proofHash);
    if (tsaResult) {
      tsaToken = tsaResult.token.toString("base64");
      tsaTimestamp = tsaResult.timestamp;
      tsaUrl = tsaResult.tsaUrl;
      tsaVerified = true;
    } else {
      console.warn(
        `[POST /api/missions/[id]/proof] Ancrage TSA indisponible pour la mission ${mission.id} (hash=${proofHash}) — preuve locale uniquement.`
      );
    }

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const verifyUrl = `${baseUrl}/verify/${proofHash}`;

    // 5. Génération du PDF scellé (pdf-lib + certification TSA + QR codes)
    const pdfBuffer = await generateProofPdf({
      missionId: mission.id,
      vendorName:
        mission.vendor.shopName || mission.vendor.name || "Vendeur MotoLink",
      vendorPhone: mission.vendor.phone,
      driverName:
        mission.driver?.name || mission.driver?.phone || "Livreur MotoLink",
      driverPhone: mission.driver?.phone || "",
      buyerName: mission.buyerName || "Client",
      buyerPhone: mission.buyerPhone,
      description: mission.description || "Colis MotoLink",
      address: mission.address,
      priceFCFA: Number(mission.price),
      photoBuffer: photoDecoded.buffer,
      signatureBuffer: sigDecoded.buffer,
      lat,
      lng,
      gpsAccuracy,
      deviceFingerprint,
      capturedAt,
      proofHash,
      verifyUrl,
      tsaVerified,
      tsaTokenBase64: tsaToken,
      tsaTimestamp,
      tsaUrl,
    });

    // 6. Upload du PDF
    const pdfUrl = await uploadProofFile(
      `proof_${mission.id}_${ts}.pdf`,
      pdfBuffer
    );

    // 7, 8 & 9. Création Proof + Mise à jour Mission DELIVERED + AuditLog PROOF_CREATED
    const proof = await prisma.$transaction(async (tx) => {
      const savedProof = await tx.proof.upsert({
        where: { missionId: mission.id },
        update: {
          photoUrl,
          signatureUrl,
          pdfUrl,
          proofHash,
          lat,
          lng,
          gpsAccuracy,
          deviceFingerprint,
          tsaToken,
          tsaTimestamp,
          tsaUrl,
          tsaVerified,
          capturedAt,
        },
        create: {
          missionId: mission.id,
          photoUrl,
          signatureUrl,
          pdfUrl,
          proofHash,
          lat,
          lng,
          gpsAccuracy,
          deviceFingerprint,
          tsaToken,
          tsaTimestamp,
          tsaUrl,
          tsaVerified,
          capturedAt,
        },
      });

      await tx.mission.update({
        where: { id: mission.id },
        data: { status: "DELIVERED" },
      });

      const deliveredCheckpoint = await tx.checkpoint.findFirst({
        where: { missionId: mission.id, type: "DELIVERED" },
      });

      if (!deliveredCheckpoint) {
        await tx.checkpoint.create({
          data: {
            missionId: mission.id,
            type: "DELIVERED",
            lat,
            lng,
            note: buyerSigned
              ? "Livraison confirmée et signée par l'acheteur"
              : "Preuve de livraison scellée (photo + signature)",
          },
        });
      }

      return savedProof;
    });

    // Restauration du statut précédent du livreur (AVAILABLE ou OFFLINE)
    if (mission.driverId) {
      try {
        await restoreDriverStatusAfterMission(
          mission.driverId,
          mission.driverStatusBeforeMission
        );
      } catch (statusErr) {
        console.warn("[proof] Échec restauration statut livreur:", statusErr);
      }

      // Actualisation des paliers de parrainage livreur -> livreur
      try {
        await checkReferralProgress(mission.driverId);
      } catch (refErr) {
        console.warn("[proof] Échec vérification progression parrainage:", refErr);
      }
    }

    // 9. Journal d'audit chaîné (PROOF_CREATED)
    await logEvent(
      "PROOF_CREATED",
      "PROOF",
      proof.id,
      buyerSigned ? null : session?.userId,
      {
        missionId: mission.id,
        proofHash,
        pdfUrl,
        tsaVerified,
        tsaUrl,
        buyerSigned,
      }
    );

    // ── N8 v2 — Ponctualité (non-bloquant) ─────────────────────────────────
    // Calculée uniquement si le délai a été négocié ET accepté par le livreur,
    // et si la prise en charge a été horodatée.
    let punctuality: {
      actualDurationMinutes: number;
      estimatedDurationMinutes: number;
      deliveryOnTime: boolean;
    } | null = null;
    try {
      const durationAgreed =
        mission.pickedUpAt !== null &&
        mission.estimatedDurationMinutes !== null &&
        mission.estimatedDurationMinutes !== undefined &&
        mission.driverAcceptedDuration === true &&
        mission.buyerAgreedDurationAt !== null;

      if (durationAgreed && mission.driverId) {
        const actualDurationMinutes = computeActualMinutes(
          mission.pickedUpAt as Date,
          capturedAt
        );
        const deliveryOnTime = isOnTime(
          actualDurationMinutes,
          mission.estimatedDurationMinutes as number
        );
        punctuality = {
          actualDurationMinutes,
          estimatedDurationMinutes: mission.estimatedDurationMinutes as number,
          deliveryOnTime,
        };

        await prisma.$transaction([
          prisma.mission.update({
            where: { id: mission.id },
            data: { actualDurationMinutes, deliveryOnTime },
          }),
          prisma.user.update({
            where: { id: mission.driverId },
            data: deliveryOnTime
              ? { onTimeCount: { increment: 1 } }
              : { lateCount: { increment: 1 } },
          }),
        ]);

        await logEvent(
          deliveryOnTime ? "DELIVERY_ON_TIME" : "DELIVERY_LATE",
          "MISSION",
          mission.id,
          mission.driverId,
          {
            actualDurationMinutes,
            estimatedDurationMinutes: mission.estimatedDurationMinutes as number,
            pickedUpAt: (mission.pickedUpAt as Date).toISOString(),
            deliveredAt: capturedAt.toISOString(),
          }
        );
      }
    } catch (punctualityErr) {
      console.error(
        "[POST /api/missions/[id]/proof] Calcul de ponctualité échoué (non-bloquant) :",
        punctualityErr
      );
    }

    // 10. Notification "delivered" non-bloquante
    try {
      const link = buildShortTrackingLink(mission.publicToken);
      const preferred = normalizeChannel(
        mission.vendor.preferredChannel || mission.vendor.notificationChannel
      );
      await sendNotification(
        mission.buyerPhone,
        "delivered",
        {
          buyerName: mission.buyerName || "Client",
          shopName:
            mission.vendor.shopName || mission.vendor.name || "MotoLink",
          link,
        },
        preferred
      );
    } catch (notifErr) {
      console.error(
        "[POST /api/missions/[id]/proof] Erreur notification delivered:",
        notifErr
      );
    }

    // 11. Retourne { proofId, pdfUrl, proofHash, tsaVerified, tsaTimestamp, tsaUrl } (sans exposer tsaToken brut)
    return NextResponse.json(
      {
        proofId: proof.id,
        pdfUrl: proof.pdfUrl,
        proofHash: proof.proofHash,
        tsaVerified: proof.tsaVerified,
        tsaTimestamp: proof.tsaTimestamp,
        tsaUrl: proof.tsaUrl,
        ...(punctuality
          ? {
              actualDurationMinutes: punctuality.actualDurationMinutes,
              estimatedDurationMinutes: punctuality.estimatedDurationMinutes,
              deliveryOnTime: punctuality.deliveryOnTime,
            }
          : {}),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/missions/[id]/proof] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur interne lors du scellement de la preuve." },
      { status: 500 }
    );
  }
}
