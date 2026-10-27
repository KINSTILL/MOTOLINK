import crypto from "crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import prisma from "@/lib/prisma";

/**
 * N7 — Contrat PDF de livraison.
 *
 * Génère un contrat formalisant l'accord vendeur/livreur à la création d'une mission.
 * Le contrat n'est PAS signé par MotoLink : la plateforme n'est pas partie au contrat.
 */

export interface ContractInput {
  missionId: string;
  shopName: string;
  vendorPhone: string;
  driverName: string | null;
  buyerName: string | null;
  buyerPhone: string;
  address: string;
  description: string | null;
  price: number;
  createdAt: Date;
}

/**
 * Nettoie une chaîne pour l'encodage WinAnsi des polices standard pdf-lib
 * (remplace espaces insécables, tirets longs, retire les emojis non supportés).
 * Doit rester cohérent avec lib/proof-pdf.ts.
 */
function sanitizePdfText(input: string): string {
  return (input || "")
    .replace(/[\u202F\u00A0]/g, " ")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "")
    .trim();
}

/**
 * Empreinte SHA-256 opposable du contenu du contrat.
 * Le payload est stable et canonique : il couvre toutes les parties et le colis.
 */
export function computeContractHash(input: ContractInput): string {
  const payload = JSON.stringify({
    missionId: input.missionId,
    shopName: input.shopName,
    vendorPhone: input.vendorPhone,
    driverName: input.driverName,
    buyerName: input.buyerName,
    buyerPhone: input.buyerPhone,
    address: input.address,
    description: input.description,
    price: input.price,
    createdAt: input.createdAt.toISOString(),
  });
  return crypto.createHash("sha256").update(payload, "utf8").digest("hex");
}

/**
 * Génère le PDF du contrat et retourne { buffer, hash }.
 */
export async function generateContractPdf(input: ContractInput): Promise<{
  buffer: Buffer;
  hash: string;
}> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]); // A4
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const hash = computeContractHash(input);

  let y = 800;
  const left = 50;

  // ── En-tête ──────────────────────────────────────────────────────────
  page.drawText(sanitizePdfText("MotoLink — Contrat de livraison"), {
    x: left,
    y,
    size: 16,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  y -= 20;
  page.drawText(
    sanitizePdfText(
      `Mission #${input.missionId.slice(0, 8)} — ${input.createdAt
        .toISOString()
        .slice(0, 19)
        .replace("T", " ")}`
    ),
    { x: left, y, size: 10, font, color: rgb(0.4, 0.4, 0.4) }
  );
  y -= 30;

  // ── Helper ligne label/value ─────────────────────────────────────────
  const line = (label: string, value: string) => {
    page.drawText(sanitizePdfText(label), {
      x: left,
      y,
      size: 10,
      font: fontBold,
      color: rgb(0.2, 0.2, 0.2),
    });
    page.drawText(sanitizePdfText(value) || "-", {
      x: left + 140,
      y,
      size: 10,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= 16;
  };

  // ── Vendeur ──────────────────────────────────────────────────────────
  page.drawText("Vendeur", { x: left, y, size: 12, font: fontBold });
  y -= 16;
  line("Boutique :", input.shopName);
  line("Téléphone :", input.vendorPhone);
  y -= 10;

  // ── Livreur ──────────────────────────────────────────────────────────
  page.drawText("Livreur", { x: left, y, size: 12, font: fontBold });
  y -= 16;
  line("Nom :", input.driverName || "À assigner");
  y -= 10;

  // ── Acheteur ─────────────────────────────────────────────────────────
  page.drawText("Acheteur", { x: left, y, size: 12, font: fontBold });
  y -= 16;
  line("Nom :", input.buyerName || "-");
  line("Téléphone :", input.buyerPhone);
  line("Adresse :", input.address);
  y -= 10;

  // ── Colis ────────────────────────────────────────────────────────────
  page.drawText("Colis", { x: left, y, size: 12, font: fontBold });
  y -= 16;
  line("Description :", input.description || "-");
  line("Prix livraison :", `${input.price} FCFA`);
  y -= 20;

  // ── Conditions ───────────────────────────────────────────────────────
  page.drawText("Conditions", { x: left, y, size: 12, font: fontBold });
  y -= 16;
  const conditions = [
    "Le livreur s'engage à livrer le colis dans les règles de l'art.",
    "Le vendeur s'engage à payer le prix convenu à la livraison.",
    "Le livreur peut refuser la mission avant la prise en charge.",
    "MotoLink n'est pas partie à ce contrat.",
    "MotoLink fournit un outil technique de traçabilité (preuve scellée).",
    "MotoLink ne peut être tenu responsable de l'exécution ou de l'inexécution.",
  ];
  for (const c of conditions) {
    page.drawText(sanitizePdfText(`• ${c}`), {
      x: left,
      y,
      size: 9,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });
    y -= 13;
  }
  y -= 10;

  // ── Empreinte ────────────────────────────────────────────────────────
  page.drawText("Empreinte du contrat (SHA-256)", {
    x: left,
    y,
    size: 10,
    font: fontBold,
  });
  y -= 14;
  page.drawText(hash, { x: left, y, size: 8, font, color: rgb(0.3, 0.3, 0.3) });
  y -= 20;
  page.drawText(
    sanitizePdfText(
      "Document généré automatiquement — non signé par MotoLink."
    ),
    { x: left, y, size: 8, font, color: rgb(0.5, 0.5, 0.5) }
  );

  const bytes = await pdfDoc.save();
  return { buffer: Buffer.from(bytes), hash };
}

/**
 * Persiste le contrat généré : stockage fichier (compatible /api/proofs/files)
 * puis mise à jour de la mission. Ne bloque jamais la création de mission en cas d'échec.
 */
export async function attachContractToMission(params: {
  missionId: string;
  buffer: Buffer;
  hash: string;
}): Promise<string> {
  // Réutilise le stockage de preuves existant (public/uploads/proofs -> /api/proofs/files/{name})
  const { uploadProofFile } = await import("@/lib/proof-pdf");
  const filename = `contract-${params.missionId}.pdf`;
  const url = await uploadProofFile(filename, params.buffer);

  await prisma.mission.update({
    where: { id: params.missionId },
    data: {
      contractPdfUrl: url,
      contractGeneratedAt: new Date(),
      contractHash: params.hash,
    },
  });

  return url;
}
