import assert from "assert";
import fs from "fs";
import path from "path";
import prisma from "../prisma";
import { computeProofHash, generateProofPdf } from "../proof-pdf";
import { POST as verifyOtpPost } from "@/app/api/auth/verify/route";
import { signJwt, OnboardingTokenPayload } from "../auth";

const SAMPLE_PNG_BASE64 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

async function runLegalTests() {
  console.log(
    "🚀 Exécution des tests : CGU, Politique de confidentialité, Mentions légales, Onboarding & PDF...\n"
  );

  // 1. Vérification des 3 fichiers de pages légales et de la mention explicite
  const cguContent = fs.readFileSync(
    path.join(process.cwd(), "app/legal/cgu/page.tsx"),
    "utf8"
  );
  const privacyContent = fs.readFileSync(
    path.join(process.cwd(), "app/legal/privacy/page.tsx"),
    "utf8"
  );
  const mentionsContent = fs.readFileSync(
    path.join(process.cwd(), "app/legal/mentions/page.tsx"),
    "utf8"
  );

  assert.ok(
    cguContent.includes(
      "MotoLink est un constat de fait, pas une garantie de paiement ou de qualité."
    ),
    "Les CGU doivent contenir la mention explicite de constat de fait"
  );
  assert.ok(
    cguContent.includes("ARTICLE 3bis") && cguContent.includes("ARTICLE 4bis"),
    "Les CGU doivent contenir tous les articles requis (dont 3bis et 4bis)"
  );
  assert.ok(
    privacyContent.includes("dpo@motolink.cm") &&
      privacyContent.includes("5 ans"),
    "La politique de confidentialité doit mentionner le DPO et les durées de conservation"
  );
  assert.ok(
    mentionsContent.includes("ANTIC"),
    "Les mentions légales doivent mentionner l'ANTIC"
  );
  console.log("✅ 3 PAGES LÉGALES (/legal/cgu, /legal/privacy, /legal/mentions) : Contenu conforme");

  // 2. Test qu'un nouvel utilisateur ne peut pas continuer sans accepter les CGU
  const testPhone = `+237695${Date.now().toString().slice(-6)}`;
  const onboardingToken = await signJwt<OnboardingTokenPayload>(
    { phone: testPhone, purpose: "onboarding" },
    900
  );

  const reqWithoutCgu = new Request("http://localhost:3000/api/auth/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phone: testPhone,
      role: "VENDOR",
      onboardingToken,
      acceptedCgu: false,
      acceptedPrivacy: false,
    }),
  });

  const resWithoutCgu = await verifyOtpPost(reqWithoutCgu);
  const dataWithoutCgu = await resWithoutCgu.json();
  assert.strictEqual(
    resWithoutCgu.status,
    400,
    "Un nouvel utilisateur ne doit pas pouvoir continuer sans accepter les CGU (400 attendu)"
  );
  assert.strictEqual(dataWithoutCgu.requiresCguAcceptance, true);
  console.log(
    "✅ BLOCAGE ONBOARDING SANS ACCEPTATION CGU : 400 requiresCguAcceptance=true"
  );

  // 3. Test qu'un nouvel utilisateur qui accepte les CGU voit acceptedCguAt et acceptedPrivacyAt enregistrés
  const reqWithCgu = new Request("http://localhost:3000/api/auth/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phone: testPhone,
      role: "VENDOR",
      onboardingToken,
      acceptedCgu: true,
      acceptedPrivacy: true,
    }),
  });

  const resWithCgu = await verifyOtpPost(reqWithCgu);
  assert.strictEqual(resWithCgu.status, 200);

  const createdUser = await prisma.user.findUnique({
    where: { phone: testPhone },
  });
  assert.ok(createdUser?.acceptedCguAt instanceof Date);
  assert.ok(createdUser?.acceptedPrivacyAt instanceof Date);
  console.log(
    `✅ ENREGISTREMENT CONSENTEMENT : acceptedCguAt=${createdUser?.acceptedCguAt?.toISOString()}`
  );

  // 4. Test que le PDF de preuve contient "Conformément aux CGU MotoLink, cette preuve est un constat de fait."
  const proofPdfSource = fs.readFileSync(
    path.join(process.cwd(), "lib/proof-pdf.ts"),
    "utf8"
  );
  assert.ok(
    proofPdfSource.includes(
      "Conformément aux CGU MotoLink, cette preuve est un constat de fait."
    ),
    "lib/proof-pdf.ts doit inclure la mention CGU dans le certificat PDF"
  );

  const pngBuffer = Buffer.from(SAMPLE_PNG_BASE64.split(",")[1], "base64");
  const sampleHash = computeProofHash({
    missionId: "00000000-0000-0000-0000-000000000999",
    photoUrl: "/api/proofs/files/p.png",
    signatureUrl: "/api/proofs/files/s.png",
    lat: 4.05,
    lng: 9.76,
    capturedAtIso: new Date().toISOString(),
    deviceFingerprint: "Legal-Test",
  });

  const pdfBytes = await generateProofPdf({
    missionId: "00000000-0000-0000-0000-000000000999",
    vendorName: "Vendeur Legal",
    vendorPhone: testPhone,
    driverName: "Livreur Legal",
    driverPhone: "+237677001122",
    buyerName: "Acheteur Legal",
    buyerPhone: "+237655001122",
    description: "Colis test CGU",
    address: "Akwa, Douala",
    priceFCFA: 1500,
    photoBuffer: pngBuffer,
    signatureBuffer: pngBuffer,
    lat: 4.05,
    lng: 9.76,
    gpsAccuracy: 10,
    deviceFingerprint: "Legal-Test",
    capturedAt: new Date(),
    proofHash: sampleHash,
    verifyUrl: `http://localhost:3000/verify/${sampleHash}`,
  });

  assert.strictEqual(pdfBytes.subarray(0, 5).toString("ascii"), "%PDF-");
  console.log(
    `✅ CERTIFICAT PDF GÉNÉRÉ AVEC MENTION CGU (${pdfBytes.length} octets)\n`
  );

  // Nettoyage
  await prisma.user.deleteMany({ where: { phone: testPhone } });

  console.log("🎉 Tous les tests juridiques (CGU, Privacy, Mentions, Onboarding, PDF) sont passés avec succès !");
}

runLegalTests()
  .catch((err) => {
    console.error("❌ Échec des tests juridiques :", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

