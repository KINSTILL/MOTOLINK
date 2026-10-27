import { normalizePhone } from "@/lib/utils";

export interface ExtractedSmartPaste {
  buyerName: string | null;
  buyerPhone: string | null;
  address: string | null;
  description: string | null;
  price: number | null;
  confidence: number; // 0 to 1
  status: "success" | "partial" | "failed";
  missingFields: string[];
  [key: string]: any;
}

export const KNOWN_QUARTERS = [
  "Akwa",
  "Bonamoussadi",
  "Deido",
  "Bonapriso",
  "Bonabéri",
  "Bonaberi",
  "Ndokoti",
  "Makepe",
  "Biyem-Assi",
  "Mvog-Mbi",
  "Bastos",
  "Nlongkak",
  "Mokolo",
  "Mboppi",
  "Kotto",
  "Logpom",
  "Yassa",
  "Nkolbisson",
  "Bessengue",
  "Bali",
  "Denver",
  "PK8",
  "PK10",
  "PK12",
  "PK14",
  "Bepanda",
  "New Bell",
  "Omnisport",
  "Essos",
  "Madagascar",
  "Mimboman",
  "Ngoa-Ekelle",
];

/**
 * Analyse un texte brut (ex: message WhatsApp copié) et en extrait les informations de livraison
 * selon les heuristiques et formats du commerce camerounais.
 */
