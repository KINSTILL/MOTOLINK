import crypto from "crypto";
import { AsnConvert, OctetString } from "@peculiar/asn1-schema";
import { SignedData } from "@peculiar/asn1-cms";
import {
  TimeStampResp,
  TimeStampToken,
  TSTInfo,
} from "@peculiar/asn1-tsp";

const DEFAULT_TSA_URL = "https://freetsa.org/tsr";
const OID_MESSAGE_DIGEST = "1.2.840.113549.1.9.4";

export interface VerifyTimestampResult {
  valid: boolean;
  timestamp: Date | null;
  tsaUrl: string;
}

/**
 * Convertit un OID d'algorithme de hachage ASN.1 en nom d'algorithme Node.js crypto.
 */
function resolveDigestAlgorithm(oid: string): string {
  switch (oid) {
    case "2.16.840.1.101.3.4.2.1":
    case "1.2.840.113549.1.1.11":
      return "sha256";
    case "2.16.840.1.101.3.4.2.2":
    case "1.2.840.113549.1.1.12":
      return "sha384";
    case "2.16.840.1.101.3.4.2.3":
    case "1.2.840.113549.1.1.13":
      return "sha512";
    case "1.3.14.3.2.26":
    case "1.2.840.113549.1.1.5":
      return "sha1";
    default:
      return "sha256";
  }
}

/**
 * Vérifie un jeton d'horodatage RFC 3161 (TimeStampToken encodé en base64) :
 * 1. Décode le token ASN.1 (TimeStampToken / CMS SignedData / TSTInfo)
 * 2. Vérifie que l'empreinte SHA-256 embarquée (messageImprint) correspond à hashHex
 * 3. Vérifie l'intégrité cryptographique (messageDigest CMS + signature X.509 de la TSA)
 */
export async function verifyTimestamp(
  hashHex: string,
  tokenBase64: string,
  customTsaUrl?: string
): Promise<VerifyTimestampResult> {
  const tsaUrl = (
    customTsaUrl ||
    process.env.TSA_URL ||
    DEFAULT_TSA_URL
  ).trim();

  try {
    if (!hashHex || !tokenBase64) {
      return { valid: false, timestamp: null, tsaUrl };
    }

    const expectedHashHex = hashHex.trim().toLowerCase();
    const rawBuffer = Buffer.from(tokenBase64.trim(), "base64");
    if (rawBuffer.length < 32) {
      return { valid: false, timestamp: null, tsaUrl };
    }

    // 1. Décodage TimeStampToken (ou extraction depuis TimeStampResp si nécessaire)
    let tsToken: TimeStampToken;
    try {
      const parsedToken = AsnConvert.parse(rawBuffer, TimeStampToken);
      if (
        !parsedToken.content ||
        parsedToken.content.byteLength === 0 ||
        parsedToken.contentType !== "1.2.840.113549.1.7.2"
      ) {
        throw new Error("Not a direct ContentInfo id-signedData");
      }
      tsToken = parsedToken;
    } catch {
      const parsedResp = AsnConvert.parse(rawBuffer, TimeStampResp);
      if (!parsedResp.timeStampToken) {
        return { valid: false, timestamp: null, tsaUrl };
      }
      tsToken = parsedResp.timeStampToken;
    }

    // 2. Décodage CMS SignedData & TSTInfo
    const signedData = AsnConvert.parse(tsToken.content, SignedData);
    const eContentBuffer =
      signedData.encapContentInfo.eContent?.single?.buffer ||
      signedData.encapContentInfo.eContent?.any;

    if (!eContentBuffer) {
      return { valid: false, timestamp: null, tsaUrl };
    }

    const tstInfoDer = Buffer.from(eContentBuffer);
    const tstInfo = AsnConvert.parse(eContentBuffer, TSTInfo);
    const timestamp =
      tstInfo.genTime instanceof Date && !isNaN(tstInfo.genTime.getTime())
        ? tstInfo.genTime
        : null;

    // 3. Vérification de l'empreinte SHA-256 (messageImprint)
    const imprintedHashHex = Buffer.from(
      tstInfo.messageImprint.hashedMessage.buffer
    )
      .toString("hex")
      .toLowerCase();

    if (imprintedHashHex !== expectedHashHex) {
      return { valid: false, timestamp, tsaUrl };
    }

    // 4. Vérification de la signature TSA dans SignerInfo
    const signerInfo = signedData.signerInfos?.[0];
    if (!signerInfo || !signerInfo.signature?.buffer?.byteLength) {
      return { valid: false, timestamp, tsaUrl };
    }

    const digestAlg = resolveDigestAlgorithm(
      signerInfo.digestAlgorithm.algorithm
    );
    const signatureBuffer = Buffer.from(signerInfo.signature.buffer);

    let signedPayloadBuffer: Buffer = tstInfoDer;

    if (signerInfo.signedAttrs && signerInfo.signedAttrs.length > 0) {
      // Vérifie que l'attribut CMS messageDigest correspond bien au hash de TSTInfo
      const msgDigestAttr = signerInfo.signedAttrs.find(
        (attr) => attr.attrType === OID_MESSAGE_DIGEST
      );
      if (!msgDigestAttr || msgDigestAttr.attrValues.length === 0) {
        return { valid: false, timestamp, tsaUrl };
      }

      const attrOctet = AsnConvert.parse(
        msgDigestAttr.attrValues[0],
        OctetString
      );
      const attrDigestHex = Buffer.from(attrOctet.buffer)
        .toString("hex")
        .toLowerCase();
      const computedTstDigestHex = crypto
        .createHash(digestAlg)
        .update(tstInfoDer)
        .digest("hex")
        .toLowerCase();

      if (attrDigestHex !== computedTstDigestHex) {
        return { valid: false, timestamp, tsaUrl };
      }

      // En CMS (RFC 5652), la signature porte sur signedAttrs ré-encodé avec le tag SET (0x31) au lieu de [0] IMPLICIT (0xA0)
      if (signerInfo.signedAttrsRaw && signerInfo.signedAttrsRaw.byteLength > 0) {
        signedPayloadBuffer = Buffer.from(signerInfo.signedAttrsRaw);
        signedPayloadBuffer[0] = 0x31;
      }
    }

    // Si les certificats X.509 de la TSA sont embarqués dans SignedData, vérifie la signature publique
    if (signedData.certificates && signedData.certificates.length > 0) {
      let certVerified = false;

      for (const certChoice of signedData.certificates) {
        if (!certChoice.certificate) continue;
        try {
          const certDer = Buffer.from(
            AsnConvert.serialize(certChoice.certificate)
          );
          const x509 = new crypto.X509Certificate(certDer);
          const isSigOk = crypto.verify(
            digestAlg,
            signedPayloadBuffer,
            x509.publicKey,
            signatureBuffer
          );
          if (isSigOk) {
            certVerified = true;
            break;
          }
        } catch {
          // Continue avec le certificat suivant de la chaîne
        }
      }

      if (!certVerified) {
        return { valid: false, timestamp, tsaUrl };
      }
    }

    return {
      valid: true,
      timestamp,
      tsaUrl,
    };
  } catch (error) {
    console.error("[TSA Verify] Erreur de vérification du token TSA :", error);
    return { valid: false, timestamp: null, tsaUrl };
  }
}

