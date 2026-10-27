/**
 * MotoLink - Suite de tests : "Ma flotte" Vendeur (4 onglets & actions contextuelles)
 * 
 * Vérifie :
 * 1. Modèle Prisma & champs FavoriteDriver (source, priorityMissionsRemaining) et User (phoneVisibleToVendor)
 * 2. GET /api/vendors/fleet?filter=all -> retourne tous les livreurs et les compteurs exacts
 * 3. GET /api/vendors/fleet?filter=available -> filtre uniquement les AVAILABLE
 * 4. GET /api/vendors/fleet?filter=on_mission -> filtre uniquement les ON_MISSION
 * 5. GET /api/vendors/fleet?filter=offline -> filtre uniquement les OFFLINE
 * 6. Recherche insensible à la casse par nom et par téléphone
 * 7. Masquage strict du téléphone si phoneVisibleToVendor === false ("Numéro masqué")
 * 8. Calcul de la note moyenne agrégée sur les 50 dernières notes
 * 9. Notification d'un coursier hors-ligne et bascule isOfflineNotifiable -> false
 * 10. DELETE /api/vendors/fleet/[id] -> retrait de la flotte, création d'AuditLog FLEET_DRIVER_REMOVED, préservation du User
 * 11. Contrôle d'accès strict (403 pour rôle non-vendeur)
 * 12. Intégrité cryptographique de la chaîne d'audit
 */

import assert from "assert";
import prisma from "../prisma";
import { GET as getFleetRoute } from "../../app/api/vendors/fleet/route";
import { resetFleetRateLimit } from "../fleet";
import { DELETE as removeFleetRoute, POST as notifyOfflineRoute } from "../../app/api/vendors/fleet/[id]/route";
import { verifyChain } from "../audit";

