import assert from "node:assert/strict";
import prisma from "@/lib/prisma";
import {
  classifyMission,
  triggerAsyncMissionClassification,
} from "@/lib/jev";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runJevTests() {
  console.log("🚀 Exécution des tests : Intégration Jev (TypeSafe AI) Choice...\n");

  process.env.JEV_API_KEY = "jev-mock-api-key";
  process.env.JEV_CONFIDENCE_THRESHOLD = "0.85";
  process.env.JEV_TIMEOUT_MS = "300";
  process.env.JEV_MOCK_DELAY_MS = "40";

  // 1. Scénario 1 : JEV_ENABLED=false → "disabled"
  process.env.JEV_ENABLED = "false";
  delete process.env.JEV_MOCK_MODE;
  const resDisabled = await classifyMission("Gâteau fragile en verre", 2000, [
    "/api/uploads/1.webp",
  ]);
  assert.equal(resDisabled.status, "disabled");
  assert.equal(resDisabled.category, null);
  console.log("✅ SCÉNARIO 1 PASSÉ : JEV_ENABLED=false → status = 'disabled'");

  // 2. Scénario 2 : Confiance >= seuil (0.85) → "success"
  process.env.JEV_ENABLED = "true";
  delete process.env.JEV_MOCK_MODE;
  const resSuccess = await classifyMission(
    "Bouteille en verre fragile et écran TV",
    2500,
    ["/api/uploads/1.webp"]
  );
  assert.equal(resSuccess.status, "success");
  assert.equal(resSuccess.category, "fragile");
  assert.ok((resSuccess.confidence ?? 0) >= 0.85);
  console.log(
    `✅ SCÉNARIO 2 PASSÉ : Confiance >= 0.85 (${resSuccess.confidence}) → status = 'success', category = '${resSuccess.category}'`
  );

  // 3. Scénario 3 : Confiance < seuil (0.85) → "low_confidence"
  process.env.JEV_ENABLED = "true";
  process.env.JEV_MOCK_MODE = "low_confidence";
  const resLow = await classifyMission("Objet incertain", 1000, [
    "/api/uploads/1.webp",
  ]);
  assert.equal(resLow.status, "low_confidence");
  assert.equal(resLow.category, null);
  console.log(
    `✅ SCÉNARIO 3 PASSÉ : Confiance < 0.85 (${resLow.confidence}) → status = 'low_confidence', category = null`
  );

  // 4. Scénario 4 : Timeout (> JEV_TIMEOUT_MS) → "timeout"
  process.env.JEV_ENABLED = "true";
  process.env.JEV_TIMEOUT_MS = "120";
  process.env.JEV_MOCK_MODE = "timeout";
  const resTimeout = await classifyMission("2 polos standards", 1500, [
    "/api/uploads/1.webp",
  ]);
  assert.equal(resTimeout.status, "timeout");
  assert.equal(resTimeout.category, null);
  console.log("✅ SCÉNARIO 4 PASSÉ : Dépassement du délai → status = 'timeout', aucune exception levée");

  // 5. Scénario 5 : Erreur API → "error"
  process.env.JEV_ENABLED = "true";
  process.env.JEV_TIMEOUT_MS = "2000";
  process.env.JEV_MOCK_MODE = "error";
  const resError = await classifyMission("2 polos standards", 1500, [
    "/api/uploads/1.webp",
  ]);
  assert.equal(resError.status, "error");
  assert.equal(resError.category, null);
  console.log("✅ SCÉNARIO 5 PASSÉ : Erreur API 500 → status = 'error', aucune exception levée");

  // Tests Base de données : Création mission asynchrone + PATCH manuel
  const testVendorPhone = "+237677770001";
  const vendor = await prisma.user.upsert({
    where: { phone: testVendorPhone },
    update: { role: "VENDOR", shopName: "Boutique Jev Test" },
    create: {
      phone: testVendorPhone,
      role: "VENDOR",
      shopName: "Boutique Jev Test",
    },
  });

  await prisma.mission.deleteMany({ where: { vendorId: vendor.id } });

  // Test Async POST /api/missions (success → Mission.category="urgent", categorySource="jev", JevDecision enregistrée)
  process.env.JEV_ENABLED = "true";
  delete process.env.JEV_MOCK_MODE;
  process.env.JEV_MOCK_DELAY_MS = "50";

  const mission = await prisma.mission.create({
    data: {
      vendorId: vendor.id,
      buyerPhone: "+237690001122",
      address: "Pharmacie Akwa, Douala",
      articlePhotoUrls: ["/api/uploads/jev-test.webp"],
      description: "Médicament urgent livraison express",
      price: 1500,
      status: "CREATED",
    },
  });

  triggerAsyncMissionClassification({
    missionId: mission.id,
    description: mission.description,
    price: Number(mission.price),
    photoUrls: mission.articlePhotoUrls,
  });

  await sleep(350);

  const updatedMission = await prisma.mission.findUnique({
    where: { id: mission.id },
    include: { jevDecisions: true },
  });

  assert.equal(updatedMission?.category, "urgent");
  assert.equal(updatedMission?.categorySource, "jev");
  assert.equal(updatedMission?.jevDecisions[0]?.status, "success");
  console.log(
    "✅ TEST ASYNC PASSÉ : Classification asynchrone met à jour Mission.category='urgent', categorySource='jev' & JevDecision"
  );

  // Test Sélecteur manuel (PATCH category → categorySource="manual")
  const manualUpdated = await prisma.mission.update({
    where: { id: mission.id },
    data: {
      category: "volumineux",
      categorySource: "manual",
    },
  });
  assert.equal(manualUpdated.category, "volumineux");
  assert.equal(manualUpdated.categorySource, "manual");
  console.log(
    "✅ TEST MANUEL PASSÉ : Modification manuelle → Mission.category='volumineux', categorySource='manual'\n"
  );

  // Nettoyage
  await prisma.mission.deleteMany({ where: { vendorId: vendor.id } });
  await prisma.user.delete({ where: { id: vendor.id } });

  console.log("🎉 Tous les tests Jev (5 scénarios lib/jev.ts + async + manuel) sont passés avec succès !");
}

runJevTests()
  .catch((err) => {
    console.error("❌ Échec des tests Jev :", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

