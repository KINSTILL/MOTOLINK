import crypto from "crypto";
import { AsnConvert, OctetString } from "@peculiar/asn1-schema";
import { AlgorithmIdentifier, Certificate } from "@peculiar/asn1-x509";
import {
  CertificateChoices,
  CertificateSet,
  DigestAlgorithmIdentifiers,
  EncapsulatedContent,
  EncapsulatedContentInfo,
  IssuerAndSerialNumber,
  SignedData,
  SignerIdentifier,
  SignerInfo,
  SignerInfos,
} from "@peculiar/asn1-cms";
import {
  id_ct_tstInfo,
  MessageImprint,
  PKIStatus,
  PKIStatusInfo,
  TimeStampReq,
  TimeStampReqVersion,
  TimeStampResp,
  TimeStampToken,
  TSTInfo,
} from "@peculiar/asn1-tsp";
import forge from "node-forge";

const DEFAULT_TSA_URL = "https://freetsa.org/tsr";
const TSA_TIMEOUT_MS = 10_000;
const OID_SHA256 = "2.16.840.1.101.3.4.2.1";
const OID_SIGNED_DATA = "1.2.840.113549.1.7.2";
const OID_SHA256_WITH_RSA = "1.2.840.113549.1.1.11";

export interface TsaResult {
  token: Buffer;
  timestamp: Date;
  tsaUrl: string;
}

/**
 * Construit un TimeStampResp RFC 3161 complet (CMS SignedData + TSTInfo + certificat RSA X.509)
 * utilisé lorsque TSA_MOCK="true" (ex: environnement de test hors-ligne).
 */
export function buildMockTimeStampResp(hashHex: string): Buffer {
  const hashBuffer = Buffer.from(hashHex.trim(), "hex");
  const now = new Date();

  // Génération d'une paire RSA + certificat X.509 TSA éphémère avec node-forge
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(now.getTime() - 60_000);
  cert.validity.notAfter = new Date(now.getTime() + 365 * 24 * 3600_000);
  const attrs = [
    { name: "commonName", value: "FreeTSA Mock Authority" },
    { name: "organizationName", value: "MotoLink TSA" },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const certDerHex = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).toHex();
  const certDerBuffer = Buffer.from(certDerHex, "hex");

  // Construction ASN.1 TSTInfo
  const serialBytes = crypto.randomBytes(8);
  serialBytes[0] &= 0x7f;
  if (serialBytes[0] === 0) serialBytes[0] = 1;

  const tstInfo = new TSTInfo({
    version: 1,
    policy: "1.2.3.4.1",
    messageImprint: new MessageImprint({
      hashAlgorithm: new AlgorithmIdentifier({
        algorithm: OID_SHA256,
        parameters: null,
      }),
      hashedMessage: new OctetString(new Uint8Array(hashBuffer).buffer),
    }),
    serialNumber: new Uint8Array(serialBytes).buffer,
    genTime: now,
    ordering: false,
  });

  const tstInfoDer = Buffer.from(AsnConvert.serialize(tstInfo));

  // Signature RSA-SHA256 sur TSTInfo
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(tstInfoDer);
  signer.end();
  const privateKeyPem = forge.pki.privateKeyToPem(keys.privateKey);
  const signatureBuffer = signer.sign(privateKeyPem);

  // Encapsulation dans TimeStampResp -> TimeStampToken (ContentInfo id-signedData)
  const certParsed = AsnConvert.parse(certDerBuffer, Certificate);

  const signedData = new SignedData({
    version: 3,
    digestAlgorithms: new DigestAlgorithmIdentifiers([
      new AlgorithmIdentifier({
        algorithm: OID_SHA256,
        parameters: null,
      }),
    ]),
    encapContentInfo: new EncapsulatedContentInfo({
      eContentType: id_ct_tstInfo,
      eContent: new EncapsulatedContent({
        single: new OctetString(new Uint8Array(tstInfoDer).buffer),
      }),
    }),
    certificates: new CertificateSet([
      new CertificateChoices({ certificate: certParsed }),
    ]),
    signerInfos: new SignerInfos([
      new SignerInfo({
        version: 1,
        sid: new SignerIdentifier({
          issuerAndSerialNumber: new IssuerAndSerialNumber({
            issuer: certParsed.tbsCertificate.issuer,
            serialNumber: certParsed.tbsCertificate.serialNumber,
          }),
        }),
        digestAlgorithm: new AlgorithmIdentifier({
          algorithm: OID_SHA256,
          parameters: null,
        }),
        signatureAlgorithm: new AlgorithmIdentifier({
          algorithm: OID_SHA256_WITH_RSA,
          parameters: null,
        }),
        signature: new OctetString(new Uint8Array(signatureBuffer).buffer),
      }),
    ]),
  });

  const tsResp = new TimeStampResp({
    status: new PKIStatusInfo({
      status: PKIStatus.granted,
    }),
    timeStampToken: new TimeStampToken({
      contentType: OID_SIGNED_DATA,
      content: AsnConvert.serialize(signedData),
    }),
  });

  return Buffer.from(AsnConvert.serialize(tsResp));
}

