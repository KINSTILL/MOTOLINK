/**
 * MotoLink - Suite de tests : Statut Livreur à 3 états
 * (AVAILABLE, ON_MISSION, OFFLINE)
 * 
 * Vérifie :
 * 1. Modèle Prisma & migration des champs driverStatus et driverStatusBeforeMission
 * 2. Transition automatique vers ON_MISSION lors de l'acceptation d'une mission
 * 3. Restauration automatique vers AVAILABLE après DELIVERED
 * 4. Cas du livreur OFFLINE recevant une proposition directe -> ON_MISSION puis retour à OFFLINE
 * 5. Rejet (403) si le livreur ON_MISSION tente de modifier manuellement son statut
 * 6. Rejet (402) si le livreur n'a pas d'abonnement actif
 * 7. Rejet (403) si le livreur n'a pas validé son KYC
 * 8. Bascule fluide AVAILABLE <-> OFFLINE via l'API et GET /api/drivers/status
 * 9. Rate limiting à 10 changements par heure (429)
 * 10. AuditLog DRIVER_STATUS_CHANGED créé à chaque modification & chaîne intègre
 */

import assert from "assert";
import prisma from "../prisma";
import { POST as acceptMissionRoute } from "../../app/api/missions/[id]/accept/route";
import { PATCH as respondProposalRoute } from "../../app/api/direct-proposals/[id]/respond/route";
import { POST as proofRoute } from "../../app/api/missions/[id]/proof/route";
import { GET as getStatusRoute, PATCH as updateStatusRoute } from "../../app/api/drivers/status/route";
import { resetStatusRateLimit } from "../driver-status";
import { verifyChain } from "../audit";
import { getDriverStatus, setDriverStatus, restoreDriverStatusAfterMission } from "../driver-status";

const SAMPLE_PHOTO_BASE64 =
  "data:image/jpeg;base64," +
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
  ).toString("base64");

