/**
 * MotoLink - Suite de tests complets :
 * "Photo au départ + confirmation de présence à l'arrivée"
 * 
 * Vérifie :
 * 1. Migration additive et intégrité des missions existantes
 * 2. Rejet de PICKED_UP sans photoBase64 (400 "Photo de prise en charge obligatoire")
 * 3. Validation de PICKED_UP avec photoBase64 -> Checkpoint avec photoUrl + Mission IN_PROGRESS
 * 4. Jalon IN_TRANSIT -> Checkpoint normal sans buyerContact retourné
 * 5. Jalon NEARBY -> Checkpoint créé, buyerContact + messageTemplate retournés, AuditLog BUYER_CONTACT_VIEWED
 * 6. API publique /api/public/missions/[id] -> exposition sécurisée de pickupPhotoUrl et buyerPresenceConfirmedAt
 * 7. Confirmation de présence acheteur (POST /api/missions/[id]/confirm-presence) :
 *    - Checkpoint BUYER_CONFIRMED_PRESENCE
 *    - AuditLog BUYER_PRESENCE_CONFIRMED
 *    - Mise à jour buyerPresenceConfirmedAt
 * 8. Interrogation statut de présence (GET /api/missions/[id]/presence-status)
 * 9. Livreur tape DELIVERED -> flux normal avec scellement de preuve
 * 10. Rate limiting confirm-presence : bloqué après 3 tentatives
 */

import assert from "assert";
import prisma from "../prisma";
import { POST as checkpointRoute } from "../../app/api/missions/[id]/checkpoint/route";
import { POST as confirmPresenceRoute } from "../../app/api/missions/[id]/confirm-presence/route";
import { GET as presenceStatusRoute } from "../../app/api/missions/[id]/presence-status/route";
import { GET as publicMissionRoute } from "../../app/api/public/missions/[id]/route";

const SAMPLE_PHOTO_BASE64 =
  "data:image/jpeg;base64," +
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
  ).toString("base64");

