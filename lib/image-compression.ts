/**
 * MotoLink - Compression d'images côté client pour 3G instable
 * Réduit le poids des photos de colis et de signatures < 1 Mo
 * avant stockage dans IndexedDB et transfert réseau.
 */

export interface CompressionOptions {
  maxSizeBytes?: number; // 1 Mo par défaut (1 048 576 octets)
  maxWidthOrHeight?: number; // 1280px par défaut
  initialQuality?: number; // 0.85
  format?: "image/webp" | "image/jpeg";
}

/**
 * Calcule la taille approximative en octets d'une data URL base64.
 */
export function getBase64SizeBytes(base64DataUrl: string): number {
  const parts = base64DataUrl.split(",");
  const base64Data = parts[1] || parts[0];
  const padding = (base64Data.match(/=/g) || []).length;
  return Math.floor((base64Data.length * 3) / 4) - padding;
}

/**
 * Compresse une image dataURL côté client sous un seuil strict (par défaut 1 Mo).
 */
export async function compressImageBase64(
  dataUrl: string,
  options: CompressionOptions = {}
): Promise<string> {
  const {
    maxSizeBytes = 1024 * 1024, // 1 Mo
    maxWidthOrHeight = 1280,
    initialQuality = 0.85,
    format = "image/webp",
  } = options;

  // Si on est déjà sous la limite et qu'on est en environnement non-navigateur (tests / SSR)
  if (typeof window === "undefined" || typeof document === "undefined") {
    return dataUrl;
  }

  // Vérifier si l'image est déjà sous la limite
  const currentBytes = getBase64SizeBytes(dataUrl);
  if (currentBytes <= maxSizeBytes && !dataUrl.startsWith("data:image/png")) {
    return dataUrl;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      let width = img.naturalWidth || img.width;
      let height = img.naturalHeight || img.height;

      // Redimensionnement proportionnel si plus grand que la dimension max
      if (width > maxWidthOrHeight || height > maxWidthOrHeight) {
        if (width > height) {
          height = Math.round((height * maxWidthOrHeight) / width);
          width = maxWidthOrHeight;
        } else {
          width = Math.round((width * maxWidthOrHeight) / height);
          height = maxWidthOrHeight;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      // Algorithme par itération sur la qualité
      let quality = initialQuality;
      let result = canvas.toDataURL(format, quality);

      // Si le format demandé n'est pas supporté par le navigateur (il renvoie image/png)
      if (result.startsWith("data:image/png")) {
        result = canvas.toDataURL("image/jpeg", quality);
      }

      // Réduire progressivement la qualité si > maxSizeBytes
      while (getBase64SizeBytes(result) > maxSizeBytes && quality > 0.3) {
        quality -= 0.15;
        result = canvas.toDataURL("image/jpeg", quality);
      }

      resolve(result);
    };

    img.onerror = () => {
      resolve(dataUrl);
    };

    img.src = dataUrl;
  });
}

