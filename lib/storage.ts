  import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { requireEnvSecret } from "@/lib/secrets";

const PRIVATE_STORAGE_ROOT = path.join(process.cwd(), ".private-storage", "kyc");

function getDerivedAesKey(): Buffer {
  const secret = requireEnvSecret(
    ["R2_SECRET_KEY", "NEXTAUTH_SECRET"],
    "motolink-kyc-default-encryption-secret",
    "Chiffrement KYC (AES-256-GCM)"
  );
  return crypto.createHash("sha256").update(secret).digest();
}

function getSigningSecret(): string {
  return requireEnvSecret(
    ["NEXTAUTH_SECRET"],
    "motolink-kyc-signed-url-secret-key",
    "Signature d'URL KYC (HMAC-SHA256)"
  );
}

/**
 * Chiffre un buffer avec AES-256-GCM (chiffrement au repos) et le stocke dans le bucket privé R2/local
 */
export async function storeEncryptedPrivateFile(
  buffer: Buffer,
  mimeType: string,
  userId: string,
  slot: string
): Promise<string> {
  await fs.mkdir(PRIVATE_STORAGE_ROOT, { recursive: true });

  const ext =
    mimeType === "image/png"
      ? "png"
      : mimeType === "image/webp"
      ? "webp"
      : "jpg";
  const uniqueId = crypto.randomUUID();
  const objectKey = `${userId}/${slot}-${uniqueId}.${ext}`;
  const targetPath = path.join(PRIVATE_STORAGE_ROOT, objectKey.replace(/\//g, "_"));

  const key = getDerivedAesKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Format binaire au repos : [12 bytes IV][16 bytes AuthTag][Ciphertext]
  const payload = Buffer.concat([iv, authTag, encrypted]);
  await fs.writeFile(targetPath, payload);

  return objectKey;
}

/**
 * Lit et déchiffre un fichier privé chiffré en AES-256-GCM
 */
export async function readDecryptedPrivateFile(
  objectKey: string
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const safeFilename = objectKey.replace(/[^a-zA-Z0-9._/-]/g, "").replace(/\//g, "_");
    const targetPath = path.join(PRIVATE_STORAGE_ROOT, safeFilename);
    const payload = await fs.readFile(targetPath);

    if (payload.length < 28) return null;

    const iv = payload.subarray(0, 12);
    const authTag = payload.subarray(12, 28);
    const encrypted = payload.subarray(28);

    const key = getDerivedAesKey();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    const mimeType = objectKey.endsWith(".png")
      ? "image/png"
      : objectKey.endsWith(".webp")
      ? "image/webp"
      : "image/jpeg";

    return { buffer: decrypted, mimeType };
  } catch {
    return null;
  }
}

/**
 * Génère une URL signée temporaire (1 heure par défaut) pour l'aperçu administrateur
 */
export function createSignedKycUrl(
  objectKey: string,
  expiresInSeconds = 3600
): string {
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const dataToSign = `${objectKey}:${exp}`;
  const sig = crypto
    .createHmac("sha256", getSigningSecret())
    .update(dataToSign)
    .digest("hex");

  const params = new URLSearchParams({
    key: objectKey,
    exp: String(exp),
    sig,
  });

  return `/api/kyc/file?${params.toString()}`;
}

/**
 * Vérifie la signature HMAC et l'expiration d'une URL signée KYC
 */
export function verifySignedKycUrl(
  objectKey: string,
  exp: string,
  sig: string
): boolean {
  const expNum = Number(exp);
  if (!Number.isFinite(expNum)) return false;

  const now = Math.floor(Date.now() / 1000);
  if (expNum < now) return false;

  const dataToSign = `${objectKey}:${expNum}`;
  const expectedSig = crypto
    .createHmac("sha256", getSigningSecret())
    .update(dataToSign)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(sig, "hex"),
      Buffer.from(expectedSig, "hex")
    );
  } catch {
    return false;
  }
}