async function runTests() {
  console.log("🚀 Exécution de la suite de tests : Statut livreur à 3 états...");

  const ts = Date.now();
  const vendorPhone = `+23769933${ts.toString().slice(-4)}`;
  const driverPhone1 = `+23767733${ts.toString().slice(-4)}`;
  const driverPhone2 = `+23765533${ts.toString().slice(-4)}`;
  const buyerPhone = `+23768833${ts.toString().slice(-4)}`;

  // Vendeur
  const vendor = await prisma.user.create({
    data: {
      phone: vendorPhone,
      role: "VENDOR",
      name: "Boutique Statut Douala",
      shopName: "Boutique Test Statut",
      subscriptionStatus: "ACTIVE",
      acceptedCguAt: new Date(),
    },
  });

  // Livreur 1 : KYC vérifié + Abonnement actif (démarre AVAILABLE)
  const driver1 = await prisma.user.create({
    data: {
      phone: driverPhone1,
      role: "DRIVER",
      name: "Livreur Disponible",
      kycStatus: "VERIFIED",
      verified: true,
      subscriptionStatus: "ACTIVE",
      driverStatus: "AVAILABLE",
      acceptedCguAt: new Date(),
    },
  });

  // Abonnement actif en table Subscription pour driver1
  await prisma.subscription.create({
    data: {
      userId: driver1.id,
      role: "DRIVER",
      plan: "WEEKLY",
      status: "ACTIVE",
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      priceFCFA: 250,
      pspRef: `mock-sub-1-${ts}`,
    },
  });

  // Livreur 2 : KYC vérifié + Abonnement actif (démarre OFFLINE)
  const driver2 = await prisma.user.create({
    data: {
      phone: driverPhone2,
      role: "DRIVER",
      name: "Livreur Hors-Ligne",
      kycStatus: "VERIFIED",
      verified: true,
      subscriptionStatus: "ACTIVE",
      driverStatus: "OFFLINE",
      acceptedCguAt: new Date(),
    },
  });

  await prisma.subscription.create({
    data: {
      userId: driver2.id,
      role: "DRIVER",
      plan: "WEEKLY",
      status: "ACTIVE",
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      priceFCFA: 250,
      pspRef: `mock-sub-2-${ts}`,
    },
  });

  // =========================================================================
  // TEST 1 : Vérification schéma Prisma & valeurs initiales
  // =========================================================================
  console.log("\n📦 TEST 1 : Modèle Prisma et statuts initiaux");
  const d1 = await prisma.user.findUnique({ where: { id: driver1.id } });
  const d2 = await prisma.user.findUnique({ where: { id: driver2.id } });
  assert.strictEqual(d1?.driverStatus, "AVAILABLE");
  assert.strictEqual(d2?.driverStatus, "OFFLINE");
  console.log("  ✓ driverStatus enum et colonnes bien initialisés (AVAILABLE / OFFLINE)");

  // =========================================================================
  // TEST 2 : Livreur AVAILABLE accepte une mission -> Passe ON_MISSION
  // =========================================================================
  console.log("\n🚀 TEST 2 : Acceptation mission -> transition automatique à ON_MISSION");
  const mission1 = await prisma.mission.create({
    data: {
      vendorId: vendor.id,
      buyerPhone,
      buyerName: "Client Test 1",
      address: "Akwa, Douala",
      description: "Colis rapide",
      price: 2500,
      status: "CREATED",
    },
  });

  (global as any).__mockSession = {
    userId: driver1.id,
    role: "DRIVER",
    phone: driver1.phone,
  };

  const reqAccept = new Request(`http://localhost:3000/api/missions/${mission1.id}/accept`, {
    method: "POST",
  });
  const resAccept = await acceptMissionRoute(reqAccept, { params: { id: mission1.id } });
  assert.strictEqual(resAccept.status, 200, "L'acceptation doit réussir");

  const d1AfterAccept = await getDriverStatus(driver1.id);
  assert.strictEqual(d1AfterAccept, "ON_MISSION", "Le livreur doit passer à ON_MISSION");

  const m1Updated = await prisma.mission.findUnique({ where: { id: mission1.id } });
  assert.strictEqual(m1Updated?.status, "ACCEPTED");
  assert.strictEqual(m1Updated?.driverStatusBeforeMission, "AVAILABLE", "Le statut antérieur doit être AVAILABLE");
  console.log("  ✓ Livreur AVAILABLE passé automatiquement à ON_MISSION, statut antérieur mémorisé");

  // Le scellement de preuve exige désormais un code de remise validé (nouveau flux).
  // On simule la validation du code pour ce livreur avant la livraison.
  await prisma.mission.update({
    where: { id: mission1.id },
    data: { deliveryCodeVerifiedAt: new Date() },
  });

  // =========================================================================
  // TEST 3 : Après livraison (DELIVERED) -> Repasse AVAILABLE
  // =========================================================================
  console.log("\n🏁 TEST 3 : Livraison terminée -> Restauration vers AVAILABLE");
  const reqProof = new Request(`http://localhost:3000/api/missions/${mission1.id}/proof`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      photoBase64: SAMPLE_PHOTO_BASE64,
      signatureBase64: SAMPLE_PHOTO_BASE64,
      buyerSigned: false,
    }),
  });

  const resProof = await proofRoute(reqProof, { params: { id: mission1.id } });
  assert.ok(
    resProof.status === 200 || resProof.status === 201,
    `Le scellement de preuve doit réussir (200 ou 201), reçu: ${resProof.status}`
  );

  const d1AfterDelivered = await getDriverStatus(driver1.id);
  assert.strictEqual(d1AfterDelivered, "AVAILABLE", "Le livreur doit repasser à AVAILABLE après livraison");
  console.log("  ✓ Livreur restauré avec succès à AVAILABLE");

  // =========================================================================
  // TEST 4 : Livreur OFFLINE reçoit une proposition directe et accepte -> ON_MISSION puis retour à OFFLINE
  // =========================================================================
  console.log("\n🎯 TEST 4 : Livreur OFFLINE -> ON_MISSION -> Restauration vers OFFLINE");
  const mission2 = await prisma.mission.create({
    data: {
      vendorId: vendor.id,
      buyerPhone,
      buyerName: "Client Test 2",
      address: "Bonanjo, Douala",
      description: "Colis assigné directement",
      price: 3000,
      status: "CREATED",
    },
  });

  const proposal = await prisma.directProposal.create({
    data: {
      missionId: mission2.id,
      driverId: driver2.id,
      buyerId: vendor.id,
      status: "PENDING",
    },
  });

  (global as any).__mockSession = {
    userId: driver2.id,
    role: "DRIVER",
    phone: driver2.phone,
  };

  const reqProposal = new Request(`http://localhost:3000/api/direct-proposals/${proposal.id}/respond`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ response: "ACCEPTED" }),
  });
  const resProposal = await respondProposalRoute(reqProposal, { params: { id: proposal.id } });
  assert.strictEqual(resProposal.status, 200, "L'acceptation directe doit réussir");

  const d2OnMission = await getDriverStatus(driver2.id);
  assert.strictEqual(d2OnMission, "ON_MISSION", "Le livreur 2 doit passer à ON_MISSION");

  const m2Updated = await prisma.mission.findUnique({ where: { id: mission2.id } });
  assert.strictEqual(m2Updated?.driverStatusBeforeMission, "OFFLINE", "Le statut antérieur mémorisé doit être OFFLINE");

  // Le code de remise doit être validé avant le scellement (nouveau flux).
  await prisma.mission.update({
    where: { id: mission2.id },
    data: { deliveryCodeVerifiedAt: new Date() },
  });

  // Livrer la mission 2
  const reqProof2 = new Request(`http://localhost:3000/api/missions/${mission2.id}/proof`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      photoBase64: SAMPLE_PHOTO_BASE64,
      signatureBase64: SAMPLE_PHOTO_BASE64,
      buyerSigned: false,
    }),
  });
  const resProof2 = await proofRoute(reqProof2, { params: { id: mission2.id } });
  assert.ok(
    resProof2.status === 200 || resProof2.status === 201,
    `Le scellement de preuve doit réussir (200 ou 201), reçu: ${resProof2.status}`
  );

  const d2AfterDelivery = await getDriverStatus(driver2.id);
  assert.strictEqual(d2AfterDelivery, "OFFLINE", "Le livreur 2 doit revenir à son statut initial OFFLINE");
  console.log("  ✓ Livreur OFFLINE passé ON_MISSION puis restauré fidèlement à OFFLINE");

  // =========================================================================
  // TEST 5 : Livreur ON_MISSION tente de changer son statut via l'API -> 403
  // =========================================================================
  console.log("\n🚫 TEST 5 : Tentative de modification pendant ON_MISSION -> 403");
  // Placer artificiellement driver1 en ON_MISSION
  await setDriverStatus(driver1.id, "ON_MISSION");

  (global as any).__mockSession = {
    userId: driver1.id,
    role: "DRIVER",
    phone: driver1.phone,
  };

  const reqChangeWhileOnMission = new Request("http://localhost:3000/api/drivers/status", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "OFFLINE" }),
  });
  const resChangeWhileOnMission = await updateStatusRoute(reqChangeWhileOnMission);
  assert.strictEqual(resChangeWhileOnMission.status, 403, "Doit renvoyer 403 quand ON_MISSION");
  const dataOnMission = await resChangeWhileOnMission.json();
  assert.ok(dataOnMission.error.includes("En mission"));
  console.log("  ✓ 403 Forbidden reçu avec message explicatif");

  // =========================================================================
  // TEST 6 : Livreur sans abonnement -> 402 Payment Required
  // =========================================================================
  console.log("\n💳 TEST 6 : Tentative sans abonnement actif -> 402");
  const driverNoSub = await prisma.user.create({
    data: {
      phone: `+23769944${ts.toString().slice(-4)}`,
      role: "DRIVER",
      name: "Livreur Sans Abonnement",
      kycStatus: "VERIFIED",
      verified: true,
      subscriptionStatus: "NONE",
      driverStatus: "OFFLINE",
    },
  });

  (global as any).__mockSession = {
    userId: driverNoSub.id,
    role: "DRIVER",
    phone: driverNoSub.phone,
  };

  const reqNoSub = new Request("http://localhost:3000/api/drivers/status", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "AVAILABLE" }),
  });
  const resNoSub = await updateStatusRoute(reqNoSub);
  assert.strictEqual(resNoSub.status, 402, "Doit renvoyer 402 sans abonnement");
  console.log("  ✓ 402 Payment Required retourné");

  // =========================================================================
  // TEST 7 : Livreur sans KYC vérifié -> 403
  // =========================================================================
  console.log("\n🛡️ TEST 7 : Tentative sans KYC vérifié -> 403");
  const driverNoKyc = await prisma.user.create({
    data: {
      phone: `+23769955${ts.toString().slice(-4)}`,
      role: "DRIVER",
      name: "Livreur Non KYC",
      kycStatus: "PENDING",
      verified: false,
      subscriptionStatus: "ACTIVE",
      driverStatus: "OFFLINE",
    },
  });
  await prisma.subscription.create({
    data: {
      userId: driverNoKyc.id,
      role: "DRIVER",
      plan: "WEEKLY",
      status: "ACTIVE",
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      priceFCFA: 250,
      pspRef: `mock-sub-nokyc-${ts}`,
    },
  });

  (global as any).__mockSession = {
    userId: driverNoKyc.id,
    role: "DRIVER",
    phone: driverNoKyc.phone,
  };

  const reqNoKyc = new Request("http://localhost:3000/api/drivers/status", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "AVAILABLE" }),
  });
  const resNoKyc = await updateStatusRoute(reqNoKyc);
  assert.strictEqual(resNoKyc.status, 403, "Doit renvoyer 403 sans KYC");
  console.log("  ✓ 403 Forbidden retourné pour défaut de KYC");

  // =========================================================================
  // TEST 8 : Toggle API AVAILABLE <-> OFFLINE & GET /api/drivers/status
  // =========================================================================
  console.log("\n🔄 TEST 8 : Bascule fluide AVAILABLE <-> OFFLINE et interrogation GET");
  resetStatusRateLimit(driver1.id);
  await setDriverStatus(driver1.id, "OFFLINE");

  (global as any).__mockSession = {
    userId: driver1.id,
    role: "DRIVER",
    phone: driver1.phone,
  };

  // Passer à AVAILABLE
  const reqToggleToAvail = new Request("http://localhost:3000/api/drivers/status", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "AVAILABLE" }),
  });
  const resToggleToAvail = await updateStatusRoute(reqToggleToAvail);
  assert.strictEqual(resToggleToAvail.status, 200);
  const dataAvail = await resToggleToAvail.json();
  assert.strictEqual(dataAvail.status, "AVAILABLE");

  // GET /api/drivers/status
  const resGetStatus = await getStatusRoute();
  assert.strictEqual(resGetStatus.status, 200);
  const dataGet = await resGetStatus.json();
  assert.strictEqual(dataGet.status, "AVAILABLE");
  assert.strictEqual(dataGet.canChange, true);
  assert.strictEqual(dataGet.reason, null);

  // Passer à OFFLINE
  const reqToggleToOff = new Request("http://localhost:3000/api/drivers/status", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "OFFLINE" }),
  });
  const resToggleToOff = await updateStatusRoute(reqToggleToOff);
  assert.strictEqual(resToggleToOff.status, 200);
  const dataOff = await resToggleToOff.json();
  assert.strictEqual(dataOff.status, "OFFLINE");
  console.log("  ✓ Transitions manuelles 200 OK et GET statut conforme");

  // =========================================================================
  // TEST 9 : Rate limiting (maximum 10 modifications par heure -> 429)
  // =========================================================================
  console.log("\n⏱️ TEST 9 : Rate limiting (max 10 changements/heure)");
  resetStatusRateLimit(driver1.id);

  for (let i = 0; i < 10; i++) {
    const nextSt = i % 2 === 0 ? "AVAILABLE" : "OFFLINE";
    const req = new Request("http://localhost:3000/api/drivers/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextSt }),
    });
    const res = await updateStatusRoute(req);
    assert.strictEqual(res.status, 200, `L'itération ${i + 1} doit réussir`);
  }

  // 11ème tentative -> 429 Too Many Requests
  const reqBlocked = new Request("http://localhost:3000/api/drivers/status", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "AVAILABLE" }),
  });
  const resBlocked = await updateStatusRoute(reqBlocked);
  assert.strictEqual(resBlocked.status, 429, "La 11ème tentative doit être bloquée avec 429");
  console.log("  ✓ Rate limiting vérifié : 429 reçu après 10 changements");

  // =========================================================================
  // TEST 10 : Journal d'audit DRIVER_STATUS_CHANGED et intégrité de la chaîne
  // =========================================================================
  console.log("\n📜 TEST 10 : Journal d'audit et intégrité cryptographique SHA-256");
  const auditLogs = await prisma.auditLog.findMany({
    where: {
      eventType: "DRIVER_STATUS_CHANGED",
      entityId: driver1.id,
    },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(auditLogs.length >= 10, "Au moins 10 logs DRIVER_STATUS_CHANGED doivent être présents");

  const latestAudit = auditLogs[0];
  assert.strictEqual(latestAudit.entityType, "DRIVER");
  assert.ok(latestAudit.currentHash.length === 64, "Le hash SHA-256 d'audit doit faire 64 caractères");

  const chainResult = await verifyChain();
  assert.strictEqual(chainResult.valid, true, "La chaîne d'audit doit être 100% valide");
  console.log(`  ✓ ${auditLogs.length} logs d'audit DRIVER_STATUS_CHANGED vérifiés, chaîne cryptographique intacte`);

  console.log("\n🎉 TOUS LES TESTS DU STATUT LIVREUR (3 ÉTATS) ONT RÉUSSI AVEC SUCCÈS !\n");
}

if (require.main === module) {
  runTests()
    .catch((err) => {
      console.error("❌ ÉCHEC DES TESTS :", err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export { runTests };

