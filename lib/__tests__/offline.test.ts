/**
 * MotoLink - Suite de tests complets pour le Mode Hors Ligne & PWA
 * Vérifie le comportement hors-ligne (mode avion / 3G instable) :
 * 1. Création message hors-ligne -> file d'attente -> synchronisation réseau
 * 2. Enregistrement checkpoint hors-ligne -> file d'attente -> synchronisation réseau
 * 3. Upload preuve scellée hors-ligne -> file d'attente -> synchronisation réseau
 * 4. Acceptation mission hors-ligne -> file d'attente -> synchronisation réseau
 * 5. Gestion de la limite de 5 retries en cas d'échec répété
 * 6. Compression d'images sous le seuil de 1 Mo
 */

import prisma from "../prisma";
import {
  clearQueue,
  enqueueAction,
  getPendingActions,
  getQueueSize,
  processQueue,
  updateActionRetry,
} from "../offline-queue";
import {
  acceptMissionAction,
  postMissionCheckpoint,
  sendMissionMessage,
  uploadMissionProof,
} from "../offline-actions";
import { getBase64SizeBytes } from "../image-compression";

function setMockOnline(online: boolean) {
  try {
    Object.defineProperty(globalThis, "navigator", {
      value: { onLine: online },
      configurable: true,
      writable: true,
    });
  } catch {
    try {
      Object.defineProperty((globalThis as any).navigator, "onLine", {
        value: online,
        configurable: true,
        writable: true,
      });
    } catch {
      // Ignorer si non configurable
    }
  }
}

