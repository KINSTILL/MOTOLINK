import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export type UserRole = "VENDOR" | "DRIVER" | "BUYER";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Normalise un numéro de téléphone camerounais au format strict +237XXXXXXXXX
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("237") && digits.length === 12) {
    return `+${digits}`;
  }
  if (digits.length === 9) {
    return `+237${digits}`;
  }
  return `+${digits}`;
}

/**
 * Vérifie qu'un numéro est au format +237XXXXXXXXX (9 chiffres après +237)
 */
export function isValidCameroonPhone(phone: string): boolean {
  return /^\+237\d{9}$/.test(phone);
}

/**
 * Formatage des montants en Francs CFA (XAF) pour la zone CEMAC / Cameroun (Douala)
 */
export function formatFCFA(amount: number): string {
  return (
    new Intl.NumberFormat("fr-CM", {
      style: "currency",
      currency: "XAF",
      maximumFractionDigits: 0,
    })
      .format(amount)
      .replace("FCFA", "")
      .trim() + " FCFA"
  );
}

/**
 * Formatage de date & heure selon le fuseau horaire de Douala
 */
export function formatDoualaDateTime(date: Date | string | number): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Africa/Douala",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}
