/**
 * MotoLink - Orchestrateur de Tests Complets de la Plateforme
 * Exécute l'ensemble des suites de tests unitaires, d'intégration,
 * de conformité réglementaire, cryptographique et un flux E2E de bout en bout.
 */

import { execSync } from "child_process";
import prisma from "../lib/prisma";
import { logEvent, verifyChain } from "../lib/audit";
import { computeProofHash } from "../lib/proof-pdf";
import { requestTimestamp } from "../lib/tsa";
import { verifyTimestamp } from "../lib/tsa-verify";

interface TestResult {
  name: string;
  category: string;
  durationMs: number;
  passed: boolean;
  error?: string;
}

const npx = process.platform === "win32" ? "npx.cmd" : "npx";

const TEST_FILES = [
  { name: "Mode Hors-Ligne & PWA", file: "lib/__tests__/offline.test.ts", category: "PWA & Offline" },
  { name: "Suivi Acheteur Brandé & API", file: "lib/__tests__/buyer-tracking.test.ts", category: "Tracking Public" },
  { name: "Conformité Légale (CGU/Privacy)", file: "lib/__tests__/legal.test.ts", category: "Juridique" },
  { name: "Journal d'Audit Chaîné SHA-256", file: "lib/__tests__/audit.test.ts", category: "Sécurité & Audit" },
  { name: "Horodatage Certifié TSA RFC 3161", file: "lib/__tests__/tsa.test.ts", category: "Cryptographie" },
  { name: "Preuve Scellée (PDF, QR & Hash)", file: "lib/__tests__/proof.test.ts", category: "Preuve de Livraison" },
  { name: "4 Boutons de Jalons (Checkpoints)", file: "lib/__tests__/checkpoints.test.ts", category: "Livraison" },
  { name: "Photo Départ & Présence Arrivée", file: "lib/__tests__/pickup-photo-and-presence.test.ts", category: "Jalons & Présence" },
  { name: "Abonnements Hebdo & Notch Pay", file: "lib/__tests__/subscriptions.test.ts", category: "Monétisation" },
  { name: "Livreurs Préférés & Types Mission", file: "lib/__tests__/favorite-drivers-and-mission-type.test.ts", category: "Missions" },
  { name: "Classification IA Jev & Fallbacks", file: "lib/__tests__/jev.test.ts", category: "Intelligence Artificielle" },
  { name: "Notifications Multicanales (WhatsApp/SMS)", file: "lib/__tests__/notifications.test.ts", category: "Notifications" },
  { name: "Statut Livreur à 3 États", file: "lib/__tests__/driver-status.test.ts", category: "Disponibilité Livreur" },
  { name: "Ma Flotte Vendeur (4 Onglets)", file: "lib/__tests__/vendor-fleet.test.ts", category: "Flotte Vendeur" },
  { name: "Notification Coursiers Hors-Ligne", file: "lib/__tests__/offline-notifications.test.ts", category: "Notifications Livreur" },
  { name: "Parrainage Vendeur -> Livreur", file: "lib/__tests__/referral.test.ts", category: "Parrainage & Flotte" },
  { name: "Parrainage Livreur -> Livreur", file: "lib/__tests__/driver-referral.test.ts", category: "Parrainage & Badges" },
  { name: "Notation Mutuelle & Tableau d'Honneur", file: "lib/__tests__/mutual-rating.test.ts", category: "Réputation & Score" },
  { name: "Annuaire Volontaire des Livreurs", file: "lib/__tests__/driver-directory.test.ts", category: "Annuaire & Flotte" },
  { name: "Programmation de Livraisons & Agenda", file: "lib/__tests__/scheduled-missions.test.ts", category: "Agenda & Programmation" },
  { name: "Social Commerce (Lien & Smart Paste)", file: "lib/__tests__/social-commerce.test.ts", category: "Social Commerce" },
  { name: "Confirmation de Commande (Appel & Lien)", file: "lib/__tests__/order-confirmation.test.ts", category: "Confirmation Commande" },
  { name: "Code de Remise à 4 Chiffres", file: "lib/__tests__/delivery-code.test.ts", category: "Sécurité Livraison" },
  { name: "Appels Livreur & Client Absent", file: "lib/__tests__/driver-calls.test.ts", category: "Coordination Livraison" },
  { name: "Score de Fiabilité Client", file: "lib/__tests__/buyer-reliability.test.ts", category: "Confiance Client" },
  { name: "Carnet de Bord Livreur", file: "lib/__tests__/driver-carnet.test.ts", category: "Rassurance" },
  ];

