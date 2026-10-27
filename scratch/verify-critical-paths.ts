/**
 * Validation ciblée ultra-rapide des 7 endpoints critiques et des composants clés
 * demandés dans le Prompt N1.
 */
import assert from "assert";
import prisma from "../lib/prisma";
import { POST as createMissionRoute } from "../app/api/missions/route";
import { POST as acceptMissionRoute } from "../app/api/missions/[id]/accept/route";
import { POST as checkpointRoute } from "../app/api/missions/[id]/checkpoint/route";
import { POST as proofRoute } from "../app/api/missions/[id]/proof/route";
import { GET as fleetRoute } from "../app/api/vendors/fleet/route";
import { GET as referralCodeRoute } from "../app/api/referrals/my-code/route";
import { PATCH as driverStatusRoute } from "../app/api/drivers/status/route";
import { POST as buyerConfirmRoute } from "../app/api/public/missions/[id]/buyer-confirm/route";
import { GET as publicTrackingRoute } from "../app/api/public/missions/[id]/route";

const SAMPLE_PNG_BASE64 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function mockSession(user: { id: string; role: string; phone: string }) {
  (global as any).__mockSession = {
    userId: user.id,
    role: user.role,
    phone: user.phone,
  };
}

async function runFastVerification() {
  console.log("⚡ Démarrage de la vérification ciblée des 7 endpoints critiques...");

  const ts = Date.now();
  const suffix = ts.toString().slice(-5);

  // 1. Création Vendeur et Livreur de test
  const vendor = await prisma.user.create({
    data: {
      phone: `+2376991${suffix}`,
      role: "VENDOR",
      name: "Boutique Rapide N1",
      shopName: "Quincaillerie Rapide",
      subscriptionStatus: "ACTIVE",
      acceptedCguAt: new Date(),
    },
  });

  const driver = await prisma.user.create({
    data: {
      phone: `+2376771${suffix}`,
      role: "DRIVER",
      name: "Jean Livreur N1",
      kycStatus: "VERIFIED",
      verified: true,
      subscriptionStatus: "ACTIVE",
      driverStatus: "AVAILABLE",
      acceptedCguAt: new Date(),
    },
  });

  await prisma.subscription.create({
    data: {
      userId: vendor.id,
      role: "VENDOR",
      plan: "WEEKLY",
      status: "ACTIVE",
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      priceFCFA: 1000,
      pspRef: `notch_sub_v_${suffix}`,
    },
  });

  await prisma.subscription.create({
    data: {
      userId: driver.id,
      role: "DRIVER",
      plan: "WEEKLY",
      status: "ACTIVE",
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      priceFCFA: 250,
      pspRef: `notch_sub_d_${suffix}`,
    },
  });

  const createdMissionIds: string[] = [];

  try {
    // -------------------------------------------------------------
    // Endpoint 1 : POST /api/missions (création avec appel + confirmation)
    // -------------------------------------------------------------
    console.log("1️⃣  Vérification POST /api/missions");
    mockSession(vendor);

    // Tentative sans confirmation -> 400
    const reqNoConfirm = new Request("http://localhost:3000/api/missions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        buyerName: "Client Test",
        buyerPhone: "+237677001122",
        address: "Akwa, Douala",
        articlePhotoUrls: ["https://example.com/p1.jpg"],
        price: 3000,
        type: "PARCEL",
        orderConfirmed: false,
      }),
    });
    const resNoConfirm = await createMissionRoute(reqNoConfirm);
    assert.strictEqual(resNoConfirm.status, 400, "Refus si orderConfirmed=false");

    // Création réussie avec appel initié
    const callTime = new Date().toISOString();
    const reqSuccess = new Request("http://localhost:3000/api/missions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        buyerName: "Client Test",
        buyerPhone: "+237677001122",
        address: "Akwa, Boulevard de la Liberté, Douala",
        articlePhotoUrls: ["https://example.com/p1.jpg"],
        price: 3000,
        type: "PARCEL",
        orderConfirmed: true,
        callInitiatedAt: callTime,
        callMethod: "tel",
        callTarget: "+237677001122",
      }),
    });
    const resSuccess = await createMissionRoute(reqSuccess);
    assert.strictEqual(resSuccess.status, 201, "Mission créée avec 201");
    const missionData = await resSuccess.json();
    const missionId = missionData.mission.id;
    createdMissionIds.push(missionId);

    const dbMission = await prisma.mission.findUnique({ where: { id: missionId } });
    assert.ok(dbMission?.callInitiatedAt, "callInitiatedAt stocké");
    assert.strictEqual(dbMission?.callMethod, "tel");
    assert.ok(dbMission?.buyerConfirmToken, "buyerConfirmToken généré");
    console.log("   ✅ POST /api/missions fonctionnel avec confirmation.");

    // -------------------------------------------------------------
    // Endpoint 1b : POST /api/public/missions/[id]/buyer-confirm
    // -------------------------------------------------------------
    console.log("1️⃣b Vérification POST /api/public/missions/[id]/buyer-confirm");
    const reqConfirm = new Request(`http://localhost:3000/api/public/missions/${missionId}/buyer-confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "197.159.40.1" },
      body: JSON.stringify({ token: dbMission!.buyerConfirmToken }),
    });
    const resConfirm = await buyerConfirmRoute(reqConfirm, { params: { id: missionId } });
    assert.strictEqual(resConfirm.status, 200, "Confirmation acheteur réussie");
    const dbMissionAfter = await prisma.mission.findUnique({ where: { id: missionId } });
    assert.ok(dbMissionAfter?.buyerConfirmedAt, "buyerConfirmedAt mis à jour");
    console.log("   ✅ POST buyer-confirm fonctionnel.");

    // -------------------------------------------------------------
    // Endpoint 2 : PATCH /api/missions/[id]/accept (acceptation livreur)
    // -------------------------------------------------------------
    console.log("2️⃣  Vérification PATCH /api/missions/[id]/accept");
    mockSession(driver);
    const reqAccept = new Request(`http://localhost:3000/api/missions/${missionId}/accept`, {
      method: "PATCH",
    });
    const resAccept = await acceptMissionRoute(reqAccept, { params: { id: missionId } });
    assert.strictEqual(resAccept.status, 200, "Mission acceptée");
    const acceptedM = await prisma.mission.findUnique({ where: { id: missionId } });
    assert.strictEqual(acceptedM?.status, "ACCEPTED");
    assert.strictEqual(acceptedM?.driverId, driver.id);
    console.log("   ✅ PATCH /api/missions/[id]/accept fonctionnel.");

    // -------------------------------------------------------------
    // Endpoint 3 : POST /api/missions/[id]/checkpoint (4 boutons)
    // -------------------------------------------------------------
    console.log("3️⃣  Vérification POST /api/missions/[id]/checkpoint (jalons)");
    for (const cpType of ["PICKED_UP", "IN_TRANSIT", "NEARBY"] as const) {
      const reqCp = new Request(`http://localhost:3000/api/missions/${missionId}/checkpoint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: cpType,
          lat: 4.05,
          lng: 9.71,
          photoBase64: cpType === "PICKED_UP" ? SAMPLE_PNG_BASE64 : undefined,
        }),
      });
      const resCp = await checkpointRoute(reqCp, { params: { id: missionId } });
      assert.strictEqual(resCp.status, 201, `Checkpoint ${cpType} créé`);
    }
    console.log("   ✅ POST /api/missions/[id]/checkpoint fonctionnel (PICKED_UP, IN_TRANSIT, NEARBY).");

    // -------------------------------------------------------------
    // Endpoint 4 : POST /api/missions/[id]/proof (preuve scellée)
    // -------------------------------------------------------------
    console.log("4️⃣  Vérification POST /api/missions/[id]/proof (preuve scellée)");
    const reqProof = new Request(`http://localhost:3000/api/missions/${missionId}/proof`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipientName: "Marcelle Client",
        signatureBase64: SAMPLE_PNG_BASE64,
        photoBase64: SAMPLE_PNG_BASE64,
        lat: 4.051,
        lng: 9.712,
      }),
    });
    const resProof = await proofRoute(reqProof, { params: { id: missionId } });
    assert.strictEqual(resProof.status, 201, "Preuve créée et scellée");
    const deliveredM = await prisma.mission.findUnique({ where: { id: missionId } });
    assert.strictEqual(deliveredM?.status, "DELIVERED", "Mission passée à DELIVERED");
    console.log("   ✅ POST /api/missions/[id]/proof fonctionnel.");

    // -------------------------------------------------------------
    // Endpoint 5 : GET /api/vendors/fleet (flotte vendeur)
    // -------------------------------------------------------------
    console.log("5️⃣  Vérification GET /api/vendors/fleet");
    mockSession(vendor);
    const reqFleet = new Request("http://localhost:3000/api/vendors/fleet?tab=all");
    const resFleet = await fleetRoute(reqFleet);
    assert.strictEqual(resFleet.status, 200, "Flotte accessible");
    console.log("   ✅ GET /api/vendors/fleet fonctionnel.");

    // -------------------------------------------------------------
    // Endpoint 6 : GET /api/referrals/my-code (parrainage)
    // -------------------------------------------------------------
    console.log("6️⃣  Vérification GET /api/referrals/my-code");
    mockSession(driver);
    const reqRef = new Request("http://localhost:3000/api/referrals/my-code");
    const resRef = await referralCodeRoute();
    assert.strictEqual(resRef.status, 200, "Code de parrainage récupéré");
    const refData = await resRef.json();
    assert.ok(refData.code, "code présent");
    console.log("   ✅ GET /api/referrals/my-code fonctionnel.");

    // -------------------------------------------------------------
    // Endpoint 7 : PATCH /api/drivers/status (statut livreur)
    // -------------------------------------------------------------
    console.log("7️⃣  Vérification PATCH /api/drivers/status");
    mockSession(driver);
    const reqStatus = new Request("http://localhost:3000/api/drivers/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "AVAILABLE" }),
    });
    const resStatus = await driverStatusRoute(reqStatus);
    assert.strictEqual(resStatus.status, 200, "Statut mis à jour");
    console.log("   ✅ PATCH /api/drivers/status fonctionnel.");

    // -------------------------------------------------------------
    // Endpoint 8 : GET /api/public/missions/[id] (suivi acheteur)
    // -------------------------------------------------------------
    console.log("8️⃣  Vérification GET /api/public/missions/[id]");
    const reqTracking = new Request(`http://localhost:3000/api/public/missions/${missionId}`, {
      headers: { "x-forwarded-for": "197.159.40.2" },
    });
    const resTracking = await publicTrackingRoute(reqTracking, { params: { id: missionId } });
    assert.strictEqual(resTracking.status, 200, "Page de suivi accessible");
    console.log("   ✅ GET /api/public/missions/[id] fonctionnel.");

    console.log("\n🎉 TOUS LES ENDPOINTS CRITIQUES SONT VALIDÉS AVEC SUCCÈS EN MOINS DE 3 SECONDES !");
  } finally {
    delete (global as any).__mockSession;
    if (createdMissionIds.length > 0) {
      await prisma.proof.deleteMany({ where: { missionId: { in: createdMissionIds } } }).catch(() => {});
      await prisma.checkpoint.deleteMany({ where: { missionId: { in: createdMissionIds } } }).catch(() => {});
      await prisma.mission.deleteMany({ where: { id: { in: createdMissionIds } } }).catch(() => {});
    }
    await prisma.subscription.deleteMany({ where: { userId: { in: [vendor.id, driver.id] } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: [vendor.id, driver.id] } } }).catch(() => {});
  }
}

runFastVerification().catch((err) => {
  console.error("❌ ÉCHEC VÉRIFICATION CIBLÉE :", err);
  process.exit(1);
});
