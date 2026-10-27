import { cookies } from "next/headers";
import {
  isValidCameroonPhone,
  normalizePhone,
  type UserRole,
} from "@/lib/utils";

export { isValidCameroonPhone, normalizePhone, type UserRole };

export const AUTH_COOKIE_NAME = "motolink_token";
export const ONBOARDING_COOKIE_NAME = "motolink_onboarding";

export interface AuthTokenPayload {
  userId: string;
  phone: string;
  role: UserRole;
  name?: string | null;
  iat: number;
  exp: number;
}

export interface OnboardingTokenPayload {
  phone: string;
  purpose: "onboarding";
  iat: number;
  exp: number;
}

function getSecretKeyBytes(): BufferSource {
  const secret =
    process.env.NEXTAUTH_SECRET || "motolink-default-dev-secret-key-change-me";
  return new TextEncoder().encode(secret) as unknown as BufferSource;
}

function base64UrlEncode(data: Uint8Array | string): string {
  const bytes =
    typeof data === "string" ? new TextEncoder().encode(data) : data;
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecodeToBytes(base64Url: string): Uint8Array {
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (base64.length % 4)) % 4;
  const padded = base64 + "=".repeat(padLen);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function getHmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    getSecretKeyBytes(),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/**
 * Génère un JWT signé (HS256) compatible Node.js & Edge Runtime
 */
export async function signJwt<T extends object>(
  payload: Omit<T, "iat" | "exp">,
  expiresInSeconds = 60 * 60 * 24 * 7 // 7 jours par défaut
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const key = await getHmacKey();
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signingInput) as unknown as BufferSource
  );

  const encodedSignature = base64UrlEncode(new Uint8Array(signatureBuffer));
  return `${signingInput}.${encodedSignature}`;
}

/**
 * Vérifie et décode un JWT signé (HS256)
 */
export async function verifyJwt<T extends { exp?: number }>(
  token: string
): Promise<T | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    const key = await getHmacKey();
    const signatureBytes = base64UrlDecodeToBytes(encodedSignature);
    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes as unknown as BufferSource,
      new TextEncoder().encode(signingInput) as unknown as BufferSource
    );

    if (!isValid) return null;

    const payloadJson = new TextDecoder().decode(
      base64UrlDecodeToBytes(encodedPayload)
    );
    const payload = JSON.parse(payloadJson) as T;

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Récupère la session utilisateur courante depuis les cookies (Server Component / API)
 */
export async function getSession(): Promise<AuthTokenPayload | null> {
  if ((global as any).__mockSession) {
    return (global as any).__mockSession;
  }
  try {
    const cookieStore = cookies();
    const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
    if (!token) return null;
    return verifyJwt<AuthTokenPayload>(token);
  } catch {
    return null;
  }
}