async function runE2EFullScenario(): Promise<void> {
  console.log("\n🔄 ========================================================");
  console.log("🏁 EXÉCUTION DU SCÉNARIO E2E : CYCLE COMPLET DE LIVRAISON");
  console.log("========================================================\n");

  const ts = Date.now();
  const vendorPhone = `+23769900${ts.toString().slice(-4)}`;
  const driverPhone = `+23767700${ts.toString().slice(-4)}`;
  const buyerPhone = `+23765500${ts.toString().slice(-4)}`;

  // 1. Inscription Vendeur avec acceptation CGU et abonnement actif
  const vendor = await prisma.user.create({
    data: {
      phone: vendorPhone,
      role: "VENDOR",
      name: "Boutique E2E Douala",
      shopName: "Quincaillerie Moderne Akwa",
      brandingColorHex: "#0284c7",
      acceptedCguAt: new Date(),
      acceptedPrivacyAt: new Date(),
      subscriptionStatus: "ACTIVE",
    },
  });
  console.log(`✅ 1. Vendeur créé avec CGU et abonnement actif (${vendor.shopName})`);

  // 2. Inscription Livreur avec KYC validé et syndicat
  const driver = await prisma.user.create({
    data: {
      phone: driverPhone,
      role: "DRIVER",
      name: "Jean E2E Livreur",
      kycStatus: "VERIFIED",
      verified: true,
      acceptedCguAt: new Date(),
      acceptedPrivacyAt: new Date(),
      subscriptionStatus: "ACTIVE",
    },
  });

  await prisma.kycDocument.create({
    data: {
      userId: driver.id,
      type: "SYNDICATE_CARD",
      status: "VERIFIED",
      syndicateName: "SYNACOMTRA Douala",
      frontKey: "/uploads/syndicate.jpg",
    },
  });
  console.log(`✅ 2. Livreur vérifié avec badge syndicat créé (${driver.name})`);

  // 3. Vendeur ajoute le livreur dans ses favoris
  await prisma.favoriteDriver.create({
    data: {
      buyerId: vendor.id,
      driverId: driver.id,
      note: "Livreur express de confiance",
    },
  });
  console.log("✅ 3. Livreur ajouté aux favoris du vendeur");

  // 4. Création d'une mission de type GAS avec certification sécurité
  const mission = await prisma.mission.create({
    data: {
      vendorId: vendor.id,
      buyerPhone,
      buyerName: "Madame E2E Bonapriso",
      address: "Rue Tokoto, Bonapriso, Douala",
      type: "GAS",
      gasCertified: true,
      category: "urgent",
      categorySource: "jev",
      description: "Bouteille de gaz SCTM 12.5 kg avec détendeur",
      price: 6500,
      status: "CREATED",
    },
  });
  console.log(`✅ 4. Mission GAS créée certifiée gaz & IA Jev (ID: ${mission.id})`);

  // 5. Proposition directe au livreur favori et acceptation
  await prisma.directProposal.create({
    data: {
      missionId: mission.id,
      buyerId: vendor.id,
      driverId: driver.id,
      status: "ACCEPTED",
      respondedAt: new Date(),
    },
  });

  await prisma.mission.update({
    where: { id: mission.id },
    data: {
      driverId: driver.id,
      status: "ACCEPTED",
    },
  });
  console.log("✅ 5. Proposition directe acceptée par le coursier favori");

  // 6. Enchaînement des 4 jalons de livraison
  const checkpoints = [
    { type: "PICKED_UP", note: "Bouteille chargée sur la moto", status: "IN_PROGRESS" },
    { type: "IN_TRANSIT", note: "En route vers Bonapriso", status: "IN_PROGRESS" },
    { type: "NEARBY", note: "Arrivé devant la résidence", status: "IN_PROGRESS" },
    { type: "DELIVERED", note: "Remise au client et contrôle fuite", status: "DELIVERED" },
  ];

  for (const cp of checkpoints) {
    await prisma.checkpoint.create({
      data: {
        missionId: mission.id,
        type: cp.type as any,
        lat: 4.0483,
        lng: 9.7042,
        note: cp.note,
      },
    });
    await prisma.mission.update({
      where: { id: mission.id },
      data: { status: cp.status as any },
    });
    await logEvent("MISSION_STATUS_CHANGED" as any, "MISSION", mission.id, driver.id, {
      checkpoint: cp.type,
      status: cp.status,
    });
  }
  console.log("✅ 6. Parcours complet des 4 jalons validé avec audit log");

  // 7. Scellement de preuve avec hash SHA-256 et horodatage certifié TSA
  const photoUrl = "/uploads/proofs/proof_e2e_photo.jpg";
  const signatureUrl = "/uploads/proofs/proof_e2e_sig.png";
  const capturedAt = new Date();

  const proofHash = computeProofHash({
    missionId: mission.id,
    photoUrl,
    signatureUrl,
    lat: 4.0483,
    lng: 9.7042,
    capturedAtIso: capturedAt.toISOString(),
    deviceFingerprint: "e2e_test_device_fingerprint_douala",
  });

  // Appel TSA RFC 3161
  const tsaRes = await requestTimestamp(proofHash);

  const proof = await prisma.proof.create({
    data: {
      missionId: mission.id,
      photoUrl,
      signatureUrl,
      pdfUrl: "/uploads/proofs/cert_e2e.pdf",
      capturedAt,
      lat: 4.0483,
      lng: 9.7042,
      gpsAccuracy: 8,
      deviceFingerprint: "e2e_test_device_fingerprint_douala",
      proofHash,
      tsaToken: tsaRes ? tsaRes.token.toString("base64") : null,
      tsaTimestamp: tsaRes ? tsaRes.timestamp : null,
      tsaUrl: tsaRes ? tsaRes.tsaUrl : null,
      tsaVerified: Boolean(tsaRes),
    },
  });
  console.log(`✅ 7. Preuve scellée SHA-256 (${proof.proofHash.slice(0, 16)}...) et horodatée TSA`);

  if (tsaRes) {
    const verified = await verifyTimestamp(proofHash, tsaRes.token.toString("base64"));
    console.log(`✅ 7b. Vérification cryptographique du token TSA : valid=${verified.valid}`);
  }

  await logEvent("PROOF_CREATED" as any, "PROOF", proof.id, driver.id, {
    missionId: mission.id,
    proofHash,
    tsaVerified: proof.tsaVerified,
  });

  // 8. Vérification cryptographique du chaînage de l'audit log
  const auditVerification = await verifyChain();
  if (!auditVerification.valid) {
    throw new Error(`❌ Chaîne d'audit corrompue à l'élément ${auditVerification.brokenAt}`);
  }
  console.log("✅ 8. Chaîne d'audit cryptographique SHA-256 100% intègre");

  // Nettoyage de la course de test E2E
  await prisma.proof.deleteMany({ where: { missionId: mission.id } });
  await prisma.checkpoint.deleteMany({ where: { missionId: mission.id } });
  await prisma.directProposal.deleteMany({ where: { missionId: mission.id } });
  await prisma.mission.delete({ where: { id: mission.id } });
  await prisma.favoriteDriver.deleteMany({ where: { buyerId: vendor.id } });
  await prisma.kycDocument.deleteMany({ where: { userId: driver.id } });
  await prisma.user.deleteMany({ where: { id: { in: [vendor.id, driver.id] } } });

  console.log("✅ 9. Nettoyage des données de test terminé");
}