export function extractFromRawText(rawText: string): ExtractedSmartPaste {
  if (!rawText || rawText.trim().length < 5) {
    return {
      buyerName: null,
      buyerPhone: null,
      address: null,
      description: null,
      price: null,
      confidence: 0,
      status: "failed",
      missingFields: ["phone", "address", "price", "description"],
    };
  }

  const text = rawText.trim();
  let buyerName: string | null = null;
  let buyerPhone: string | null = null;
  let address: string | null = null;
  let description: string | null = null;
  let price: number | null = null;

  // 1. Extraction du Téléphone (+237 ou 9 chiffres commençant par 6 ou 2)
  const phoneRegex = /(?:\+?237\s*)?[26](?:[\s.-]*\d){8}/g;
  const phoneMatches = text.match(phoneRegex);
  if (phoneMatches && phoneMatches.length > 0) {
    // Prendre le premier numéro détecté
    const rawMatch = phoneMatches[0];
    const cleaned = normalizePhone(rawMatch);
    if (/^\+237\d{9}$/.test(cleaned)) {
      buyerPhone = cleaned;
    }
  }

  // 2. Extraction du Nom
  const namePatterns = [
    /(?:nom|client|acheteur|destinataire|prenom)\s*[:=\-]\s*([A-Za-zÀ-ÿ\s'-]{2,30})/i,
    /(?:je suis|moi c'est|ici c'est|nom c'est)\s+([A-Za-zÀ-ÿ\s'-]{2,25})/i,
  ];
  for (const pat of namePatterns) {
    const match = text.match(pat);
    if (match && match[1]) {
      const candidate = match[1].trim();
      if (!candidate.toLowerCase().includes("livraison") && !candidate.toLowerCase().includes("bonjour")) {
        buyerName = candidate;
        break;
      }
    }
  }

  // 3. Extraction de l'Adresse / Quartier
  // a. Recherche d'un quartier connu
  let detectedQuarter: string | null = null;
  for (const q of KNOWN_QUARTERS) {
    const qRegex = new RegExp(`\\b${q}\\b`, "i");
    if (qRegex.test(text)) {
      detectedQuarter = q;
      break;
    }
  }

  // b. Recherche ligne ou motif d'adresse
  const addressPatterns = [
    /(?:adresse|quartier|lieu|localisation|destination|livrer [aà]|depot [aà])\s*[:=\-]\s*([^\n\r,]{5,100})/i,
    /(?:situ[ée]|carrefour|face [aà]|derri[èe]re|rond-?point|march[ée]|en face|a cote de|immeuble)\s+([^\n\r,]{5,80})/i,
  ];

  let rawAddressLine: string | null = null;
  for (const pat of addressPatterns) {
    const m = text.match(pat);
    if (m && m[1]) {
      rawAddressLine = m[1].trim();
      break;
    }
  }

  if (detectedQuarter && rawAddressLine) {
    if (!rawAddressLine.toLowerCase().includes(detectedQuarter.toLowerCase())) {
      address = `${detectedQuarter}, ${rawAddressLine}`;
    } else {
      address = rawAddressLine;
    }
  } else if (detectedQuarter) {
    // Essayer de capturer la phrase ou ligne entourant le quartier
    const lines = text.split(/[\r\n]+/);
    const lineWithQuarter = lines.find((l) =>
      new RegExp(`\\b${detectedQuarter}\\b`, "i").test(l)
    );
    address = lineWithQuarter && lineWithQuarter.trim().length >= 10
      ? lineWithQuarter.trim()
      : `${detectedQuarter}, Cameroun`;
  } else if (rawAddressLine && rawAddressLine.length >= 10) {
    address = rawAddressLine;
  }

  // 4. Extraction du Prix (FCFA)
  const pricePatterns = [
    /(?:prix|montant|total|somme|tarif|payer|cout)\s*[:=\-]?\s*(\d{1,3}(?:[.\s]\d{3})*|\d+)\s*(?:fcfa|f cfa|cfa|frs|fr|f)?\b/i,
    /\b(\d{1,3}(?:[.\s]\d{3})*|\d+)\s*(?:fcfa|f cfa|cfa|frs)\b/i,
  ];
  for (const pat of pricePatterns) {
    const m = text.match(pat);
    if (m && m[1]) {
      const numStr = m[1].replace(/[\s.]/g, "");
      const val = parseInt(numStr, 10);
      if (!isNaN(val) && val > 0 && val < 500000) {
        price = val;
        break;
      }
    }
  }

  // 5. Extraction de la Description / Produit
  const descPatterns = [
    /(?:article|produit|commande|colis|objet|achat|contenu)\s*[:=\-]\s*([^\n\r]{3,80})/i,
    /(?:je veux|je prends|commande de|concerne)\s*[:=\-]?\s*([^\n\r]{3,80})/i,
  ];
  for (const pat of descPatterns) {
    const m = text.match(pat);
    if (m && m[1]) {
      description = m[1].trim();
      break;
    }
  }

  if (!description) {
    // Repérer des mots clés produits courants
    const productKeywords = [
      "robe", "pantalon", "chaussure", "sac", "mèche", "perruque", "parfum",
      "téléphone", "iphone", "samsung", "montre", "écouteur", "gaz", "bonbonne",
      "gâteau", "repas", "nourriture", "livre", "colis"
    ];
    for (const kw of productKeywords) {
      if (new RegExp(`\\b${kw}\\b`, "i").test(text)) {
        description = `Article (${kw})`;
        break;
      }
    }
  }

  // 6. Calcul de l'indice de confiance (0 - 1)
  let confidence = 0;
  if (buyerPhone) confidence += 0.45;
  if (address) confidence += 0.35;
  if (price !== null) confidence += 0.10;
  if (description) confidence += 0.05;
  if (buyerName) confidence += 0.05;

  confidence = Math.min(1.0, Math.round(confidence * 100) / 100);

  // Détermination du statut
  let status: "success" | "partial" | "failed" = "failed";
  if (confidence >= 0.70) {
    status = "success";
  } else if (confidence >= 0.40) {
    status = "partial";
  } else {
    status = "failed";
  }

  const missingFields: string[] = [];
  if (!buyerPhone) missingFields.push("phone");
  if (!address) missingFields.push("address");
  if (price === null) missingFields.push("price");
  if (!description) missingFields.push("description");

  return {
    buyerName,
    buyerPhone,
    address,
    description,
    price,
    confidence,
    status,
    missingFields,
  };
}