/**
 * Demande un jeton d'horodatage RFC 3161 (TimeStampToken) auprès de l'autorité TSA (FreeTSA par défaut).
 * Ne lève jamais d'exception : en cas d'erreur réseau, timeout (10s) ou statut invalide, logue et retourne null.
 */
export async function requestTimestamp(
  hashHex: string
): Promise<TsaResult | null> {
  const tsaUrl = (process.env.TSA_URL || DEFAULT_TSA_URL).trim();

  try {
    const cleanHex = hashHex.trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(cleanHex)) {
      console.error(
        "[TSA] Empreinte SHA-256 invalide pour requestTimestamp :",
        hashHex
      );
      return null;
    }

    const hashBytes = Buffer.from(cleanHex, "hex");

    // Nonce aléatoire 64 bits positif
    const nonceBytes = crypto.randomBytes(8);
    nonceBytes[0] &= 0x7f;
    if (nonceBytes[0] === 0) {
      nonceBytes[0] = 1;
    }

    // 1. Construction de la requête ASN.1 TimeStampReq (RFC 3161)
    const tsReq = new TimeStampReq({
      version: TimeStampReqVersion.v1,
      messageImprint: new MessageImprint({
        hashAlgorithm: new AlgorithmIdentifier({
          algorithm: OID_SHA256,
          parameters: null,
        }),
        hashedMessage: new OctetString(new Uint8Array(hashBytes).buffer),
      }),
      nonce: new Uint8Array(nonceBytes).buffer,
      certReq: true,
    });

    const reqDerBuffer = Buffer.from(AsnConvert.serialize(tsReq));

    let respDerBuffer: Buffer;

    if (process.env.TSA_MOCK === "true" && tsaUrl === DEFAULT_TSA_URL) {
      respDerBuffer = buildMockTimeStampResp(cleanHex);
    } else {
      // 2. Appel HTTP POST application/timestamp-query avec timeout strict de 10s
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TSA_TIMEOUT_MS);

      try {
        const response = await fetch(tsaUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/timestamp-query",
            Accept: "application/timestamp-reply",
          },
          body: new Uint8Array(reqDerBuffer),
          signal: controller.signal,
        });

        if (!response.ok) {
          console.error(
            `[TSA] Réponse HTTP non valide (${response.status}) depuis ${tsaUrl}`
          );
          return null;
        }

        const arrayBuf = await response.arrayBuffer();
        respDerBuffer = Buffer.from(arrayBuf);
      } finally {
        clearTimeout(timeoutId);
      }
    }

    // 3. Décodage TimeStampResp et vérification PKIStatus === 0 (granted) ou 1 (grantedWithMods)
    const tsResp = AsnConvert.parse(respDerBuffer, TimeStampResp);
    const statusValue = tsResp.status?.status;

    if (
      statusValue !== PKIStatus.granted &&
      statusValue !== PKIStatus.grantedWithMods
    ) {
      console.error(
        `[TSA] Horodatage refusé par l'autorité TSA (status=${statusValue})`
      );
      return null;
    }

    if (!tsResp.timeStampToken) {
      console.error("[TSA] TimeStampResp ne contient aucun TimeStampToken");
      return null;
    }

    // 4. Extraction du TimeStampToken brut + TSTInfo (genTime + identité TSA)
    const tokenBuffer = Buffer.from(
      AsnConvert.serialize(tsResp.timeStampToken)
    );
    const signedData = AsnConvert.parse(
      tsResp.timeStampToken.content,
      SignedData
    );

    const eContentBuffer =
      signedData.encapContentInfo.eContent?.single?.buffer ||
      signedData.encapContentInfo.eContent?.any;

    if (!eContentBuffer) {
      console.error("[TSA] Aucun TSTInfo trouvé dans TimeStampToken");
      return null;
    }

    const tstInfo = AsnConvert.parse(eContentBuffer, TSTInfo);
    const genTime =
      tstInfo.genTime instanceof Date && !isNaN(tstInfo.genTime.getTime())
        ? tstInfo.genTime
        : new Date();

    return {
      token: tokenBuffer,
      timestamp: genTime,
      tsaUrl,
    };
  } catch (error) {
    console.error("[TSA] Échec de l'ancrage RFC 3161 :", error);
    return null;
  }
}
