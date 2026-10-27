import crypto from "crypto";

/**
 * Code de remise à 4 chiffres.
 *
 * Hashé avec scrypt (crypto natif Node.js) — pas de dépendance externe.
 * Le sel (16 octets) est intégré au hash stocké sous la forme : `salt:hash` (hex).
 */

const SCRYPT_KEY_LENGTH = 32;
const SCRYPT_COST = 16384; // N
const SCRYPT_BLOCK_SIZE = 8; // r
const SCRYPT_PARALLELIZATION = 1; // p

/**
 * Génère un code aléatoire à 4 chiffres (1000–9999).
 */
export function generateDeliveryCode(): string {
  // crypto.randomInt est inclusif-exclusif : randomInt(1000, 10000) → [1000, 9999]
  return crypto.randomInt(1000, 10000).toString();
}

/**
 * Hash un code à 4 chiffres avec scrypt + sel aléatoire.
 * Retourne `salt:derivedKey` en hexadécimal.
 */
export async function hashDeliveryCode(code: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      code,
      salt,
      SCRYPT_KEY_LENGTH,
      { N: SCRYPT_COST, r: SCRYPT_BLOCK_SIZE, p: SCRYPT_PARALLELIZATION },
      (err, derivedKey) => {
        if (err) return reject(err);
        resolve(`${salt.toString("hex")}:${derivedKey.toString("hex")}`);
      }
    );
  });
}

/**
 * Vérifie un code en clair contre un hash `salt:derivedKey`.
 * Comparaison à temps constant pour éviter le timing attack.
 */
export async function verifyDeliveryCode(
  code: string,
  storedHash: string
): Promise<boolean> {
  const [saltHex, keyHex] = storedHash.split(":");
  if (!saltHex || !keyHex) return false;

  const salt = Buffer.from(saltHex, "hex");
  const storedKey = Buffer.from(keyHex, "hex");

  return new Promise((resolve, reject) => {
    crypto.scrypt(
      code,
      salt,
      SCRYPT_KEY_LENGTH,
      { N: SCRYPT_COST, r: SCRYPT_BLOCK_SIZE, p: SCRYPT_PARALLELIZATION },
      (err, derivedKey) => {
        if (err) return reject(err);
        resolve(crypto.timingSafeEqual(derivedKey, storedKey));
      }
    );
  });
}
