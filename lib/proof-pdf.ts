import crypto from "crypto";
import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import QRCode from "qrcode";
import { formatDoualaDateTime, formatFCFA } from "@/lib/utils";

const PROOFS_DIR = path.join(process.cwd(), "public", "uploads", "proofs");

/**
 * Nettoie une chaîne pour l'encodage WinAnsi des polices standards pdf-lib
 * (remplace les espaces insécables \u202F / \u00A0, les tirets longs — / – et retire les emojis non supportés).
 */
function sanitizePdfText(input: string): string {
  return input
    .replace(/[\u202F\u00A0]/g, " ")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "")
    .trim();
}

/**
 * Décode une chaîne Data URL base64 ("data:image/png;base64,..." ou base64 brute) en Buffer.
 */
export function decodeBase64DataUrl(dataUrl: string): {
  buffer: Buffer;
  mimeType: string;
} {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    return {
      mimeType: match[1].toLowerCase(),
      buffer: Buffer.from(match[2], "base64"),
    };
  }
  return {
    mimeType: "image/png",
    buffer: Buffer.from(dataUrl, "base64"),
  };
}

/**
 * Sauvegarde un fichier de preuve (photo, signature ou PDF) sur le stockage R2/local
 * et retourne son URL publique /api/proofs/files/{filename}.
 */
export async function uploadProofFile(
  filename: string,
  buffer: Buffer
): Promise<string> {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const fullPath = path.join(PROOFS_DIR, safeName);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(fullPath, buffer);
  return `/api/proofs/files/${safeName}`;
}

/**
 * Calcule le hash SHA-256 opposable de la preuve de livraison :
 * SHA256(missionId + photoUrl + signatureUrl + lat + lng + capturedAt + deviceFingerprint)
 */
export function computeProofHash(params: {
  missionId: string;
  photoUrl: string;
  signatureUrl: string;
  lat: number | null;
  lng: number | null;
  capturedAtIso: string;
  deviceFingerprint: string | null;
}): string {
  const payload = `${params.missionId}${params.photoUrl}${params.signatureUrl}${
    params.lat ?? ""
  }${params.lng ?? ""}${params.capturedAtIso}${params.deviceFingerprint ?? ""}`;

  return crypto.createHash("sha256").update(payload, "utf8").digest("hex");
}

export interface GenerateProofPdfParams {
  missionId: string;
  vendorName: string;
  vendorPhone: string;
  driverName: string;
  driverPhone: string;
  buyerName: string;
  buyerPhone: string;
  description: string;
  address: string;
  priceFCFA: number;
  photoBuffer: Buffer;
  signatureBuffer: Buffer;
  lat: number | null;
  lng: number | null;
  gpsAccuracy: number | null;
  deviceFingerprint: string | null;
  capturedAt: Date;
  proofHash: string;
  verifyUrl: string;
  tsaVerified?: boolean;
  tsaTokenBase64?: string | null;
  tsaTimestamp?: Date | null;
  tsaUrl?: string | null;
}

/**
 * Génère le certificat PDF scellé de preuve de livraison avec pdf-lib, ancrage TSA RFC 3161 et QR codes.
 */