async function runTests() {
  console.log("🚀 Exécution de la suite de tests : Ma flotte vendeur (4 onglets)...");

  const ts = Date.now();
  const vendorPhone = `+23769977${ts.toString().slice(-4)}`;
  const driverPhone1 = `+23767771${ts.toString().slice(-4)}`;
  const driverPhone2 = `+23767772${ts.toString().slice(-4)}`;
  const driverPhone3 = `+23767773${ts.toString().slice(-4)}`;
  const driverPhone4 = `+23767774${ts.toString().slice(-4)}`;
  const otherVendorPhone = `+23769988${ts.toString().slice(-4)}`;

  // 1. Vendeur principal
  const vendor = await prisma.user.create({
    data: {
      phone: vendorPhone,
      role: "VENDOR",
      name: "Boutique Flotte Douala",
      shopName: "Quincaillerie Pro Akwa",
      subscriptionStatus: "ACTIVE",
      acceptedCguAt: new Date(),
    },
  });

  // Autre vendeur pour tests d'isolation
  const otherVendor = await prisma.user.create({
    data: {
      phone: otherVendorPhone,
      role: "VENDOR",
      name: "Autre Vendeur",
      shopName: "Autre Boutique",
      subscriptionStatus: "ACTIVE",
    },
  });

  // 2. Livreur 1 : AVAILABLE, KYC complet, 2 notes (5 et 4 -> moyenne 4.5), phoneVisible = true
  const driver1 = await prisma.user.create({
    data: {
      phone: driverPhone1,
      role: "DRIVER",
      name: "Alain Mbida",
      kycStatus: "VERIFIED",
      verified: true,
      driverStatus: "AVAILABLE",
      phoneVisibleToVendor: true,
      subscriptionStatus: "ACTIVE",
    },
  });
  await prisma.kycDocument.createMany({
    data: [
      { userId: driver1.id, type: "ID_CARD", status: "VERIFIED", frontKey: "k1" },
      { userId: driver1.id, type: "SYNDICATE_CARD", status: "VERIFIED", frontKey: "k2" },
    ],
  });

  // 3. Livreur 2 : ON_MISSION, 1 note (score 5), phoneVisible = true
  const driver2 = await prisma.user.create({
    data: {
      phone: driverPhone2,
      role: "DRIVER",
      name: "Boris Kamdem",
      kycStatus: "VERIFIED",
      verified: true,
      driverStatus: "ON_MISSION",
      phoneVisibleToVendor: true,
      subscriptionStatus: "ACTIVE",
    },
  });

  // 4. Livreur 3 : OFFLINE, 0 note, phoneVisible = true
  const driver3 = await prisma.user.create({
    data: {
      phone: driverPhone3,
      role: "DRIVER",
      name: "Cédric Nguemo",
      kycStatus: "VERIFIED",
      verified: true,
      driverStatus: "OFFLINE",
      phoneVisibleToVendor: true,
      subscriptionStatus: "ACTIVE",
    },
  });

  // 5. Livreur 4 : AVAILABLE, phoneVisible = false (doit être masqué)
  const driver4 = await prisma.user.create({
    data: {
      phone: driverPhone4,
      role: "DRIVER",
      name: "David Tchuente",
      kycStatus: "VERIFIED",
      verified: true,
      driverStatus: "AVAILABLE",
      phoneVisibleToVendor: false,
      subscriptionStatus: "ACTIVE",
    },
  });

  // Ajout d'une mission pour générer des ratings valides (missionId obligatoire pour Rating)
  const dummyMission = await prisma.mission.create({
    data: {
      vendorId: vendor.id,
      buyerPhone: "+237655000000",
      address: "Akwa",
      description: "Mission test pour notation",
      price: 2000,
      status: "DELIVERED",
    },
  });

  // Notations
  await prisma.rating.createMany({
    data: [
      { fromUserId: vendor.id, toUserId: driver1.id, missionId: dummyMission.id, score: 5 },
      { fromUserId: vendor.id, toUserId: driver1.id, missionId: dummyMission.id, score: 4 },
      { fromUserId: vendor.id, toUserId: driver2.id, missionId: dummyMission.id, score: 5 },
    ],
  });

  // Association des 4 livreurs à la flotte du vendeur
  const fav1 = await prisma.favoriteDriver.create({
    data: { buyerId: vendor.id, driverId: driver1.id, source: "manual" },
  });
  const fav2 = await prisma.favoriteDriver.create({
    data: { buyerId: vendor.id, driverId: driver2.id, source: "sponsored" },
  });
  const fav3 = await prisma.favoriteDriver.create({
    data: { buyerId: vendor.id, driverId: driver3.id, source: "directory" },
  });
  const fav4 = await prisma.favoriteDriver.create({
    data: { buyerId: vendor.id, driverId: driver4.id, source: "manual" },
  });

  // Mock session vendeur
  (global as any).__mockSession = {
    userId: vendor.id,
    role: "VENDOR",
    phone: vendor.phone,
  };

  resetFleetRateLimit(vendor.id);

  // =========================================================================
  // TEST 1 : GET /api/vendors/fleet?filter=all
  // =========================================================================
  console.log("\n📦 TEST 1 : GET /api/vendors/fleet (filter=all) & compteurs");
  const reqAll = new Request("http://localhost:3000/api/vendors/fleet?filter=all");
  const resAll = await getFleetRoute(reqAll);
  assert.strictEqual(resAll.status, 200);
  const dataAll = await resAll.json();

  assert.strictEqual(dataAll.fleet.length, 4, "La flotte doit contenir 4 livreurs");
  assert.strictEqual(dataAll.counts.all, 4);
  assert.strictEqual(dataAll.counts.available, 2);
  assert.strictEqual(dataAll.counts.on_mission, 1);
  assert.strictEqual(dataAll.counts.offline, 1);
  console.log("  ✓ 4 livreurs récupérés avec compteurs conformes : { all: 4, available: 2, on_mission: 1, offline: 1 }");

  // =========================================================================
  // TEST 2 : GET /api/vendors/fleet?filter=available
  // =========================================================================
  console.log("\n🟢 TEST 2 : Filtrage onglet 'available'");
  const reqAvail = new Request("http://localhost:3000/api/vendors/fleet?filter=available");
  const resAvail = await getFleetRoute(reqAvail);
  assert.strictEqual(resAvail.status, 200);
  const dataAvail = await resAvail.json();
  assert.strictEqual(dataAvail.fleet.length, 2);
  dataAvail.fleet.forEach((d: any) => {
    assert.strictEqual(d.driverStatus, "AVAILABLE");
  });
  console.log("  ✓ Uniquement les livreurs AVAILABLE retournés (2)");

  // =========================================================================
  // TEST 3 : GET /api/vendors/fleet?filter=on_mission
  // =========================================================================
  console.log("\n🟠 TEST 3 : Filtrage onglet 'on_mission'");
  const reqOnMission = new Request("http://localhost:3000/api/vendors/fleet?filter=on_mission");
  const resOnMission = await getFleetRoute(reqOnMission);
  assert.strictEqual(resOnMission.status, 200);
  const dataOnMission = await resOnMission.json();
  assert.strictEqual(dataOnMission.fleet.length, 1);
  assert.strictEqual(dataOnMission.fleet[0].driverStatus, "ON_MISSION");
  assert.strictEqual(dataOnMission.fleet[0].name, "Boris Kamdem");
  console.log("  ✓ Uniquement le livreur ON_MISSION retourné (1)");

  // =========================================================================
  // TEST 4 : GET /api/vendors/fleet?filter=offline
  // =========================================================================
  console.log("\n⚪ TEST 4 : Filtrage onglet 'offline'");
  const reqOffline = new Request("http://localhost:3000/api/vendors/fleet?filter=offline");
  const resOffline = await getFleetRoute(reqOffline);
  assert.strictEqual(resOffline.status, 200);
  const dataOffline = await resOffline.json();
  assert.strictEqual(dataOffline.fleet.length, 1);
  assert.strictEqual(dataOffline.fleet[0].driverStatus, "OFFLINE");
  assert.strictEqual(dataOffline.fleet[0].name, "Cédric Nguemo");
  assert.strictEqual(dataOffline.fleet[0].isOfflineNotifiable, true);
  console.log("  ✓ Uniquement le livreur OFFLINE retourné (1), isOfflineNotifiable = true");

  // =========================================================================
  // TEST 5 : Recherche par nom
  // =========================================================================
  console.log("\n🔍 TEST 5 : Recherche par nom (insensible à la casse)");
  const reqSearchName = new Request("http://localhost:3000/api/vendors/fleet?search=alain");
  const resSearchName = await getFleetRoute(reqSearchName);
  assert.strictEqual(resSearchName.status, 200);
  const dataSearchName = await resSearchName.json();
  assert.strictEqual(dataSearchName.fleet.length, 1);
  assert.strictEqual(dataSearchName.fleet[0].name, "Alain Mbida");
  console.log("  ✓ Recherche par nom réussie");

  // =========================================================================
  // TEST 6 : Recherche par téléphone
  // =========================================================================
  console.log("\n📞 TEST 6 : Recherche par téléphone");
  const reqSearchPhone = new Request(`http://localhost:3000/api/vendors/fleet?search=67772`);
  const resSearchPhone = await getFleetRoute(reqSearchPhone);
  assert.strictEqual(resSearchPhone.status, 200);
  const dataSearchPhone = await resSearchPhone.json();
  assert.strictEqual(dataSearchPhone.fleet.length, 1);
  assert.strictEqual(dataSearchPhone.fleet[0].name, "Boris Kamdem");
  console.log("  ✓ Recherche par téléphone réussie");

  // =========================================================================
  // TEST 7 : Masquage du téléphone si phoneVisibleToVendor === false
  // =========================================================================
  console.log("\n🔒 TEST 7 : Masquage du numéro de téléphone si non consenti");
  const d4Item = dataAll.fleet.find((d: any) => d.name === "David Tchuente");
  assert.ok(d4Item, "David Tchuente doit être dans la liste");
  assert.strictEqual(d4Item.phone, "Numéro masqué");
  assert.strictEqual(d4Item.phoneVisibleToVendor, false);
  assert.strictEqual(d4Item.rawPhone, undefined, "Le rawPhone ne doit jamais fuiter dans la réponse API");
  console.log("  ✓ Numéro masqué affiché, protection stricte de la vie privée");

  // =========================================================================
  // TEST 8 : Calcul agrégé des notes et badges KYC
  // =========================================================================
  console.log("\n⭐ TEST 8 : Calcul de la note agrégée et des badges KYC");
  const d1Item = dataAll.fleet.find((d: any) => d.name === "Alain Mbida");
  assert.ok(d1Item);
  assert.strictEqual(d1Item.rating.average, 4.5, "Moyenne de 5 et 4 doit être 4.5");
  assert.strictEqual(d1Item.rating.count, 2);
  assert.ok(d1Item.badges.includes("id_verified"), "Doit avoir le badge id_verified");
  assert.ok(d1Item.badges.includes("syndicate"), "Doit avoir le badge syndicate");
  console.log("  ✓ Note 4.5 et badges ['id_verified', 'syndicate'] validés");

  // =========================================================================
  // TEST 9 : Notification livreur hors ligne
  // =========================================================================
  console.log("\n🔔 TEST 9 : Demande de disponibilité d'un livreur hors ligne");
  const reqNotify = new Request(`http://localhost:3000/api/vendors/fleet/${fav3.id}`, {
    method: "POST",
  });
  const resNotify = await notifyOfflineRoute(reqNotify, { params: { id: fav3.id } });
  assert.strictEqual(resNotify.status, 200);

  // Vérifier qu'il n'est plus notifiable dans les 24h
  const reqCheckOffline = new Request("http://localhost:3000/api/vendors/fleet?filter=offline");
  const resCheckOffline = await getFleetRoute(reqCheckOffline);
  const dataCheckOffline = await resCheckOffline.json();
  assert.strictEqual(dataCheckOffline.fleet[0].isOfflineNotifiable, false);
  console.log("  ✓ Notification enregistrée, isOfflineNotifiable bascule à false");

  // =========================================================================
  // TEST 10 : DELETE /api/vendors/fleet/[id]
  // =========================================================================
  console.log("\n🗑️ TEST 10 : Retrait de la flotte & AuditLog FLEET_DRIVER_REMOVED");
  const reqDelete = new Request(`http://localhost:3000/api/vendors/fleet/${fav1.id}`, {
    method: "DELETE",
  });
  const resDelete = await removeFleetRoute(reqDelete, { params: { id: fav1.id } });
  assert.strictEqual(resDelete.status, 200);

  // Le lien FavoriteDriver doit avoir disparu
  const deletedFav = await prisma.favoriteDriver.findUnique({ where: { id: fav1.id } });
  assert.strictEqual(deletedFav, null);

  // L'utilisateur livreur doit toujours exister
  const userStillExists = await prisma.user.findUnique({ where: { id: driver1.id } });
  assert.ok(userStillExists, "Le User ne doit JAMAIS être supprimé");

  // Vérification de l'AuditLog
  const auditLogs = await prisma.auditLog.findMany({
    where: {
      eventType: "FLEET_DRIVER_REMOVED",
      entityId: fav1.id,
    },
  });
  assert.strictEqual(auditLogs.length, 1);
  assert.strictEqual(auditLogs[0].actorId, vendor.id);

  const chainResult = await verifyChain();
  assert.strictEqual(chainResult.valid, true, "La chaîne cryptographique doit être 100% intègre");
  console.log("  ✓ Livreur retiré de la flotte, User préservé, AuditLog cryptographique généré");

  // =========================================================================
  // TEST 11 : Sécurité & isolation
  // =========================================================================
  console.log("\n🛡️ TEST 11 : Contrôle d'accès et isolation multi-vendeurs");
  // Tentative par l'autre vendeur de supprimer fav2
  (global as any).__mockSession = {
    userId: otherVendor.id,
    role: "VENDOR",
    phone: otherVendor.phone,
  };
  const reqUnauthorizedDelete = new Request(`http://localhost:3000/api/vendors/fleet/${fav2.id}`, {
    method: "DELETE",
  });
  const resUnauthorizedDelete = await removeFleetRoute(reqUnauthorizedDelete, { params: { id: fav2.id } });
  assert.strictEqual(resUnauthorizedDelete.status, 404, "Un vendeur ne peut pas supprimer le favori d'un autre vendeur");

  // Tentative par un livreur (non vendeur)
  (global as any).__mockSession = {
    userId: driver1.id,
    role: "DRIVER",
    phone: driver1.phone,
  };
  const reqDriverGet = new Request("http://localhost:3000/api/vendors/fleet");
  const resDriverGet = await getFleetRoute(reqDriverGet);
  assert.strictEqual(resDriverGet.status, 403, "Seuls les vendeurs ont accès à /api/vendors/fleet");
  console.log("  ✓ Contrôles d'accès 403 et isolation 404 validés");

  console.log("\n🎉 TOUS LES TESTS DE LA FLOTTE VENDEUR (4 ONGLETS) ONT RÉUSSI !\n");
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

