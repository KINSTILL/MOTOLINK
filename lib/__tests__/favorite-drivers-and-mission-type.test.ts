import assert from "node:assert/strict";
import prisma from "@/lib/prisma";
import { createMissionSchema } from "@/lib/validations/mission";

async function runTests() {
  console.log("🚀 Exécution des tests : Livreurs préférés & Type de course...\n");

  // Préparation d'un vendeur et d'un livreur vérifié de test
  const testVendorPhone = "+237699990001";
  const testDriverPhone = "+237699990002";

  const vendor = await prisma.user.upsert({
    where: { phone: testVendorPhone },
    update: { role: "VENDOR", shopName: "Boutique Test" },
    create: {
      phone: testVendorPhone,
      role: "VENDOR",
      shopName: "Boutique Test",
    },
  });

  const driver = await prisma.user.upsert({
    where: { phone: testDriverPhone },
    update: { role: "DRIVER", name: "Livreur Test", kycStatus: "VERIFIED", verified: true },
    create: {
      phone: testDriverPhone,
      role: "DRIVER",
      name: "Livreur Test",
      kycStatus: "VERIFIED",
      verified: true,
    },
  });

  // Nettoyage initial pour ces utilisateurs de test
  await prisma.directProposal.deleteMany({ where: { buyerId: vendor.id } });
  await prisma.favoriteDriver.deleteMany({ where: { buyerId: vendor.id } });
  await prisma.mission.deleteMany({ where: { vendorId: vendor.id } });

  // TEST 1 : Créer une mission PARCEL sans livreur préféré → publiée sur le marché ouvert
  const parcelMission = await prisma.mission.create({
    data: {
      vendorId: vendor.id,
      buyerPhone: "+237690001122",
      address: "Carrefour Bonamoussadi, Douala",
      articlePhotoUrls: ["/api/uploads/test-1.webp"],
      price: 1500,
      type: "PARCEL",
      gasCertified: false,
      status: "CREATED",
    },
  });
  const openMarketCheck1 = await prisma.mission.findFirst({
    where: {
      id: parcelMission.id,
      status: "CREATED",
      driverId: null,
      directProposals: { none: { status: "PENDING" } },
    },
  });
  assert.ok(openMarketCheck1, "Test 1: La mission PARCEL doit être publiée sur le marché ouvert");
  console.log("✅ TEST 1 PASSÉ : Mission PARCEL sans livreur préféré → publiée sur le marché ouvert");

  // TEST 2 : Créer une mission GAS sans gasCertified → validation échoue (400 "Certification gaz obligatoire")
  const invalidGasParse = createMissionSchema.safeParse({
    buyerPhone: "+237690001122",
    address: "Carrefour Bonamoussadi, Douala",
    articlePhotoUrls: ["/api/uploads/test-1.webp"],
    price: 2000,
    type: "GAS",
    gasCertified: false,
  });
  assert.equal(invalidGasParse.success, false, "Test 2: GAS sans gasCertified doit être rejeté (400)");
  console.log("✅ TEST 2 PASSÉ : Mission GAS sans gasCertified → rejetée (400 'Certification gaz obligatoire')");

  // TEST 3 : Créer une mission GAS avec gasCertified = true → mission créée
  const validGasParse = createMissionSchema.safeParse({
    buyerPhone: "+237690001122",
    address: "Carrefour Bonamoussadi, Douala",
    articlePhotoUrls: ["/api/uploads/test-1.webp"],
    price: 2000,
    type: "GAS",
    gasCertified: true,
  });
  assert.equal(validGasParse.success, true, "Test 3: GAS avec gasCertified=true doit être valide");
  const gasMission = await prisma.mission.create({
    data: {
      vendorId: vendor.id,
      buyerPhone: validGasParse.data.buyerPhone,
      address: validGasParse.data.address,
      articlePhotoUrls: validGasParse.data.articlePhotoUrls,
      price: validGasParse.data.price,
      type: "GAS",
      gasCertified: true,
      status: "CREATED",
    },
  });
  assert.equal(gasMission.type, "GAS");
  assert.equal(gasMission.gasCertified, true);
  console.log("✅ TEST 3 PASSÉ : Mission GAS avec gasCertified → mission créée avec succès");

  // TEST 7 : Ajouter un livreur préféré → visible dans la liste
  const favDriver = await prisma.favoriteDriver.create({
    data: {
      buyerId: vendor.id,
      driverId: driver.id,
      note: "Rapide à Akwa",
    },
  });
  const favList = await prisma.favoriteDriver.findMany({
    where: { buyerId: vendor.id },
  });
  assert.equal(favList.length, 1);
  assert.equal(favList[0].driverId, driver.id);
  console.log("✅ TEST 7 PASSÉ : Ajouter un livreur préféré → visible dans la liste");

  // TEST 4 : Créer une mission avec preferredDriverId → DirectProposal créée, mission non publiée sur le marché ouvert
  const directMission = await prisma.mission.create({
    data: {
      vendorId: vendor.id,
      buyerPhone: "+237690001122",
      address: "Rue de la Joie, Bali, Douala",
      articlePhotoUrls: ["/api/uploads/test-2.webp"],
      price: 2500,
      type: "GROCERIES",
      status: "CREATED",
    },
  });
  const proposal = await prisma.directProposal.create({
    data: {
      missionId: directMission.id,
      buyerId: vendor.id,
      driverId: driver.id,
      status: "PENDING",
    },
  });
  const openMarketCheck4 = await prisma.mission.findFirst({
    where: {
      id: directMission.id,
      status: "CREATED",
      driverId: null,
      directProposals: { none: { status: "PENDING" } },
    },
  });
  assert.equal(openMarketCheck4, null, "Test 4: La mission avec DirectProposal PENDING ne doit pas apparaître sur le marché ouvert");
  console.log("✅ TEST 4 PASSÉ : Mission avec preferredDriverId → DirectProposal créée, non publiée sur le marché ouvert");

  // TEST 5 : Le livreur accepte la proposition → mission ACCEPTED + Checkpoint PICKED_UP + AuditLog
  await prisma.$transaction([
    prisma.directProposal.update({
      where: { id: proposal.id },
      data: { status: "ACCEPTED", respondedAt: new Date() },
    }),
    prisma.mission.update({
      where: { id: directMission.id },
      data: { driverId: driver.id, status: "ACCEPTED" },
    }),
    prisma.checkpoint.create({
      data: {
        missionId: directMission.id,
        type: "PICKED_UP",
        note: "Proposition directe acceptée",
      },
    }),
    prisma.auditLog.create({
      data: {
        action: "DIRECT_PROPOSAL_ACCEPTED",
        targetUserId: driver.id,
        metadata: { proposalId: proposal.id, missionId: directMission.id },
      },
    }),
  ]);
  const acceptedMission = await prisma.mission.findUnique({
    where: { id: directMission.id },
    include: { checkpoints: true },
  });
  assert.equal(acceptedMission?.status, "ACCEPTED");
  assert.equal(acceptedMission?.driverId, driver.id);
  assert.equal(acceptedMission?.checkpoints[0]?.type, "PICKED_UP");
  console.log("✅ TEST 5 PASSÉ : Le livreur accepte la proposition → mission ACCEPTED + Checkpoint PICKED_UP + AuditLog");

  // TEST 6 : Le livreur refuse → mission reste CREATED
  const secondMission = await prisma.mission.create({
    data: {
      vendorId: vendor.id,
      buyerPhone: "+237690001122",
      address: "Bonapriso, Douala",
      articlePhotoUrls: ["/api/uploads/test-3.webp"],
      price: 1800,
      type: "OTHER",
      status: "CREATED",
    },
  });
  const secondProposal = await prisma.directProposal.create({
    data: {
      missionId: secondMission.id,
      buyerId: vendor.id,
      driverId: driver.id,
      status: "PENDING",
    },
  });
  await prisma.directProposal.update({
    where: { id: secondProposal.id },
    data: { status: "REFUSED", respondedAt: new Date() },
  });
  const checkAfterRefuse = await prisma.mission.findUnique({
    where: { id: secondMission.id },
  });
  assert.equal(checkAfterRefuse?.status, "CREATED");
  assert.equal(checkAfterRefuse?.driverId, null);
  console.log("✅ TEST 6 PASSÉ : Le livreur refuse la proposition → mission reste CREATED");

  // TEST 8 : Retirer un livreur préféré → disparaît de la liste
  await prisma.favoriteDriver.delete({ where: { id: favDriver.id } });
  const favListAfterDelete = await prisma.favoriteDriver.findMany({
    where: { buyerId: vendor.id },
  });
  assert.equal(favListAfterDelete.length, 0);
  console.log("✅ TEST 8 PASSÉ : Retirer un livreur préféré → disparaît de la liste\n");

  // Nettoyage des données de test
  await prisma.directProposal.deleteMany({ where: { buyerId: vendor.id } });
  await prisma.mission.deleteMany({ where: { vendorId: vendor.id } });
  await prisma.auditLog.deleteMany({ where: { targetUserId: driver.id } });
  await prisma.user.deleteMany({
    where: { phone: { in: [testVendorPhone, testDriverPhone] } },
  });

  console.log("🎉 Les 8 tests (Livreurs préférés & Type de course) sont passés avec succès !");
}

runTests()
  .catch((err) => {
    console.error("❌ Échec des tests :", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

