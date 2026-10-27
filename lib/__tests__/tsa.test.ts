import assert from "assert";
import prisma from "../prisma";
import { buildMockTimeStampResp, requestTimestamp } from "../tsa";
import { verifyTimestamp } from "../tsa-verify";
import { computeProofHash, generateProofPdf } from "../proof-pdf";
import { TimeStampResp } from "@peculiar/asn1-tsp";
import { AsnConvert } from "@peculiar/asn1-schema";

const SAMPLE_PNG_BASE64 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

async function main() {
  console.log(
    "🚀 Exécution des tests : Ancrage TSA RFC 3161 (TimeStampReq / TimeStampResp / Vérification / PDF / Fallback)...\n"
  );

  const sampleHash = computeProofHash({
    missionId: "00000000-0000-0000-0000-000000000777",
    photoUrl: "/api/proofs/files/photo_tsa.png",
    signatureUrl: "/api/proofs/files/sig_tsa.png",
    lat: 4.0511,
    lng: 9.7679,
    capturedAtIso: "2026-10-20T03:45:00.000Z",
    deviceFingerprint: "MotoLink-TSA-Test",
  });

  // 1. Test construction & vérification ASN.1 RFC 3161 (TimeStampToken signé X.509 RSA-SHA256)
  process.env.TSA_MOCK = "true";
  const tsaRes = await requestTimestamp(sampleHash);
  assert.ok(tsaRes, "requestTimestamp doit retourner un TsaResult valide");
  assert.ok(
    Buffer.isBuffer(tsaRes.token) && tsaRes.token.length > 100,
    "Le token ASN.1 doit être un Buffer non vide"
  );
  assert.ok(
    tsaRes.timestamp instanceof Date && !isNaN(tsaRes.timestamp.getTime()),
    "tsaTimestamp doit être une Date valide"
  );
  assert.strictEqual(tsaRes.tsaUrl, "https://freetsa.org/tsr");

  const tokenBase64 = tsaRes.token.toString("base64");
  console.log(
    `✅ TOKEN RFC 3161 GÉNÉRÉ : ${tsaRes.token.length} octets (${
      tokenBase64.slice(0, 48)
    }...)`
  );

  // 2. Test verifyTimestamp(hashHex, tokenBase64) -> valid: true
  const verifiedOk = await verifyTimestamp(sampleHash, tokenBase64);
  assert.strictEqual(
    verifiedOk.valid,
    true,
    "verifyTimestamp doit valider la signature RSA-SHA256 et le hash SHA-256"
  );
  assert.ok(verifiedOk.timestamp instanceof Date);
  console.log(
    `✅ VÉRIFICATION CRYPTOGRAPHIQUE TSA : valid=${verifiedOk.valid}, timestamp=${verifiedOk.timestamp?.toISOString()}`
  );

  // 3. Test verifyTimestamp avec un hash altéré -> valid: false
  const wrongHash = "a".repeat(64);
  const verifiedWrongHash = await verifyTimestamp(wrongHash, tokenBase64);
  assert.strictEqual(
    verifiedWrongHash.valid,
    false,
    "Un hash différent de messageImprint doit être rejeté"
  );
  console.log("✅ REJET HASH ALTÉRÉ : valid=false");

  // 4. Test fallback non-bloquant si TSA indisponible
  const prevUrl = process.env.TSA_URL;
  process.env.TSA_MOCK = "false";
  process.env.TSA_URL = "http://127.0.0.1:59999/tsr-down";
  const failedTsa = await requestTimestamp(sampleHash);
  assert.strictEqual(
    failedTsa,
    null,
    "Si le serveur TSA est injoignable, requestTimestamp doit retourner null sans lever d'exception"
  );
  process.env.TSA_URL = prevUrl || "https://freetsa.org/tsr";
  process.env.TSA_MOCK = "true";
  console.log("✅ FALLBACK TSA DOWN : retourne null sans bloquer la preuve");

  // 5. Test génération PDF avec certification TSA (3 lignes base64 + 2e QR code) ET sans TSA
  const pngBuffer = Buffer.from(SAMPLE_PNG_BASE64.split(",")[1], "base64");
  const pdfWithTsa = await generateProofPdf({
    missionId: "00000000-0000-0000-0000-000000000777",
    vendorName: "Boutique Akwa",
    vendorPhone: "+237690112233",
    driverName: "Jean-Marc Moto",
    driverPhone: "+237677445566",
    buyerName: "Client Bonapriso",
    buyerPhone: "+237655889900",
    description: "Colis horodaté RFC 3161",
    address: "Rue Njo-Njo, Bonapriso, Douala",
    priceFCFA: 2500,
    photoBuffer: pngBuffer,
    signatureBuffer: pngBuffer,
    lat: 4.0511,
    lng: 9.7679,
    gpsAccuracy: 8,
    deviceFingerprint: "MotoLink-TSA-Test",
    capturedAt: new Date(),
    proofHash: sampleHash,
    verifyUrl: `http://localhost:3000/verify/${sampleHash}`,
    tsaVerified: true,
    tsaTokenBase64: tokenBase64,
    tsaTimestamp: tsaRes.timestamp,
    tsaUrl: tsaRes.tsaUrl,
  });
  assert.strictEqual(pdfWithTsa.subarray(0, 5).toString("ascii"), "%PDF-");

  const pdfWithoutTsa = await generateProofPdf({
    missionId: "00000000-0000-0000-0000-000000000778",
    vendorName: "Boutique Akwa",
    vendorPhone: "+237690112233",
    driverName: "Jean-Marc Moto",
    driverPhone: "+237677445566",
    buyerName: "Client Bonapriso",
    buyerPhone: "+237655889900",
    description: "Colis local sans TSA",
    address: "Rue Njo-Njo, Bonapriso, Douala",
    priceFCFA: 2000,
    photoBuffer: pngBuffer,
    signatureBuffer: pngBuffer,
    lat: 4.0511,
    lng: 9.7679,
    gpsAccuracy: 8,
    deviceFingerprint: "MotoLink-Local-Test",
    capturedAt: new Date(),
    proofHash: wrongHash,
    verifyUrl: `http://localhost:3000/verify/${wrongHash}`,
    tsaVerified: false,
  });
  assert.strictEqual(pdfWithoutTsa.subarray(0, 5).toString("ascii"), "%PDF-");
  console.log(
    `✅ PDF CERTIFIÉ TSA (${pdfWithTsa.length} octets) & PDF FALLBACK LOCAL (${pdfWithoutTsa.length} octets) générés`
  );

  // 6. Test persistance Prisma Proof avec tsaToken, tsaTimestamp, tsaUrl, tsaVerified
  const testSuffix = Date.now().toString().slice(-6);
  const vendor = await prisma.user.create({
    data: {
      phone: `+237696${testSuffix}`,
      name: "Vendeur TSA Test",
      shopName: "Boutique TSA",
      role: "VENDOR",
    },
  });
  const driver = await prisma.user.create({
    data: {
      phone: `+237676${testSuffix}`,
      name: "Livreur TSA Test",
      role: "DRIVER",
    },
  });
  const mission = await prisma.mission.create({
    data: {
      vendorId: vendor.id,
      driverId: driver.id,
      buyerPhone: "+237655001122",
      buyerName: "Acheteur TSA",
      address: "Bonamoussadi, Douala, Cameroun",
      description: "Colis test TSA RFC 3161",
      price: 3000,
      status: "DELIVERED",
    },
  });

  const uniqueHash = computeProofHash({
    missionId: mission.id,
    photoUrl: "/api/proofs/files/p.png",
    signatureUrl: "/api/proofs/files/s.png",
    lat: 4.08,
    lng: 9.74,
    capturedAtIso: new Date().toISOString(),
    deviceFingerprint: "Prisma-TSA-Test",
  });

  const rawMockResp = buildMockTimeStampResp(uniqueHash);
  const parsedMockResp = AsnConvert.parse(rawMockResp, TimeStampResp);
  const dbTokenB64 = Buffer.from(
    AsnConvert.serialize(parsedMockResp.timeStampToken!)
  ).toString("base64");

  const savedProof = await prisma.proof.create({
    data: {
      missionId: mission.id,
      photoUrl: "/api/proofs/files/p.png",
      signatureUrl: "/api/proofs/files/s.png",
      pdfUrl: "/api/proofs/files/cert.pdf",
      proofHash: uniqueHash,
      lat: 4.08,
      lng: 9.74,
      gpsAccuracy: 10,
      deviceFingerprint: "Prisma-TSA-Test",
      tsaToken: dbTokenB64,
      tsaTimestamp: tsaRes.timestamp,
      tsaUrl: tsaRes.tsaUrl,
      tsaVerified: true,
      capturedAt: new Date(),
    },
  });

  assert.strictEqual(savedProof.tsaVerified, true);
  assert.strictEqual(savedProof.tsaUrl, "https://freetsa.org/tsr");
  assert.ok(savedProof.tsaToken && savedProof.tsaToken.length > 50);

  const verifyFromDb = await verifyTimestamp(
    savedProof.proofHash,
    savedProof.tsaToken!
  );
  assert.strictEqual(verifyFromDb.valid, true);
  console.log(
    "✅ PERSISTANCE PRISMA PROOF (tsaToken, tsaTimestamp, tsaUrl, tsaVerified=true) & VÉRIFICATION : OK"
  );

  // Nettoyage
  await prisma.mission.delete({ where: { id: mission.id } });
  await prisma.user.deleteMany({
    where: { id: { in: [vendor.id, driver.id] } },
  });

  console.log("\n🎉 Tous les tests d'ancrage TSA RFC 3161 sont passés avec succès !");
}

main()
  .catch((err) => {
    console.error("❌ Échec du test TSA :", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