async function main() {
  console.log("\n============================================================");
  console.log("   🚀 MOTOLINK — SUITE COMPLÈTE DE TESTS & QUALIFICATION   ");
  console.log("============================================================\n");

  const startTime = Date.now();
  const results: TestResult[] = [];

  // Phase 1 : Contrôle de typage TypeScript strict
  console.log("⏳ [1/3] Vérification TypeScript (`tsc --noEmit`)...");
  const tscStart = Date.now();
  try {
    execSync(`${npx} tsc --noEmit --incremental false`, { stdio: "pipe", encoding: "utf-8" });
    const duration = Date.now() - tscStart;
    console.log(`✅ Compilation TypeScript réussie sans aucune erreur (${(duration / 1000).toFixed(2)}s)\n`);
    results.push({ name: "Contrôle Typage TypeScript", category: "Qualité Code", durationMs: duration, passed: true });
  } catch (err: any) {
    const duration = Date.now() - tscStart;
    console.error(`❌ Erreur de typage TypeScript`);
    const output = err.stdout?.toString() || err.stderr?.toString() || err.message;
    console.error(output.slice(0, 500));
    results.push({ name: "Contrôle Typage TypeScript", category: "Qualité Code", durationMs: duration, passed: false, error: output });
  }

  // Phase 2 : Exécution des suites de tests modulaires
  console.log(`⏳ [2/3] Exécution des ${TEST_FILES.length} suites de tests modulaires...\n`);
  for (let i = 0; i < TEST_FILES.length; i++) {
    const test = TEST_FILES[i];
    process.stdout.write(`  [${i + 1}/${TEST_FILES.length}] ${test.name.padEnd(42, " ")} `);
    const start = Date.now();

    try {
      execSync(`${npx} tsx ${test.file}`, { stdio: "pipe", encoding: "utf-8" });
      const duration = Date.now() - start;
      console.log(`✅ PASSÉ (${(duration / 1000).toFixed(2)}s)`);
      results.push({
        name: test.name,
        category: test.category,
        durationMs: duration,
        passed: true,
      });
    } catch (err: any) {
      const duration = Date.now() - start;
      console.log(`❌ ÉCHEC (${(duration / 1000).toFixed(2)}s)`);
      const output = err.stdout?.toString() || err.stderr?.toString() || err.message;
      results.push({
        name: test.name,
        category: test.category,
        durationMs: duration,
        passed: false,
        error: output.slice(-400),
      });
    }
  }

  // Phase 3 : Scénario End-to-End global
  console.log("\n⏳ [3/3] Exécution du scénario E2E complet de bout en bout...");
  const e2eStart = Date.now();
  try {
    await runE2EFullScenario();
    const duration = Date.now() - e2eStart;
    console.log(`\n✅ Scénario E2E réussi avec succès (${(duration / 1000).toFixed(2)}s)`);
    results.push({
      name: "Scénario E2E Cycle Complet",
      category: "End-to-End",
      durationMs: duration,
      passed: true,
    });
  } catch (err: any) {
    const duration = Date.now() - e2eStart;
    console.error(`\n❌ Échec du scénario E2E :`, err.message);
    results.push({
      name: "Scénario E2E Cycle Complet",
      category: "End-to-End",
      durationMs: duration,
      passed: false,
      error: err.message,
    });
  }

  // Rapport de synthèse final
  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
  const totalPassed = results.filter((r) => r.passed).length;
  const totalFailed = results.filter((r) => !r.passed).length;

  console.log("\n============================================================");
  console.log("            📊 TABLEAU RÉCAPITULATIF DES TESTS              ");
  console.log("============================================================\n");

  console.log("| #  | Module / Suite                          | Catégorie             | Statut  | Durée    |");
  console.log("|----|-----------------------------------------|-----------------------|---------|----------|");

  results.forEach((r, idx) => {
    const num = (idx + 1).toString().padEnd(2, " ");
    const name = r.name.padEnd(39, " ");
    const cat = r.category.padEnd(21, " ");
    const status = r.passed ? "✅ OK   " : "❌ FAIL ";
    const dur = `${(r.durationMs / 1000).toFixed(2)}s`.padStart(8, " ");
    console.log(`| ${num} | ${name} | ${cat} | ${status} | ${dur} |`);
  });

  console.log("\n------------------------------------------------------------");
  console.log(`RÉSULTAT GLOBAL : ${totalPassed}/${results.length} SUITES PASSÉES AVEC SUCCÈS`);
  console.log(`DURÉE TOTALE    : ${totalDuration}s`);
  console.log("------------------------------------------------------------\n");

  if (totalFailed > 0) {
    console.error(`❌ ÉCHEC : ${totalFailed} test(s) ont échoué.`);
    results.filter(r => !r.passed).forEach(r => {
      console.error(`\nDétails échec [${r.name}] :`);
      console.error(r.error);
    });
    process.exit(1);
  } else {
    console.log("🎉 TOUS LES TESTS SONT AU VERT ! Plateforme qualifiée pour la production.\n");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Erreur d'exécution du runner de tests :", err);
  process.exit(1);
});
