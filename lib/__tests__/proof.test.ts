import assert from "node:assert/strict";
import prisma from "@/lib/prisma";
import {
  computeProofHash,
  decodeBase64DataUrl,
  generateProofPdf,
  uploadProofFile,
} from "@/lib/proof-pdf";

// PNG 1x1 transparent valide pour le test pdf-lib
const SAMPLE_PNG_BASE64 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function runProofTests() {
  console.log("🚀 Exécution des tests : Preuve de livraison scellée (PDF + SHA-256 + QR Code)...\n");

  const testVendorPhone = "+237655550001";
  const testDriverPhone = "+237655550002";

  const vendor = await prisma.user.upsert({
    where: { phone: testVendorPhone },
    update: { role: "VENDOR", shopName: "Boutique Preuve Test" },
    create: {
      phone: testVendorPhone,
      role: "VENDOR",
      shopName: "Boutique Preuve Test",
    },
  });

  const driver = await prisma.user.upsert({
    where: { phone: testDriverPhone },
    update: {
      role: "DRIVER",
      name: "Livreur Preuve Test",
      kycStatus: "VERIFIED",
      verified: true,
    },
    create: {
      phone: testDriverPhone,
      role: "DRIVER",
      name: "Livreur Preuve Test",
      kycStatus: "VERIFIED",
      verified: true,
    },
  });

  await prisma.mission.deleteMany({ where: { vendorId: vendor.id } });

  const mission = await prisma.mission.create({
    data: {
      vendorId: vendor.id,
      driverId: driver.id,
      buyerName: "Amina K.",
      buyerPhone: "+237690001122",
      address: "Bonapriso, Rue Njo-Njo, Douala",
      articlePhotoUrls: ["/api/uploads/proof-test.webp"],
      description: "2 sacs à main et 1 montre",
      price: 2500,
      status: "IN_PROGRESS",
    },
  });

  const decodedPhoto = decodeBase64DataUrl(SAMPLE_PNG_BASE64);
  const decodedSig = decodeBase64DataUrl(SAMPLE_PNG_BASE64);

  const photoUrl = await uploadProofFile(
    `test_photo_${mission.id}.png`,
    decodedPhoto.buffer
  );
  const signatureUrl = await uploadProofFile(
    `test_sig_${mission.id}.png`,
    decodedSig.buffer
  );

  const capturedAt = new Date();
  const lat = 4.0244;
  const lng = 9.6966;
  const gpsAccuracy = 8.5;
  const deviceFingerprint = "Android 14 | Chrome Mobile | 412x915 | Africa/Douala";

  const proofHash = computeProofHash({
    missionId: mission.id,
    photoUrl,
    signatureUrl,
    lat,
    lng,
    capturedAtIso: capturedAt.toISOString(),
    deviceFingerprint,
  });

  assert.equal(proofHash.length, 64, "Le hash SHA-256 doit faire 64 caractères hexadécimaux");
  console.log(`✅ HASH SHA-256 CALCULÉ : ${proofHash}`);

  const verifyUrl = `http://localhost:3000/verify/${proofHash}`;

  const pdfBuffer = await generateProofPdf({
    missionId: mission.id,
    vendorName: vendor.shopName || "Boutique Preuve Test",
    vendorPhone: vendor.phone,
    driverName: driver.name || "Livreur Preuve Test",
    driverPhone: driver.phone,
    buyerName: mission.buyerName || "Amina K.",
    buyerPhone: mission.buyerPhone,
    description: mission.description || "Colis",
    address: mission.address,
    priceFCFA: Number(mission.price),
    photoBuffer: decodedPhoto.buffer,
    signatureBuffer: decodedSig.buffer,
    lat,
    lng,
    gpsAccuracy,
    deviceFingerprint,
    capturedAt,
    proofHash,
    verifyUrl,
  });

  assert.ok(pdfBuffer.length > 1000, "Le PDF généré avec pdf-lib + QRCode doit être valide");
  assert.equal(pdfBuffer.subarray(0, 4).toString("utf8"), "%PDF");
  console.log(`✅ PDF GÉNÉRÉ (pdf-lib + QRCode) : ${pdfBuffer.length} octets`);

  const pdfUrl = await uploadProofFile(`test_proof_${mission.id}.pdf`, pdfBuffer);

  const createdProof = await prisma.$transaction(async (tx) => {
    const p = await tx.proof.create({
      data: {
        missionId: mission.id,
        photoUrl,
        signatureUrl,
        pdfUrl,
        proofHash,
        lat,
        lng,
        gpsAccuracy,
        deviceFingerprint,
        capturedAt,
      },
    });

    await tx.mission.update({
      where: { id: mission.id },
      data: { status: "DELIVERED" },
    });

    await tx.auditLog.create({
      data: {
        action: "PROOF_CREATED",
        targetUserId: driver.id,
        metadata: {
          missionId: mission.id,
          proofId: p.id,
          proofHash,
        },
      },
    });

    return p;
  });

  // Vérification publique par hash (/verify/[hash])
  const verifiedProof = await prisma.proof.findUnique({
    where: { proofHash: createdProof.proofHash },
    include: { mission: true },
  });
  assert.ok(verifiedProof, "La preuve doit être retrouvée par son hash SHA-256 (Preuve authentique)");
  assert.equal(verifiedProof.mission.status, "DELIVERED");
  console.log("✅ VÉRIFICATION /verify/[hash] : Preuve authentique retrouvée & Mission DELIVERED");

  const unknownProof = await prisma.proof.findUnique({
    where: { proofHash: "0".repeat(64) },
  });
  assert.equal(unknownProof, null, "Un hash inconnu doit retourner null (Introuvable)");
  console.log("✅ VÉRIFICATION HASH INVALIDE : Retourne null (Introuvable)\n");

  // Nettoyage
  await prisma.mission.deleteMany({ where: { vendorId: vendor.id } });
  await prisma.auditLog.deleteMany({ where: { targetUserId: driver.id } });
  await prisma.user.deleteMany({
    where: { id: { in: [vendor.id, driver.id] } },
  });

  console.log("🎉 Tous les tests de la preuve de livraison scellée sont passés avec succès !");
}

runProofTests()
  .catch((err) => {
    console.error("❌ Échec des tests de preuve scellée :", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