export async function generateProofPdf(
  params: GenerateProofPdfParams
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();

  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);

  // Bandeau d'en-tête MotoLink
  page.drawRectangle({
    x: 0,
    y: height - 80,
    width,
    height: 80,
    color: rgb(0.06, 0.09, 0.16),
  });

  page.drawText("MOTOLINK CAMEROUN - PREUVE DE LIVRAISON SCELLEE", {
    x: 36,
    y: height - 38,
    size: 15,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  page.drawText(
    sanitizePdfText(
      `Mission ID : ${params.missionId}   |   Horodatage serveur : ${formatDoualaDateTime(
        params.capturedAt
      )} (Africa/Douala)`
    ),
    {
      x: 36,
      y: height - 60,
      size: 9.5,
      font: fontRegular,
      color: rgb(0.75, 0.82, 0.92),
    }
  );

  let cursorY = height - 105;

  const drawSectionTitle = (title: string) => {
    page.drawText(sanitizePdfText(title), {
      x: 36,
      y: cursorY,
      size: 10.5,
      font: fontBold,
      color: rgb(0.15, 0.39, 0.92),
    });
    cursorY -= 16;
  };

  const drawKeyValue = (label: string, value: string) => {
    page.drawText(sanitizePdfText(`${label} :`), {
      x: 36,
      y: cursorY,
      size: 9.5,
      font: fontBold,
      color: rgb(0.15, 0.2, 0.28),
    });
    page.drawText(sanitizePdfText(value), {
      x: 165,
      y: cursorY,
      size: 9.5,
      font: fontRegular,
      color: rgb(0.1, 0.12, 0.16),
    });
    cursorY -= 15;
  };

  // 1. Parties prenantes
  drawSectionTitle("1. PARTIES PRENANTES");
  drawKeyValue("Vendeur", `${params.vendorName} (${params.vendorPhone})`);
  drawKeyValue(
    "Livreur certifie",
    `${params.driverName} (${params.driverPhone})`
  );
  drawKeyValue(
    "Acheteur / Client",
    `${params.buyerName} (${params.buyerPhone})`
  );

  cursorY -= 6;

  // 2. Détails de la course
  drawSectionTitle("2. DETAILS DE LA MISSION & DU COLIS");
  drawKeyValue("Description", params.description || "Colis MotoLink");
  drawKeyValue("Adresse remise", params.address);
  drawKeyValue("Montant course", formatFCFA(params.priceFCFA));

  cursorY -= 6;

  // 3. Métadonnées GPS & Empreinte
  drawSectionTitle("3. GEOLOCALISATION & EMPREINTE NUMERIQUE");
  const gpsText =
    params.lat !== null && params.lng !== null
      ? `${params.lat.toFixed(6)}, ${params.lng.toFixed(6)} (Precision : ${
          params.gpsAccuracy ? `${Math.round(params.gpsAccuracy)} m` : "N/A"
        })`
      : "Position GPS non disponible lors du scellement";
  drawKeyValue("Coordonnees GPS", gpsText);
  drawKeyValue(
    "Appareil (Fingerprint)",
    (params.deviceFingerprint || "Non renseigne").slice(0, 75)
  );
  drawKeyValue("Timestamp ISO", params.capturedAt.toISOString());

  cursorY -= 10;

  // 4. Preuves visuelles (Photo du colis + Signature acheteur)
  drawSectionTitle("4. PHOTO DU COLIS REMIS & SIGNATURE DU CLIENT");

  const boxTopY = cursorY - 2;
  const boxHeight = 142;
  const boxWidth = 245;

  // Cadre Photo
  page.drawRectangle({
    x: 36,
    y: boxTopY - boxHeight,
    width: boxWidth,
    height: boxHeight,
    borderColor: rgb(0.75, 0.8, 0.86),
    borderWidth: 1,
    color: rgb(0.97, 0.98, 0.99),
  });
  page.drawText("Photo du colis a la remise", {
    x: 46,
    y: boxTopY - 15,
    size: 8.5,
    font: fontBold,
    color: rgb(0.3, 0.35, 0.42),
  });

  // Cadre Signature
  page.drawRectangle({
    x: 310,
    y: boxTopY - boxHeight,
    width: boxWidth,
    height: boxHeight,
    borderColor: rgb(0.75, 0.8, 0.86),
    borderWidth: 1,
    color: rgb(0.97, 0.98, 0.99),
  });
  page.drawText("Signature manuscrite de l'acheteur", {
    x: 320,
    y: boxTopY - 15,
    size: 8.5,
    font: fontBold,
    color: rgb(0.3, 0.35, 0.42),
  });

  // Intégration de la photo (JPG ou PNG)
  try {
    const isPng =
      params.photoBuffer[0] === 0x89 && params.photoBuffer[1] === 0x50;
    const embeddedPhoto = isPng
      ? await pdfDoc.embedPng(params.photoBuffer)
      : await pdfDoc.embedJpg(params.photoBuffer);
    page.drawImage(embeddedPhoto, {
      x: 46,
      y: boxTopY - boxHeight + 8,
      width: boxWidth - 20,
      height: boxHeight - 30,
    });
  } catch {
    page.drawText("[Photo scellee enregistree]", {
      x: 80,
      y: boxTopY - boxHeight / 2,
      size: 9,
      font: fontRegular,
      color: rgb(0.4, 0.45, 0.5),
    });
  }

  // Intégration de la signature (PNG ou JPG)
  try {
    const isSigPng =
      params.signatureBuffer[0] === 0x89 && params.signatureBuffer[1] === 0x50;
    const embeddedSig = isSigPng
      ? await pdfDoc.embedPng(params.signatureBuffer)
      : await pdfDoc.embedJpg(params.signatureBuffer);
    page.drawImage(embeddedSig, {
      x: 320,
      y: boxTopY - boxHeight + 8,
      width: boxWidth - 20,
      height: boxHeight - 30,
    });
  } catch {
    page.drawText("[Signature scellee enregistree]", {
      x: 350,
      y: boxTopY - boxHeight / 2,
      size: 9,
      font: fontRegular,
      color: rgb(0.4, 0.45, 0.5),
    });
  }

  // 5. Scellement cryptographique SHA-256 & Ancrage TSA RFC 3161
  page.drawRectangle({
    x: 36,
    y: 32,
    width: width - 72,
    height: 196,
    borderColor: rgb(0.15, 0.39, 0.92),
    borderWidth: 1.2,
    color: rgb(0.95, 0.97, 1),
  });

  page.drawText(
    "5. SCEAU CRYPTOGRAPHIQUE SHA-256 & ANCRAGE EXTERNE RFC 3161 (TSA)",
    {
      x: 48,
      y: 210,
      size: 9.5,
      font: fontBold,
      color: rgb(0.15, 0.39, 0.92),
    }
  );

  page.drawText("Empreinte SHA-256 :", {
    x: 48,
    y: 194,
    size: 8.5,
    font: fontBold,
    color: rgb(0.15, 0.2, 0.28),
  });

  page.drawText(params.proofHash, {
    x: 48,
    y: 181,
    size: 7.5,
    font: fontMono,
    color: rgb(0.06, 0.09, 0.16),
  });

  page.drawText(
    sanitizePdfText(`URL de verification : ${params.verifyUrl}`),
    {
      x: 48,
      y: 166,
      size: 8,
      font: fontRegular,
      color: rgb(0.2, 0.25, 0.35),
    }
  );

  if (params.tsaVerified && params.tsaTokenBase64 && params.tsaTimestamp) {
    const authorityUrl = params.tsaUrl || "https://freetsa.org/tsr";

    page.drawText(
      sanitizePdfText(`⏱ Horodatage certifié par ${authorityUrl}`),
      {
        x: 48,
        y: 146,
        size: 8.5,
        font: fontBold,
        color: rgb(0.08, 0.5, 0.24),
      }
    );

    page.drawText(
      sanitizePdfText(
        `Timestamp TSA : ${formatDoualaDateTime(
          params.tsaTimestamp
        )} (${params.tsaTimestamp.toISOString()})`
      ),
      {
        x: 48,
        y: 132,
        size: 7.8,
        font: fontRegular,
        color: rgb(0.15, 0.2, 0.28),
      }
    );

    page.drawText("Token RFC 3161 (Base64 - 3 lignes) :", {
      x: 48,
      y: 118,
      size: 7.5,
      font: fontBold,
      color: rgb(0.2, 0.25, 0.35),
    });

    const cleanB64 = params.tsaTokenBase64.replace(/\s+/g, "");
    const line1 = cleanB64.slice(0, 52);
    const line2 = cleanB64.slice(52, 104);
    const line3 =
      cleanB64.length > 156
        ? `${cleanB64.slice(104, 153)}...`
        : cleanB64.slice(104, 156);

    page.drawText(line1, {
      x: 48,
      y: 105,
      size: 6.8,
      font: fontMono,
      color: rgb(0.1, 0.14, 0.22),
    });
    page.drawText(line2, {
      x: 48,
      y: 94,
      size: 6.8,
      font: fontMono,
      color: rgb(0.1, 0.14, 0.22),
    });
    page.drawText(line3, {
      x: 48,
      y: 83,
      size: 6.8,
      font: fontMono,
      color: rgb(0.1, 0.14, 0.22),
    });

    // 2e QR Code : /verify/{hash}?tsa=true
    const tsaVerifyUrl = `${params.verifyUrl}?tsa=true`;
    try {
      const tsaQrDataUrl = await QRCode.toDataURL(tsaVerifyUrl, {
        margin: 1,
        width: 180,
      });
      const tsaQrDecoded = decodeBase64DataUrl(tsaQrDataUrl);
      const tsaQrImage = await pdfDoc.embedPng(tsaQrDecoded.buffer);
      page.drawImage(tsaQrImage, {
        x: width - 224,
        y: 62,
        width: 78,
        height: 78,
      });
      page.drawText("QR TSA RFC 3161", {
        x: width - 220,
        y: 50,
        size: 6.8,
        font: fontBold,
        color: rgb(0.08, 0.5, 0.24),
      });
    } catch (qrTsaErr) {
      console.error("[generateProofPdf] Erreur génération QR TSA:", qrTsaErr);
    }
  } else {
    page.drawText(
      sanitizePdfText(
        "⚠ Ancrage externe indisponible — preuve locale uniquement"
      ),
      {
        x: 48,
        y: 138,
        size: 8.5,
        font: fontBold,
        color: rgb(0.75, 0.35, 0.05),
      }
    );
  }

  page.drawText(
    sanitizePdfText(
      "Conformément aux CGU MotoLink, cette preuve est un constat de fait."
    ),
    {
      x: 48,
      y: 42,
      size: 7.5,
      font: fontRegular,
      color: rgb(0.35, 0.4, 0.48),
    }
  );

  // 1er QR Code : /verify/{hash}
  try {
    const qrDataUrl = await QRCode.toDataURL(params.verifyUrl, {
      margin: 1,
      width: 180,
    });
    const qrDecoded = decodeBase64DataUrl(qrDataUrl);
    const qrImage = await pdfDoc.embedPng(qrDecoded.buffer);
    page.drawImage(qrImage, {
      x: width - 132,
      y: 62,
      width: 78,
      height: 78,
    });
    page.drawText("QR Preuve SHA-256", {
      x: width - 130,
      y: 50,
      size: 6.8,
      font: fontBold,
      color: rgb(0.15, 0.39, 0.92),
    });
  } catch (qrErr) {
    console.error("[generateProofPdf] Erreur génération QR code:", qrErr);
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
