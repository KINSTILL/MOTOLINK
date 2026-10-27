/**
 * MotoLink - Suite de tests : Notification aux livreurs hors ligne
 * (Rate limit strict 24h par couple vendeur-livreur, Audit & Persistance DB)
 * 
 * Vérifie :
 * 1. Modèle Prisma OfflineNotification créé et indexé
 * 2. Rejet 400 si tentative de notification sur un livreur AVAILABLE
 * 3. Envoi réussi (200) pour un livreur OFFLINE dans la flotte : création OfflineNotification + AuditLog
 * 4. Blocage 429 si re-tentative dans la fenêtre de 24h
 * 5. Rejet 403 si le livreur ne fait pas partie de la flotte du vendeur
 * 6. GET /api/vendors/notify-offline-driver/status?driverId=xxx conforme
 * 7. PATCH /api/vendors/notify-offline-driver/[id] met à jour le statut (delivered, read)
 * 8. Règle anti-contournement : même si le livreur passe AVAILABLE puis OFFLINE dans les 24h, il reste non-notifiable
 * 9. Expiration des 24h : le livreur redevient notifiable une fois le délai écoulé
 * 10. Intégrité cryptographique SHA-256 de la chaîne d'audit
 */

import assert from "assert";
import prisma from "../prisma";
import { POST as notifyRoute } from "../../app/api/vendors/notify-offline-driver/route";
import { GET as getStatusRoute } from "../../app/api/vendors/notify-offline-driver/status/route";
import { PATCH as updateStatusRoute } from "../../app/api/vendors/notify-offline-driver/[id]/route";
import { canNotifyOffline, resetNotifyRateLimit } from "../offline-notification";
import { verifyChain } from "../audit";

