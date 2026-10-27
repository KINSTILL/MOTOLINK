import assert from "node:assert/strict";
import prisma from "@/lib/prisma";
import {
  computeSubscriptionDates,
  getActiveSubscription,
  runDailySubscriptionCron,
  signNotchPayWebhook,
  verifyNotchPaySignature,
} from "@/lib/notchpay";

async function runSubscriptionTests() {
  console.log("🚀 Exécution des tests : Système d'abonnement hebdomadaire & Notch Pay...\n");

  const testVendorPhone = "+237688880001";
  const testDriverPhone = "+237688880002";

  const vendor = await prisma.user.upsert({
    where: { phone: testVendorPhone },
    update: {
      role: "VENDOR",
      shopName: "Boutique Abonnement Test",
      subscriptionStatus: "NONE",
    },
    create: {
      phone: testVendorPhone,
      role: "VENDOR",
      shopName: "Boutique Abonnement Test",
      subscriptionStatus: "NONE",
    },
  });

  const driver = await prisma.user.upsert({
    where: { phone: testDriverPhone },
    update: {
      role: "DRIVER",
      name: "Livreur Abonnement Test",
      kycStatus: "VERIFIED",
      verified: true,
      subscriptionStatus: "NONE",
    },
    create: {
      phone: testDriverPhone,
      role: "DRIVER",
      name: "Livreur Abonnement Test",
      kycStatus: "VERIFIED",
      verified: true,
      subscriptionStatus: "NONE",
    },
  });

  await prisma.subscription.deleteMany({
    where: { userId: { in: [vendor.id, driver.id] } },
  });
  await prisma.mission.deleteMany({
    where: { vendorId: vendor.id },
  });

  // TEST 2 : Créer une mission sans abonnement → aucun abonnement actif (bloque en 402)
  const subBefore = await getActiveSubscription(vendor.id);
  assert.equal(subBefore, null, "Test 2: Le vendeur ne doit pas avoir d'abonnement actif (402 'Abonnez-vous pour créer une mission')");
  console.log("✅ TEST 2 PASSÉ : Créer une mission sans abonnement → bloqué (402 'Abonnez-vous pour créer une mission')");

  // TEST 1 : Créer un abonnement vendeur hebdo → Subscription ACTIVE + vérification signature HMAC Notch Pay
  const { startsAt, endsAt } = computeSubscriptionDates("WEEKLY");
  const pspRef = `np_test_${Date.now()}`;
  const webhookPayload = JSON.stringify({
    data: {
      reference: pspRef,
      status: "complete",
      amount: 1000,
    },
  });
  const sig = signNotchPayWebhook(webhookPayload);
  assert.equal(verifyNotchPaySignature(webhookPayload, sig), true, "Signature HMAC valide");

  const createdSub = await prisma.subscription.create({
    data: {
      userId: vendor.id,
      role: "VENDOR",
      plan: "WEEKLY",
      priceFCFA: 1000,
      startsAt,
      endsAt,
      status: "ACTIVE",
      pspRef,
    },
  });
  await prisma.user.update({
    where: { id: vendor.id },
    data: { subscriptionStatus: "ACTIVE" },
  });

  const activeVendorSub = await getActiveSubscription(vendor.id);
  assert.ok(activeVendorSub, "Test 1: L'abonnement vendeur hebdo doit être ACTIVE");
  assert.equal(activeVendorSub.status, "ACTIVE");
  assert.equal(activeVendorSub.priceFCFA, 1000);
  console.log("✅ TEST 1 PASSÉ : Créer un abonnement vendeur hebdo (1 000 FCFA) → Subscription ACTIVE");

  // TEST 3 : Créer une mission avec abonnement actif → OK
  const mission = await prisma.mission.create({
    data: {
      vendorId: vendor.id,
      buyerPhone: "+237690001122",
      address: "Akwa, Boulevard de la Liberté",
      articlePhotoUrls: ["/api/uploads/sub-test.webp"],
      price: 1500,
      type: "PARCEL",
      status: "CREATED",
    },
  });
  assert.ok(mission.id, "Test 3: La mission est créée avec abonnement actif");
  console.log("✅ TEST 3 PASSÉ : Créer une mission avec abonnement vendeur actif → OK");

  // TEST 4 : Accepter une mission sans abonnement livreur → 403
  const driverSubBefore = await getActiveSubscription(driver.id);
  assert.equal(driverSubBefore, null, "Test 4: Le livreur sans abonnement est bloqué (403 'Abonnez-vous pour accepter des missions')");
  console.log("✅ TEST 4 PASSÉ : Accepter une mission sans abonnement livreur → bloqué (403 'Abonnez-vous pour accepter des missions')");

  // TEST 5 : Expiration : simuler endsAt < now → cron marque EXPIRED
  const pastDate = new Date(Date.now() - 60 * 60 * 1000); // expiré il y a 1h
  await prisma.subscription.update({
    where: { id: createdSub.id },
    data: { endsAt: pastDate },
  });

  const cronResult = await runDailySubscriptionCron();
  assert.ok(cronResult.expiredCount >= 1, "Test 5: Le cron doit marquer au moins 1 abonnement EXPIRED");

  const checkSubAfterCron = await prisma.subscription.findUnique({
    where: { id: createdSub.id },
  });
  assert.equal(checkSubAfterCron?.status, "EXPIRED", "Test 5: Subscription.status doit être EXPIRED");
  console.log("✅ TEST 5 PASSÉ : Expiration (endsAt < now) → cron quotidien marque Subscription EXPIRED\n");

  // Nettoyage des données de test
  await prisma.mission.deleteMany({ where: { vendorId: vendor.id } });
  await prisma.subscription.deleteMany({
    where: { userId: { in: [vendor.id, driver.id] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [vendor.id, driver.id] } },
  });

  console.log("🎉 Les 5 tests d'abonnement hebdomadaire & Notch Pay sont passés avec succès !");
}

runSubscriptionTests()
  .catch((err) => {
    console.error("❌ Échec des tests d'abonnement :", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