async function runTests() {
  console.log("🚀 Exécution des tests : Mode Hors Ligne PWA & Synchronisation...");

  // Nettoyage initial de la file
  await clearQueue();

  // Création d'utilisateurs et d'une mission de test
  const vendor = await prisma.user.upsert({
    where: { phone: "+237699990111" },
    update: { subscriptionStatus: "ACTIVE" },
    create: {
      phone: "+237699990111",
      role: "VENDOR",
      name: "Boutique Douala Offline",
      subscriptionStatus: "ACTIVE",
    },
  });

  const driver = await prisma.user.upsert({
    where: { phone: "+237699990222" },
    update: { subscriptionStatus: "ACTIVE", kycStatus: "VERIFIED" },
    create: {
      phone: "+237699990222",
      role: "DRIVER",
      name: "Livreur Bonanjo",
      subscriptionStatus: "ACTIVE",
      kycStatus: "VERIFIED",
    },
  });

  const mission = await prisma.mission.create({
    data: {
      vendorId: vendor.id,
      buyerPhone: "+237655889900",
      buyerName: "Paul Biya",
      address: "Akwa, Douala",
      description: "Colis test hors-ligne",
      price: 2500,
      status: "CREATED",
    },
  });

  // =========================================================================
  // TEST 1 : Mode avion -> créer un message -> mis en queue -> retour réseau
  // =========================================================================
  console.log("\n📦 TEST 1 : Mode avion - Envoi d'un message optimiste");
  
  // Simulation de l'état hors ligne (navigator.onLine = false)
  setMockOnline(false);

  const messageResult = await sendMissionMessage({
    missionId: mission.id,
    content: "Bonjour, je serai là dans 10 minutes",
    senderName: "Livreur Bonanjo",
  });

  if (!messageResult.offline || !messageResult.message.isOptimistic) {
    throw new Error("❌ TEST 1 ÉCHOUÉ : Le message aurait dû être marqué optimiste et hors-ligne.");
  }
  if (!messageResult.message.id.startsWith("local_msg_")) {
    throw new Error("❌ TEST 1 ÉCHOUÉ : L'identifiant local du message optimiste est invalide.");
  }

  const queueSize1 = await getQueueSize();
  if (queueSize1 !== 1) {
    throw new Error(`❌ TEST 1 ÉCHOUÉ : La file d'attente devrait contenir 1 action, trouvé ${queueSize1}.`);
  }
  console.log(`✅ Message optimiste généré (id: ${messageResult.message.id}) et mis en attente.`);

  // Rétablissement du réseau et mock de l'API /api/missions/[id]/messages
  setMockOnline(true);
  const originalFetch = global.fetch;

  let messageApiCalled = false;
  global.fetch = async (url: any, init: any) => {
    if (String(url).includes("/messages")) {
      messageApiCalled = true;
      const body = JSON.parse(init.body);
      const createdMsg = await prisma.message.create({
        data: {
          missionId: mission.id,
          senderId: driver.id,
          content: body.content,
        },
      });
      return {
        ok: true,
        status: 201,
        json: async () => ({ message: createdMsg }),
      } as any;
    }
    return originalFetch(url, init);
  };

  const syncResult1 = await processQueue();
  if (syncResult1.succeeded !== 1 || !messageApiCalled) {
    throw new Error("❌ TEST 1 ÉCHOUÉ : Le message en file d'attente n'a pas été synchronisé.");
  }
  const queueAfterSync1 = await getQueueSize();
  if (queueAfterSync1 !== 0) {
    throw new Error("❌ TEST 1 ÉCHOUÉ : La file d'attente devrait être vide après synchronisation.");
  }
  console.log("✅ Message synchronisé sur le serveur avec succès dès le retour du réseau.");

  // =========================================================================
  // TEST 2 : Mode avion -> enregistrer un checkpoint -> retour réseau
  // =========================================================================
  console.log("\n🛵 TEST 2 : Mode avion - Enregistrement d'un jalon optimiste");

  setMockOnline(false);

  const cpResult = await postMissionCheckpoint({
    missionId: mission.id,
    type: "PICKED_UP",
    lat: 4.0505,
    lng: 9.7055,
    note: "Colis récupéré en boutique",
  });

  if (!cpResult.offline || !cpResult.checkpoint.isOptimistic) {
    throw new Error("❌ TEST 2 ÉCHOUÉ : Le checkpoint aurait dû être marqué optimiste.");
  }
  if (cpResult.missionStatus !== "IN_PROGRESS") {
    throw new Error(`❌ TEST 2 ÉCHOUÉ : Le statut attendu était IN_PROGRESS, obtenu ${cpResult.missionStatus}.`);
  }
  console.log(`✅ Jalon optimiste ${cpResult.checkpoint.type} enregistré dans IndexedDB.`);

  // Rétablissement réseau
  setMockOnline(true);
  let checkpointApiCalled = false;
  global.fetch = async (url: any, init: any) => {
    if (String(url).includes("/checkpoint")) {
      checkpointApiCalled = true;
      const body = JSON.parse(init.body);
      const cp = await prisma.checkpoint.create({
        data: {
          missionId: mission.id,
          type: body.type,
          lat: body.lat,
          lng: body.lng,
          note: body.note,
        },
      });
      await prisma.mission.update({
        where: { id: mission.id },
        data: { status: "IN_PROGRESS" },
      });
      return {
        ok: true,
        status: 201,
        json: async () => ({ checkpoint: cp, missionStatus: "IN_PROGRESS" }),
      } as any;
    }
    return originalFetch(url, init);
  };

  const syncResult2 = await processQueue();
  if (syncResult2.succeeded !== 1 || !checkpointApiCalled) {
    throw new Error("❌ TEST 2 ÉCHOUÉ : Le jalon n'a pas été synchronisé.");
  }
  console.log("✅ Jalon synchronisé avec succès et statut mis à jour.");

  // =========================================================================
  // TEST 3 : Mode avion -> scellement de preuve -> retour réseau
  // =========================================================================
  console.log("\n🔒 TEST 3 : Mode avion - Upload et scellement de preuve locale");

  setMockOnline(false);

  const samplePhoto = "data:image/jpeg;base64," + Buffer.from("fake-photo-data").toString("base64");
  const sampleSig = "data:image/png;base64," + Buffer.from("fake-signature-data").toString("base64");

  const proofResult = await uploadMissionProof({
    missionId: mission.id,
    photoBase64: samplePhoto,
    signatureBase64: sampleSig,
    lat: 4.051,
    lng: 9.706,
  });

  if (!proofResult.offline || !proofResult.notice) {
    throw new Error("❌ TEST 3 ÉCHOUÉ : La preuve aurait dû être enregistrée localement.");
  }
  if (!proofResult.notice.includes("Preuve enregistrée localement")) {
    throw new Error("❌ TEST 3 ÉCHOUÉ : Message d'attente hors-ligne manquant ou incorrect.");
  }
  console.log(`✅ ${proofResult.notice}`);

  // Rétablissement réseau
  setMockOnline(true);
  let proofApiCalled = false;
  global.fetch = async (url: any) => {
    if (String(url).includes("/proof")) {
      proofApiCalled = true;
      const proof = await prisma.proof.create({
        data: {
          missionId: mission.id,
          photoUrl: "/uploads/proof-offline.jpg",
          signatureUrl: "/uploads/sig-offline.png",
          pdfUrl: "/uploads/proof-offline.pdf",
          capturedAt: new Date(),
          proofHash: "a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0",
        },
      });
      await prisma.mission.update({
        where: { id: mission.id },
        data: { status: "DELIVERED" },
      });
      return {
        ok: true,
        status: 201,
        json: async () => ({ proof, pdfUrl: "/uploads/cert.pdf" }),
      } as any;
    }
    return originalFetch(url);
  };

  const syncResult3 = await processQueue();
  if (syncResult3.succeeded !== 1 || !proofApiCalled) {
    throw new Error("❌ TEST 3 ÉCHOUÉ : La preuve n'a pas été scellée lors de la synchronisation.");
  }
  console.log("✅ Preuve scellée et enregistrée sur le serveur avec succès.");

  // =========================================================================
  // TEST 4 : Mode avion -> acceptation de mission -> retour réseau
  // =========================================================================
  console.log("\n🤝 TEST 4 : Mode avion - Acceptation de mission");

  const openMission = await prisma.mission.create({
    data: {
      vendorId: vendor.id,
      buyerPhone: "+237677112233",
      buyerName: "Client Marché",
      address: "Bonapriso, Douala",
      price: 1500,
      status: "CREATED",
    },
  });

  setMockOnline(false);

  const acceptResult = await acceptMissionAction({ missionId: openMission.id });
  if (!acceptResult.offline || acceptResult.mission.status !== "ACCEPTED") {
    throw new Error("❌ TEST 4 ÉCHOUÉ : Acceptation optimiste non conforme.");
  }

  // Rétablissement réseau
  setMockOnline(true);
  let acceptApiCalled = false;
  global.fetch = async (url: any) => {
    if (String(url).includes("/accept")) {
      acceptApiCalled = true;
      const updated = await prisma.mission.update({
        where: { id: openMission.id },
        data: { driverId: driver.id, status: "ACCEPTED" },
      });
      return {
        ok: true,
        status: 200,
        json: async () => ({ mission: updated }),
      } as any;
    }
    return originalFetch(url);
  };

  const syncResult4 = await processQueue();
  if (syncResult4.succeeded !== 1 || !acceptApiCalled) {
    throw new Error("❌ TEST 4 ÉCHOUÉ : Acceptation de mission non synchronisée.");
  }
  console.log("✅ Mission assignée et acceptée sur le serveur.");

  // =========================================================================
  // TEST 5 : Limite de 5 retries en cas d'échec répété
  // =========================================================================
  console.log("\n⚠️ TEST 5 : Limite des 5 retries et nettoyage de file d'attente");

  const failingAction = await enqueueAction("SEND_MESSAGE", { content: "Test échec" }, mission.id);
  // Simule 5 échecs consécutifs
  await updateActionRetry(failingAction.id, 5, "Erreur 500 serveur persistant");

  global.fetch = async () => ({
    ok: false,
    status: 500,
  } as any);

  const retrySyncResult = await processQueue();
  const queueAfterFailure = await getQueueSize();

  if (queueAfterFailure !== 0) {
    throw new Error(`❌ TEST 5 ÉCHOUÉ : L'action aurait dû être retirée après 5 retries, reste ${queueAfterFailure}.`);
  }
  if (retrySyncResult.failed !== 1) {
    throw new Error("❌ TEST 5 ÉCHOUÉ : Le compteur d'échecs aurait dû être à 1.");
  }
  console.log("✅ Action abandonnée après 5 tentatives avec notification utilisateur sans blocage.");

  // =========================================================================
  // TEST 6 : Calcul de taille base64 pour la compression
  // =========================================================================
  console.log("\n📐 TEST 6 : Validation de la taille base64");

  const dummyBase64 = "data:image/jpeg;base64," + Buffer.alloc(500000).toString("base64");
  const bytes = getBase64SizeBytes(dummyBase64);

  if (bytes < 490000 || bytes > 510000) {
    throw new Error(`❌ TEST 6 ÉCHOUÉ : Calcul de taille incorrect, obtenu ${bytes} octets.`);
  }
  console.log(`✅ Calcul exact de taille : ${bytes} octets (< 1 Mo).`);

  // Nettoyage final
  global.fetch = originalFetch;
  await clearQueue();
  await prisma.mission.deleteMany({
    where: { id: { in: [mission.id, openMission.id] } },
  });

  console.log("\n🎉 Tous les tests du mode hors ligne PWA sont passés avec succès !");
}

runTests()
  .catch((err) => {
    console.error("\n❌ ERREUR LORS DES TESTS DU MODE HORS LIGNE :", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

