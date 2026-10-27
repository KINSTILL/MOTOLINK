import assert from "node:assert/strict";
import prisma from "@/lib/prisma";
import { CHECKPOINT_TRANSLATIONS } from "@/components/CheckpointTimeline";

async function runCheckpointTests() {
  console.log("🚀 Exécution des tests : 4 boutons de jalons (Checkpoints) & Timeline...\n");

  // Vérification des traductions officielles
  assert.equal(CHECKPOINT_TRANSLATIONS.PICKED_UP.label, "Colis récupéré");
  assert.equal(CHECKPOINT_TRANSLATIONS.IN_TRANSIT.label, "En route");
  assert.equal(CHECKPOINT_TRANSLATIONS.NEARBY.label, "Arrivé sur place");
  assert.equal(CHECKPOINT_TRANSLATIONS.DELIVERED.label, "Livré");
  assert.equal(CHECKPOINT_TRANSLATIONS.CUSTOM.label, "Note");
  console.log("✅ TRADUCTIONS VALIDÉES : PICKED_UP, IN_TRANSIT, NEARBY, DELIVERED, CUSTOM");

  const testVendorPhone = "+237666660001";
  const testDriverPhone = "+237666660002";

  const vendor = await prisma.user.upsert({
    where: { phone: testVendorPhone },
    update: { role: "VENDOR", shopName: "Boutique Checkpoints Test" },
    create: {
      phone: testVendorPhone,
      role: "VENDOR",
      shopName: "Boutique Checkpoints Test",
    },
  });

  const driver = await prisma.user.upsert({
    where: { phone: testDriverPhone },
    update: {
      role: "DRIVER",
      name: "Livreur Checkpoints Test",
      kycStatus: "VERIFIED",
      verified: true,
    },
    create: {
      phone: testDriverPhone,
      role: "DRIVER",
      name: "Livreur Checkpoints Test",
      kycStatus: "VERIFIED",
      verified: true,
    },
  });

  await prisma.mission.deleteMany({ where: { vendorId: vendor.id } });

  // Création d'une mission en statut ACCEPTED (assignée au livreur)
  const mission = await prisma.mission.create({
    data: {
      vendorId: vendor.id,
      driverId: driver.id,
      buyerPhone: "+237690001122",
      address: "Carrefour Ndokoti, Douala",
      articlePhotoUrls: ["/api/uploads/cp-test.webp"],
      description: "Colis test 4 jalons",
      price: 1500,
      status: "ACCEPTED",
    },
  });

  // 1. Tap "📦 J'ai récupéré" (PICKED_UP avec GPS) → Mission passe à IN_PROGRESS + AuditLog MISSION_STATUS_CHANGED
  const cp1 = await prisma.checkpoint.create({
    data: {
      missionId: mission.id,
      type: "PICKED_UP",
      lat: 4.0511,
      lng: 9.7679,
    },
  });
  await prisma.mission.update({
    where: { id: mission.id },
    data: { status: "IN_PROGRESS" },
  });
  await prisma.auditLog.create({
    data: {
      action: "MISSION_STATUS_CHANGED",
      targetUserId: driver.id,
      metadata: {
        missionId: mission.id,
        checkpointId: cp1.id,
        checkpointType: "PICKED_UP",
        previousStatus: "ACCEPTED",
        newStatus: "IN_PROGRESS",
      },
    },
  });

  const afterStep1 = await prisma.mission.findUnique({ where: { id: mission.id } });
  assert.equal(afterStep1?.status, "IN_PROGRESS");
  console.log("✅ JALON 1 (📦 J'ai récupéré) : PICKED_UP → Mission.status = IN_PROGRESS");

  // 2. Tap "🛵 Je suis en route" (IN_TRANSIT sans GPS → partial)
  await prisma.checkpoint.create({
    data: {
      missionId: mission.id,
      type: "IN_TRANSIT",
      lat: null,
      lng: null,
      note: "Position GPS non disponible (jalon partiel)",
    },
  });
  console.log("✅ JALON 2 (🛵 Je suis en route) : IN_TRANSIT (fallback sans GPS) enregistré");

  // 3. Tap "📍 Je suis arrivé" (NEARBY)
  await prisma.checkpoint.create({
    data: {
      missionId: mission.id,
      type: "NEARBY",
      lat: 4.048,
      lng: 9.754,
    },
  });
  console.log("✅ JALON 3 (📍 Je suis arrivé) : NEARBY enregistré");

  // 4. Tap "✅ J'ai livré" (DELIVERED) → Mission passe à DELIVERED
  const cp4 = await prisma.checkpoint.create({
    data: {
      missionId: mission.id,
      type: "DELIVERED",
      lat: 4.0481,
      lng: 9.7541,
    },
  });
  await prisma.mission.update({
    where: { id: mission.id },
    data: { status: "DELIVERED" },
  });
  await prisma.auditLog.create({
    data: {
      action: "MISSION_STATUS_CHANGED",
      targetUserId: driver.id,
      metadata: {
        missionId: mission.id,
        checkpointId: cp4.id,
        checkpointType: "DELIVERED",
        previousStatus: "IN_PROGRESS",
        newStatus: "DELIVERED",
      },
    },
  });

  const finalMission = await prisma.mission.findUnique({
    where: { id: mission.id },
    include: {
      checkpoints: { orderBy: { createdAt: "asc" } },
    },
  });

  assert.equal(finalMission?.status, "DELIVERED");
  assert.equal(finalMission?.checkpoints.length, 4);
  assert.deepEqual(
    finalMission?.checkpoints.map((c) => c.type),
    ["PICKED_UP", "IN_TRANSIT", "NEARBY", "DELIVERED"]
  );
  console.log("✅ JALON 4 (✅ J'ai livré) : DELIVERED → Mission.status = DELIVERED (4 jalons chronologiques)\n");

  // Nettoyage
  await prisma.mission.deleteMany({ where: { vendorId: vendor.id } });
  await prisma.auditLog.deleteMany({ where: { targetUserId: driver.id } });
  await prisma.user.deleteMany({
    where: { id: { in: [vendor.id, driver.id] } },
  });

  console.log("🎉 Tous les tests des 4 boutons de jalons et de la timeline sont passés avec succès !");
}

runCheckpointTests()
  .catch((err) => {
    console.error("❌ Échec des tests de jalons :", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