async function runTests() {
  console.log("🚀 Exécution de la suite de tests : Notifications livreurs hors-ligne...");

  const ts = Date.now();
  const vendorPhone = `+23769991${ts.toString().slice(-4)}`;
  const driverPhone1 = `+23767791${ts.toString().slice(-4)}`;
  const driverPhone2 = `+23767792${ts.toString().slice(-4)}`;
  const driverPhone3 = `+23767793${ts.toString().slice(-4)}`;

  // Vendeur
  const vendor = await prisma.user.create({
    data: {
      phone: vendorPhone,
      role: "VENDOR",
      name: "Boutique Notif Douala",
      shopName: "Boutique Notif Akwa",
      subscriptionStatus: "ACTIVE",
      acceptedCguAt: new Date(),
    },
  });

  // Livreur 1 : Dans la flotte, OFFLINE
  const driver1 = await prisma.user.create({
    data: {
      phone: driverPhone1,
      role: "DRIVER",
      name: "Livreur Un Offline",
      kycStatus: "VERIFIED",
      verified: true,
      driverStatus: "OFFLINE",
      subscriptionStatus: "ACTIVE",
    },
  });

  // Livreur 2 : Dans la flotte, AVAILABLE
  const driver2 = await prisma.user.create({
    data: {
      phone: driverPhone2,
      role: "DRIVER",
      name: "Livreur Deux Dispo",
      kycStatus: "VERIFIED",
      verified: true,
      driverStatus: "AVAILABLE",
      subscriptionStatus: "ACTIVE",
    },
  });

  // Livreur 3 : Hors de la flotte, OFFLINE
  const driver3 = await prisma.user.create({
    data: {
      phone: driverPhone3,
      role: "DRIVER",
      name: "Livreur Trois Inconnu",
      kycStatus: "VERIFIED",
      verified: true,
      driverStatus: "OFFLINE",
      subscriptionStatus: "ACTIVE",
    },
  });

  // Associer livreur 1 et 2 à la flotte du vendeur
  await prisma.favoriteDriver.createMany({
    data: [
      { buyerId: vendor.id, driverId: driver1.id, source: "manual" },
      { buyerId: vendor.id, driverId: driver2.id, source: "manual" },
    ],
  });

  // Session mock vendeur
  (global as any).__mockSession = {
    userId: vendor.id,
    role: "VENDOR",
    phone: vendor.phone,
  };

  resetNotifyRateLimit(vendor.id);

  // =========================================================================
  // TEST 1 : Vérification de la table Prisma OfflineNotification
  // =========================================================================
  console.log("\n📦 TEST 1 : Schéma Prisma et table OfflineNotification");
  const initialCount = await prisma.offlineNotification.count();
  assert.strictEqual(typeof initialCount, "number");
  console.log("  ✓ Table OfflineNotification opérationnelle");

  // =========================================================================
  // TEST 2 : Tentative sur un livreur AVAILABLE -> 400
  // =========================================================================
  console.log("\n🚫 TEST 2 : Tentative sur livreur AVAILABLE -> 400");
  const reqAvail = new Request("http://localhost:3000/api/vendors/notify-offline-driver", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ driverId: driver2.id, channel: "whatsapp" }),
  });
  const resAvail = await notifyRoute(reqAvail);
  assert.strictEqual(resAvail.status, 400, "Doit renvoyer 400 pour un livreur non hors-ligne");
  const dataAvail = await resAvail.json();
  assert.ok(dataAvail.error.includes("hors ligne"));
  console.log("  ✓ Rejet 400 conforme : 'Le livreur n'est pas hors ligne'");

  // =========================================================================
  // TEST 3 : Envoi réussi (première fois) à un livreur OFFLINE -> 200
  // =========================================================================
  console.log("\n✉️ TEST 3 : Premier envoi à un livreur OFFLINE de la flotte -> 200");
  const reqSuccess = new Request("http://localhost:3000/api/vendors/notify-offline-driver", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ driverId: driver1.id, channel: "whatsapp" }),
  });
  const resSuccess = await notifyRoute(reqSuccess);
  assert.strictEqual(resSuccess.status, 200, "L'envoi doit réussir");
  const dataSuccess = await resSuccess.json();
  assert.strictEqual(dataSuccess.success, true);
  assert.ok(dataSuccess.notificationId);

  // Vérifier enregistrement DB
  const dbNotif = await prisma.offlineNotification.findUnique({
    where: { id: dataSuccess.notificationId },
  });
  assert.ok(dbNotif);
  assert.strictEqual(dbNotif.vendorId, vendor.id);
  assert.strictEqual(dbNotif.driverId, driver1.id);
  assert.strictEqual(dbNotif.channel, "whatsapp");
  assert.strictEqual(dbNotif.status, "sent");

  // Vérifier AuditLog
  const auditLogs = await prisma.auditLog.findMany({
    where: {
      eventType: "OFFLINE_NOTIFICATION_SENT",
      entityId: dataSuccess.notificationId,
    },
  });
  assert.strictEqual(auditLogs.length, 1);
  assert.strictEqual(auditLogs[0].actorId, vendor.id);
  console.log("  ✓ Notification envoyée, OfflineNotification enregistrée, AuditLog généré");

  // =========================================================================
  // TEST 4 : Re-tentative dans les 24h -> 429
  // =========================================================================
  console.log("\n⏱️ TEST 4 : Re-tentative dans les 24h -> 429 Rate limit");
  const reqBlocked = new Request("http://localhost:3000/api/vendors/notify-offline-driver", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ driverId: driver1.id, channel: "sms" }),
  });
  const resBlocked = await notifyRoute(reqBlocked);
  assert.strictEqual(resBlocked.status, 429, "Doit être bloqué à 429 par la règle des 24h");
  const dataBlocked = await resBlocked.json();
  assert.ok(dataBlocked.error.includes("24h"));
  console.log("  ✓ 429 Too Many Requests reçu : 'Déjà notifié dans les 24h'");

  // =========================================================================
  // TEST 5 : Livreur non présent dans la flotte du vendeur -> 403
  // =========================================================================
  console.log("\n🛡️ TEST 5 : Livreur hors flotte -> 403");
  const reqNotFleet = new Request("http://localhost:3000/api/vendors/notify-offline-driver", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ driverId: driver3.id, channel: "whatsapp" }),
  });
  const resNotFleet = await notifyRoute(reqNotFleet);
  assert.strictEqual(resNotFleet.status, 403, "Doit renvoyer 403 pour un livreur hors flotte");
  console.log("  ✓ 403 Forbidden reçu pour coursier non présent dans la flotte");

  // =========================================================================
  // TEST 6 : GET /api/vendors/notify-offline-driver/status
  // =========================================================================
  console.log("\n📊 TEST 6 : Vérification de statut via l'API GET");
  const reqStatusD1 = new Request(`http://localhost:3000/api/vendors/notify-offline-driver/status?driverId=${driver1.id}`);
  const resStatusD1 = await getStatusRoute(reqStatusD1);
  assert.strictEqual(resStatusD1.status, 200);
  const dataStatusD1 = await resStatusD1.json();
  assert.strictEqual(dataStatusD1.canNotify, false);
  assert.ok(dataStatusD1.nextAvailableAt);

  const reqStatusD3 = new Request(`http://localhost:3000/api/vendors/notify-offline-driver/status?driverId=${driver3.id}`);
  const resStatusD3 = await getStatusRoute(reqStatusD3);
  const dataStatusD3 = await resStatusD3.json();
  assert.strictEqual(dataStatusD3.canNotify, true);
  console.log("  ✓ canNotify = false avec nextAvailableAt pour driver1, canNotify = true pour driver3");

  // =========================================================================
  // TEST 7 : PATCH /api/vendors/notify-offline-driver/[id] (webhook provider)
  // =========================================================================
  console.log("\n🔄 TEST 7 : Mise à jour du statut par webhook (delivered/read)");
  const reqPatch = new Request(`http://localhost:3000/api/vendors/notify-offline-driver/${dataSuccess.notificationId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "delivered" }),
  });
  const resPatch = await updateStatusRoute(reqPatch, { params: { id: dataSuccess.notificationId } });
  assert.strictEqual(resPatch.status, 200);
  const updatedNotif = await prisma.offlineNotification.findUnique({
    where: { id: dataSuccess.notificationId },
  });
  assert.strictEqual(updatedNotif?.status, "delivered");
  console.log("  ✓ Statut mis à jour à 'delivered' via PATCH");

  // =========================================================================
  // TEST 8 : Anti-contournement : changement de statut intermédiaire
  // =========================================================================
  console.log("\n🔒 TEST 8 : Anti-contournement (Livreur repasse AVAILABLE puis OFFLINE)");
  await prisma.user.update({
    where: { id: driver1.id },
    data: { driverStatus: "AVAILABLE" },
  });
  await prisma.user.update({
    where: { id: driver1.id },
    data: { driverStatus: "OFFLINE" },
  });

  const checkStillBlocked = await canNotifyOffline(vendor.id, driver1.id);
  assert.strictEqual(checkStillBlocked.canNotify, false, "Le livreur doit rester non-notifiable pendant 24h");
  console.log("  ✓ Persistance du verrou 24h vérifiée même après bascules de statut");

  // =========================================================================
  // TEST 9 : Expiration après 24h -> Redevient notifiable
  // =========================================================================
  console.log("\n⏰ TEST 9 : Fin du délai de 24h -> Redevient notifiable");
  // Vieillir artificiellement la notification de 25h en base
  await prisma.offlineNotification.update({
    where: { id: dataSuccess.notificationId },
    data: {
      createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    },
  });

  const checkExpired = await canNotifyOffline(vendor.id, driver1.id);
  assert.strictEqual(checkExpired.canNotify, true, "Doit redevenir notifiable après 24h");
  console.log("  ✓ canNotify = true validé après 24h");

  // =========================================================================
  // TEST 10 : Intégrité cryptographique SHA-256 de la chaîne d'audit
  // =========================================================================
  console.log("\n📜 TEST 10 : Vérification intégrité chaîne d'audit");
  const chainResult = await verifyChain();
  assert.strictEqual(chainResult.valid, true, "La chaîne d'audit doit être 100% intègre");
  console.log("  ✓ Chaîne d'audit cryptographique intacte");

  console.log("\n🎉 TOUS LES TESTS DE NOTIFICATION LIVREUR HORS-LIGNE ONT RÉUSSI !\n");
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