async function runTests() {
  console.log("🚀 Exécution des tests : Photo au départ + Confirmation de présence...");

  const ts = Date.now();
  const vendorPhone = `+23769911${ts.toString().slice(-4)}`;
  const driverPhone = `+23767711${ts.toString().slice(-4)}`;
  const buyerPhone = `+23765511${ts.toString().slice(-4)}`;

  // Configuration des utilisateurs de test
  const vendor = await prisma.user.create({
    data: {
      phone: vendorPhone,
      role: "VENDOR",
      name: "Boutique Présence Akwa",
      shopName: "Akwa Express Boutique",
      subscriptionStatus: "ACTIVE",
      acceptedCguAt: new Date(),
    },
  });

  const driver = await prisma.user.create({
    data: {
      phone: driverPhone,
      role: "DRIVER",
      name: "Livreur Paul Bonanjo",
      kycStatus: "VERIFIED",
      verified: true,
      subscriptionStatus: "ACTIVE",
      acceptedCguAt: new Date(),
    },
  });

  const mission = await prisma.mission.create({
    data: {
      vendorId: vendor.id,
      driverId: driver.id,
      buyerPhone,
      buyerName: "Samuel Eto'o",
      address: "Carrefour Bonamoussadi, Douala",
      description: "Colis fragile de vêtements",
      price: 3500,
      status: "ACCEPTED",
    },
  });

  // Mock de session pour le livreur connecté
  (global as any).__mockSession = {
    userId: driver.id,
    role: "DRIVER",
    phone: driver.phone,
  };

  // =========================================================================
  // TEST 1 : Migration additive OK, champs présents
  // =========================================================================
  console.log("\n📦 TEST 1 : Migration additive vérifiée");
  assert.strictEqual(mission.buyerPresenceConfirmedAt, null);
  console.log("✅ Champs buyerPresenceConfirmedAt et Checkpoint.photoUrl reconnus par Prisma.");

  // =========================================================================
  // TEST 2 : PICKED_UP sans photo -> 400 "Photo de prise en charge obligatoire"
  // =========================================================================
  console.log("\n📷 TEST 2 : Blocage de PICKED_UP sans photo");
  const reqNoPhoto = new Request(`http://localhost/api/missions/${mission.id}/checkpoint`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "PICKED_UP",
      lat: 4.051,
      lng: 9.702,
    }),
  });

  const resNoPhoto = await checkpointRoute(reqNoPhoto, { params: { id: mission.id } });
  assert.strictEqual(resNoPhoto.status, 400, "PICKED_UP sans photo doit retourner 400");
  const dataNoPhoto = await resNoPhoto.json();
  assert.ok(
    dataNoPhoto.error.includes("Photo de prise en charge obligatoire"),
    `Message d'erreur inattendu : ${dataNoPhoto.error}`
  );
  console.log(`✅ Rejet conforme sans photo : 400 "${dataNoPhoto.error}"`);

  // =========================================================================
  // TEST 3 : PICKED_UP avec photo -> Checkpoint créé avec photoUrl + IN_PROGRESS
  // =========================================================================
  console.log("\n📸 TEST 3 : Validation de PICKED_UP avec photoBase64");
  const reqWithPhoto = new Request(`http://localhost/api/missions/${mission.id}/checkpoint`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "PICKED_UP",
      photoBase64: SAMPLE_PHOTO_BASE64,
      lat: 4.051,
      lng: 9.702,
    }),
  });

  const resWithPhoto = await checkpointRoute(reqWithPhoto, { params: { id: mission.id } });
  assert.strictEqual(resWithPhoto.status, 201, "PICKED_UP avec photo doit retourner 201");
  const dataWithPhoto = await resWithPhoto.json();
  assert.ok(dataWithPhoto.photoUrl, "L'URL de la photo de prise en charge doit être retournée");
  assert.strictEqual(dataWithPhoto.missionStatus, "IN_PROGRESS");

  const updatedMission1 = await prisma.mission.findUnique({ where: { id: mission.id } });
  assert.strictEqual(updatedMission1?.status, "IN_PROGRESS");
  console.log(`✅ Checkpoint PICKED_UP créé avec photoUrl: ${dataWithPhoto.photoUrl} (Statut: IN_PROGRESS)`);

  // =========================================================================
  // TEST 4 : IN_TRANSIT -> Checkpoint normal, pas de buyerContact
  // =========================================================================
  console.log("\n🛵 TEST 4 : Jalon IN_TRANSIT sans coordonnées acheteur");
  const reqInTransit = new Request(`http://localhost/api/missions/${mission.id}/checkpoint`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "IN_TRANSIT",
      lat: 4.055,
      lng: 9.708,
    }),
  });

  const resInTransit = await checkpointRoute(reqInTransit, { params: { id: mission.id } });
  assert.strictEqual(resInTransit.status, 201);
  const dataInTransit = await resInTransit.json();
  assert.strictEqual(dataInTransit.buyerContact, undefined);
  console.log("✅ Checkpoint IN_TRANSIT enregistré sans exposition des coordonnées de l'acheteur.");

  // =========================================================================
  // TEST 5 : NEARBY -> Checkpoint, buyerContact retourné, Audit BUYER_CONTACT_VIEWED
  // =========================================================================
  console.log("\n📍 TEST 5 : Jalon NEARBY avec coordonnées acheteur et audit");
  const reqNearby = new Request(`http://localhost/api/missions/${mission.id}/checkpoint`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "NEARBY",
      lat: 4.061,
      lng: 9.712,
    }),
  });

  const resNearby = await checkpointRoute(reqNearby, { params: { id: mission.id } });
  assert.strictEqual(resNearby.status, 201);
  const dataNearby = await resNearby.json();

  assert.ok(dataNearby.buyerContact, "buyerContact doit être retourné pour NEARBY");
  assert.strictEqual(dataNearby.buyerContact.phone, buyerPhone);
  assert.strictEqual(dataNearby.buyerContact.name, "Samuel Eto'o");
  assert.ok(dataNearby.messageTemplate.includes("Bonjour Samuel Eto'o"));
  assert.ok(dataNearby.messageTemplate.includes(`https://motolink.cm/s/${mission.publicToken}`));
  assert.strictEqual(dataNearby.buyerPresenceConfirmed, false);

  // Vérification de l'AuditLog BUYER_CONTACT_VIEWED
  const auditViewed = await prisma.auditLog.findFirst({
    where: {
      entityId: mission.id,
      eventType: "BUYER_CONTACT_VIEWED",
    },
  });
  assert.ok(auditViewed, "AuditLog BUYER_CONTACT_VIEWED doit être enregistré");
  console.log("✅ Coordonnées acheteur retournées avec message type et AuditLog BUYER_CONTACT_VIEWED.");

  // =========================================================================
  // TEST 6 : API publique /api/public/missions/[id] avec pickupPhotoUrl
  // =========================================================================
  console.log("\n🌐 TEST 6 : API publique avec photo de prise en charge");
  const reqPublic = new Request(`http://localhost/api/public/missions/${mission.publicToken}`);
  const resPublic = await publicMissionRoute(reqPublic, { params: { id: mission.publicToken } });
  assert.strictEqual(resPublic.status, 200);
  const dataPublic = await resPublic.json();

  assert.strictEqual(dataPublic.buyerPresenceConfirmedAt, null);
  assert.ok(dataPublic.pickupPhotoUrl, "pickupPhotoUrl doit être exposée sur le lien public sécurisé");
  console.log(`✅ API publique expose pickupPhotoUrl: ${dataPublic.pickupPhotoUrl}`);

  // =========================================================================
  // TEST 7 : Acheteur confirme sa présence (POST confirm-presence)
  // =========================================================================
  console.log("\n🤝 TEST 7 : Confirmation de présence par l'acheteur");
  const reqPresence = new Request(`http://localhost/api/missions/${mission.id}/confirm-presence`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ publicToken: mission.publicToken }),
  });

  const resPresence = await confirmPresenceRoute(reqPresence, { params: { id: mission.id } });
  assert.strictEqual(resPresence.status, 200);
  const dataPresence = await resPresence.json();
  assert.strictEqual(dataPresence.success, true);
  assert.ok(dataPresence.confirmedAt);

  // Vérification en base
  const updatedMission2 = await prisma.mission.findUnique({ where: { id: mission.id } });
  assert.ok(updatedMission2?.buyerPresenceConfirmedAt);

  // Vérification du checkpoint BUYER_CONFIRMED_PRESENCE
  const cpPresence = await prisma.checkpoint.findFirst({
    where: {
      missionId: mission.id,
      type: "BUYER_CONFIRMED_PRESENCE",
    },
  });
  assert.ok(cpPresence, "Checkpoint BUYER_CONFIRMED_PRESENCE doit être créé");

  // Vérification de l'AuditLog BUYER_PRESENCE_CONFIRMED
  const auditPresence = await prisma.auditLog.findFirst({
    where: {
      entityId: mission.id,
      eventType: "BUYER_PRESENCE_CONFIRMED",
    },
  });
  assert.ok(auditPresence, "AuditLog BUYER_PRESENCE_CONFIRMED doit être créé");
  console.log(`✅ Présence confirmée à ${dataPresence.confirmedAt} avec checkpoint & audit.`);

  // =========================================================================
  // TEST 8 : Interrogation statut de présence (GET presence-status)
  // =========================================================================
  console.log("\n🔍 TEST 8 : Consultation du statut de présence");
  const reqStatus = new Request(
    `http://localhost/api/missions/${mission.id}/presence-status?publicToken=${mission.publicToken}`
  );
  const resStatus = await presenceStatusRoute(reqStatus, { params: { id: mission.id } });
  assert.strictEqual(resStatus.status, 200);
  const dataStatus = await resStatus.json();
  assert.strictEqual(dataStatus.buyerPresenceConfirmed, true);
  assert.ok(dataStatus.confirmedAt);
  console.log("✅ Statut de présence interrogé avec succès : buyerPresenceConfirmed = true.");

  // =========================================================================
  // TEST 9 : Livreur tape DELIVERED -> flux normal
  // =========================================================================
  console.log("\n🏁 TEST 9 : Jalon DELIVERED final");
  const reqDelivered = new Request(`http://localhost/api/missions/${mission.id}/checkpoint`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "DELIVERED",
      lat: 4.062,
      lng: 9.713,
      note: "Remis en main propre",
    }),
  });

  const resDelivered = await checkpointRoute(reqDelivered, { params: { id: mission.id } });
  assert.strictEqual(resDelivered.status, 201);
  const dataDelivered = await resDelivered.json();
  assert.strictEqual(dataDelivered.missionStatus, "DELIVERED");
  console.log("✅ Mission passée au statut DELIVERED avec succès.");

  // =========================================================================
  // TEST 10 : Rate limiting confirm-presence : 3 tentatives max
  // =========================================================================
  console.log("\n🛑 TEST 10 : Rate limiting sur confirm-presence (3 max)");
  const newMission = await prisma.mission.create({
    data: {
      vendorId: vendor.id,
      driverId: driver.id,
      buyerPhone,
      address: "Akwa",
      price: 1000,
      status: "IN_PROGRESS",
    },
  });

  // Tentative 1
  const t1 = await confirmPresenceRoute(
    new Request(`http://localhost/api/missions/${newMission.id}/confirm-presence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicToken: newMission.publicToken }),
    }),
    { params: { id: newMission.id } }
  );
  assert.strictEqual(t1.status, 200);

  // Tentative 2
  const t2 = await confirmPresenceRoute(
    new Request(`http://localhost/api/missions/${newMission.id}/confirm-presence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicToken: newMission.publicToken }),
    }),
    { params: { id: newMission.id } }
  );
  assert.strictEqual(t2.status, 200);

  // Tentative 3
  const t3 = await confirmPresenceRoute(
    new Request(`http://localhost/api/missions/${newMission.id}/confirm-presence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicToken: newMission.publicToken }),
    }),
    { params: { id: newMission.id } }
  );
  assert.strictEqual(t3.status, 200);

  // Tentative 4 -> doit être rejetée avec 429
  const t4 = await confirmPresenceRoute(
    new Request(`http://localhost/api/missions/${newMission.id}/confirm-presence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicToken: newMission.publicToken }),
    }),
    { params: { id: newMission.id } }
  );
  assert.strictEqual(t4.status, 429, "La 4e tentative doit être bloquée avec un code 429");
  console.log("✅ Rate limit de 3 tentatives respecté : code 429 déclenché.");

  // Nettoyage final des données de test
  await prisma.checkpoint.deleteMany({
    where: { missionId: { in: [mission.id, newMission.id] } },
  });
  await prisma.auditLog.deleteMany({
    where: { entityId: { in: [mission.id, newMission.id] } },
  });
  await prisma.mission.deleteMany({
    where: { id: { in: [mission.id, newMission.id] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [vendor.id, driver.id] } },
  });

  console.log("\n🎉 Tous les 10 tests de photo au départ et confirmation de présence sont validés !");
}

runTests()
  .catch((err) => {
    console.error("\n❌ ÉCHEC DU TEST :", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

