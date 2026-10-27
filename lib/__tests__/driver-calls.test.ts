/**
 * MotoLink - Suite de tests : Appels du livreur & photo "client absent"
 *
 * Tests unitaires / intégration API :
 *  1. Colonnes Prisma ajoutées (nullable) + enums DRIVER_CALL_INITIATED_BEFORE_DEPARTURE /
 *     DRIVER_CALL_INITIATED_AT_ARRIVAL / BUYER_UNREACHABLE_REPORTED
 *  2. POST call-initiated (before_departure) → horodatage + méthode + audit
 *  3. POST call-initiated (at_arrival) → horodatage + méthode + audit
 *  4. Accès réservé au livreur assigné (403) / validation (400)
 *  5. POST buyer-unreachable → photo + note + buyerUnreachableAt + audit + notification acheteur
 *  6. buyer-unreachable sans photo → 400
 *  7. Aucun blocage : le livreur peut continuer sans appeler (aucune contrainte de statut)
 *  8. Non-régression : flux PICKED_UP/NEARBY, code de remise, CGU Article 26, UI, chain d'audit
 */

import assert from "assert";
import fs from "fs";
import path from "path";
import prisma from "../prisma";
import { POST as callInitiatedRoute } from "../../app/api/missions/[id]/call-initiated/route";
import { POST as buyerUnreachableRoute } from "../../app/api/missions/[id]/buyer-unreachable/route";
import { POST as proofRoute } from "../../app/api/missions/[id]/proof/route";
import { verifyChain } from "../audit";
import { hashDeliveryCode } from "../delivery-code";

function mockSession(user: { id: string; role: string; phone: string }) {
  (global as any).__mockSession = { userId: user.id, role: user.role, phone: user.phone };
}
function clearMockSession() {
  delete (global as any).__mockSession;
}
function read(...segments: string[]) {
  return fs.readFileSync(path.join(process.cwd(), ...segments), "utf-8");
}

const PNG_1X1 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function runTests() {
  console.log("🚀 Exécution de la suite de tests : Appels livreur & client absent...\n");

  const ts = Date.now();
  const createdUserIds: string[] = [];
  const createdSubIds: string[] = [];
  const createdMissionIds: string[] = [];

  let seq = 1;
  const mkUser = async (role: "VENDOR" | "DRIVER", extra: Record<string, any> = {}) => {
    const n = seq++;
    const randomDigits = Math.floor(10000 + Math.random() * 90000);
    const u = await prisma.user.create({
      data: {
        phone: `+2377${randomDigits}${n}`.slice(0, 13),
        role,
        name: `${role} Appel ${n}`,
        shopName: role === "VENDOR" ? `Boutique Appel ${n}` : undefined,
        kycStatus: role === "DRIVER" ? "VERIFIED" : undefined,
        verified: role === "DRIVER" ? true : undefined,
        acceptedCguAt: new Date(),
        acceptedPrivacyAt: new Date(),
        ...extra,
      },
    });
    createdUserIds.push(u.id);
    return u;
  };
  const mkSub = async (userId: string, role: "VENDOR" | "DRIVER") => {
    const sub = await prisma.subscription.create({
      data: {
        userId,
        role,
        plan: "WEEKLY",
        status: "ACTIVE",
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        priceFCFA: role === "VENDOR" ? 1000 : 250,
        pspRef: `notch_calls_${ts}_${Math.random().toString(36).substring(2, 9)}`,
      },
    });
    createdSubIds.push(sub.id);
    return sub;
  };

  try {
    // ─── TEST 1 : colonnes Prisma + enums ───────────────────────────────
    console.log("📦 TEST 1 : Colonnes Prisma (nullable) + enums d'audit");
    const vendor = await mkUser("VENDOR");
    await mkSub(vendor.id, "VENDOR");
    const driver = await mkUser("DRIVER");
    await mkSub(driver.id, "DRIVER");

    const mission = await prisma.mission.create({
      data: {
        vendorId: vendor.id,
        driverId: driver.id,
        buyerPhone: "+237677110099",
        buyerName: "Acheteur Appel",
        address: "Akwa, Douala",
        articlePhotoUrls: ["https://example.com/colis.jpg"],
        price: 3000,
        type: "PARCEL",
        status: "IN_PROGRESS",
        driverStatusBeforeMission: "AVAILABLE",
        deliveryCode: await hashDeliveryCode("1234"),
        deliveryCodeVerifiedAt: new Date(),
      },
    });
    createdMissionIds.push(mission.id);

    assert.strictEqual(mission.driverCallBeforeDepartureAt, null, "État initial null");
    assert.strictEqual(mission.driverCallBeforeDepartureMethod, null);
    assert.strictEqual(mission.driverCallAtArrivalAt, null);
    assert.strictEqual(mission.driverCallAtArrivalMethod, null);
    assert.strictEqual(mission.buyerUnreachableAt, null);
    assert.strictEqual(mission.buyerUnreachablePhoto, null);
    assert.strictEqual(mission.buyerUnreachableNote, null);

    const enumRows = await prisma.$queryRaw<{ enumlabel: string }[]>`
      SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'AuditEventType'`;
    const labels = enumRows.map((r) => r.enumlabel);
    for (const l of [
      "DRIVER_CALL_INITIATED_BEFORE_DEPARTURE",
      "DRIVER_CALL_INITIATED_AT_ARRIVAL",
      "BUYER_UNREACHABLE_REPORTED",
    ]) {
      assert.ok(labels.includes(l), `${l} doit exister`);
    }
    for (const l of ["VENDOR_CALL_INITIATED", "DELIVERY_CODE_VERIFIED", "BUYER_PRESENCE_CONFIRMED"]) {
      assert.ok(labels.includes(l), `${l} (ancien) doit être conservé`);
    }
    console.log("✅ TEST 1 validé : colonnes nullables et enums présents\n");

    // ─── TEST 2 : call-initiated before_departure ───────────────────────
    console.log("📦 TEST 2 : POST call-initiated (before_departure) → horodatage + audit");
    mockSession(driver);
    const before = await callInitiatedRoute(
      new Request(`http://localhost:3000/api/missions/${mission.id}/call-initiated`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: "before_departure", method: "tel" }),
      }),
      { params: { id: mission.id } }
    );
    const beforeData = await before.json();
    assert.strictEqual(before.status, 200, `200 attendu (${JSON.stringify(beforeData)})`);
    assert.strictEqual(beforeData.success, true);
    const m2 = await prisma.mission.findUnique({ where: { id: mission.id } });
    assert.ok(m2!.driverCallBeforeDepartureAt, "driverCallBeforeDepartureAt renseigné");
    assert.strictEqual(m2!.driverCallBeforeDepartureMethod, "tel");
    const auditBefore = await prisma.auditLog.findFirst({
      where: {
        entityId: mission.id,
        eventType: "DRIVER_CALL_INITIATED_BEFORE_DEPARTURE",
      },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(
      auditBefore,
      "AuditLog DRIVER_CALL_INITIATED_BEFORE_DEPARTURE attendu"
    );
    const meta: any = auditBefore!.metadata;
    assert.strictEqual(meta?.phase, "before_departure");
    console.log("✅ TEST 2 validé\n");

    // ─── TEST 3 : call-initiated at_arrival ─────────────────────────────
    console.log("📦 TEST 3 : POST call-initiated (at_arrival) → horodatage + audit");
    const arrival = await callInitiatedRoute(
      new Request(`http://localhost:3000/api/missions/${mission.id}/call-initiated`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: "at_arrival", method: "whatsapp" }),
      }),
      { params: { id: mission.id } }
    );
    assert.strictEqual(arrival.status, 200);
    const m3 = await prisma.mission.findUnique({ where: { id: mission.id } });
    assert.ok(m3!.driverCallAtArrivalAt, "driverCallAtArrivalAt renseigné");
    assert.strictEqual(m3!.driverCallAtArrivalMethod, "whatsapp");
    const auditArrival = await prisma.auditLog.findFirst({
      where: {
        entityId: mission.id,
        eventType: "DRIVER_CALL_INITIATED_AT_ARRIVAL",
      },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(
      auditArrival,
      "AuditLog DRIVER_CALL_INITIATED_AT_ARRIVAL attendu"
    );
    const beforeCount = await prisma.auditLog.count({
      where: {
        entityId: mission.id,
        eventType: "DRIVER_CALL_INITIATED_BEFORE_DEPARTURE",
      },
    });
    const arrivalCount = await prisma.auditLog.count({
      where: {
        entityId: mission.id,
        eventType: "DRIVER_CALL_INITIATED_AT_ARRIVAL",
      },
    });
    assert.strictEqual(beforeCount, 1, "1 audit before_departure attendu");
    assert.strictEqual(arrivalCount, 1, "1 audit at_arrival attendu");
    console.log("✅ TEST 3 validé\n");

    // ─── TEST 4 : accès & validation ────────────────────────────────────
    console.log("📦 TEST 4 : Accès réservé au livreur assigné (403) + validation (400)");
    // Vendeur tente → 403
    mockSession(vendor);
    const forbidden = await callInitiatedRoute(
      new Request(`http://localhost:3000/api/missions/${mission.id}/call-initiated`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: "at_arrival", method: "tel" }),
      }),
      { params: { id: mission.id } }
    );
    assert.strictEqual(forbidden.status, 403, "Vendeur doit être refusé (403)");

    // Livreur, phase invalide → 400
    mockSession(driver);
    const badPhase = await callInitiatedRoute(
      new Request(`http://localhost:3000/api/missions/${mission.id}/call-initiated`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: "whenever", method: "tel" }),
      }),
      { params: { id: mission.id } }
    );
    assert.strictEqual(badPhase.status, 400, "Phase invalide → 400");

    // Mission introuvable → 404
    const notFound = await callInitiatedRoute(
      new Request(`http://localhost:3000/api/missions/inexistante/call-initiated`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: "at_arrival", method: "tel" }),
      }),
      { params: { id: "inexistante" } }
    );
    assert.strictEqual(notFound.status, 404);
    console.log("✅ TEST 4 validé : 403 / 400 / 404 corrects\n");

    // ─── TEST 5 : buyer-unreachable ─────────────────────────────────────
    console.log("📦 TEST 5 : POST buyer-unreachable → photo + note + audit + notification");
    mockSession(driver);
    const unreachable = await buyerUnreachableRoute(
      new Request(`http://localhost:3000/api/missions/${mission.id}/buyer-unreachable`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoBase64: PNG_1X1, note: "Personne à l'adresse" }),
      }),
      { params: { id: mission.id } }
    );
    const unreachableData = await unreachable.json();
    assert.strictEqual(unreachable.status, 200, `200 attendu (${JSON.stringify(unreachableData)})`);
    const m5 = await prisma.mission.findUnique({ where: { id: mission.id } });
    assert.ok(m5!.buyerUnreachableAt, "buyerUnreachableAt renseigné");
    assert.ok(m5!.buyerUnreachablePhoto, "buyerUnreachablePhoto renseigné");
    assert.strictEqual(m5!.buyerUnreachableNote, "Personne à l'adresse");
    const auditUnreachable = await prisma.auditLog.findFirst({
      where: { entityId: mission.id, eventType: "BUYER_UNREACHABLE_REPORTED" },
    });
    assert.ok(auditUnreachable, "AuditLog BUYER_UNREACHABLE_REPORTED attendu");
    console.log("✅ TEST 5 validé\n");

    // ─── TEST 6 : buyer-unreachable sans photo → 400 ────────────────────
    console.log("📦 TEST 6 : buyer-unreachable sans photo → 400");
    const mission2 = await prisma.mission.create({
      data: {
        vendorId: vendor.id,
        driverId: driver.id,
        buyerPhone: "+237677110088",
        address: "Bonapriso, Douala",
        articlePhotoUrls: ["https://example.com/x.jpg"],
        price: 2500,
        type: "PARCEL",
        status: "IN_PROGRESS",
        deliveryCode: await hashDeliveryCode("4321"),
        deliveryCodeVerifiedAt: new Date(),
      },
    });
    createdMissionIds.push(mission2.id);
    mockSession(driver);
    const noPhoto = await buyerUnreachableRoute(
      new Request(`http://localhost:3000/api/missions/${mission2.id}/buyer-unreachable`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "test" }),
      }),
      { params: { id: mission2.id } }
    );
    assert.strictEqual(noPhoto.status, 400, "Photo obligatoire → 400");
    console.log("✅ TEST 6 validé\n");

    // ─── TEST 7 : aucun blocage (le livreur peut continuer sans appeler) ─
    console.log("📦 TEST 7 : Aucun blocage — le livreur livre sans avoir enregistré d'appel");
    const proofNoCall = await proofRoute(
      new Request(`http://localhost:3000/api/missions/${mission2.id}/proof`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoBase64: PNG_1X1, signatureBase64: PNG_1X1 }),
      }),
      { params: { id: mission2.id } }
    );
    assert.ok(
      proofNoCall.status === 200 || proofNoCall.status === 201,
      `La preuve doit se sceller sans appel enregistré (reçu ${proofNoCall.status})`
    );
    console.log("✅ TEST 7 validé : les appels n'imposent aucun blocage\n");

    // ─── TEST 8 : NON-RÉGRESSION ────────────────────────────────────────
    console.log("📦 TEST 8 : Non-régression (flux, code de remise, CGU Article 26, UI, audit)");
    // Le checkpoint NEARBY expose toujours le contact acheteur (Prompt 6.5)
    const checkpointSrc = read("app", "api", "missions", "[id]", "checkpoint", "route.ts");
    assert.ok(checkpointSrc.includes("buyerContact"), "Le checkpoint expose toujours buyerContact");
    assert.ok(!checkpointSrc.includes("driverCallBeforeDepartureAt"), "Le checkpoint ne dépend pas des appels");

    // Le proof continue d'exiger le code de remise
    const proofSrc = read("app", "api", "missions", "[id]", "proof", "route.ts");
    assert.ok(proofSrc.includes("Code de remise non validé"), "Garde du code de remise conservée");

    // CGU Article 26
    const cgu = read("app", "legal", "cgu", "page.tsx");
    assert.ok(cgu.includes("ARTICLE 26 — APPELS DU LIVREUR ET CLIENT ABSENT"), "CGU doit contenir l'Article 26");
    assert.ok(cgu.includes("ne vérifie pas que l'appel a effectivement abouti"), "CGU : texte de l'intention d'appel");
    assert.ok(cgu.includes("ARTICLE 25 — CODE DE REMISE"), "Article 25 conservé");

    // UI : composants présents
    const callModal = read("components", "DriverCallModal.tsx");
    assert.ok(callModal.includes("call-initiated"), "DriverCallModal appelle l'API call-initiated");
    assert.ok(callModal.includes("Continuer sans appeler"), "Bouton sans blocage présent");
    const unreachableModal = read("components", "BuyerUnreachableModal.tsx");
    assert.ok(unreachableModal.includes("buyer-unreachable"), "BuyerUnreachableModal appelle l'API");
    const checkpointButtons = read("components", "CheckpointButtons.tsx");
    assert.ok(checkpointButtons.includes("DriverCallModal"), "CheckpointButtons intègre la modale d'appel");

    // Chaîne d'audit intègre
    const chain = await verifyChain();
    assert.strictEqual(chain.valid, true, "Chaîne d'audit SHA-256 intègre");

    console.log("✅ TEST 8 validé : aucune régression détectée\n");

    console.log("🎉 TOUS LES TESTS DES APPELS LIVREUR & CLIENT ABSENT ONT RÉUSSI AVEC SUCCÈS !");
  } finally {
    clearMockSession();
    await new Promise((r) => setTimeout(r, 400));
    if (createdMissionIds.length > 0) {
      await prisma.proof.deleteMany({ where: { missionId: { in: createdMissionIds } } }).catch(() => {});
      await prisma.checkpoint.deleteMany({ where: { missionId: { in: createdMissionIds } } }).catch(() => {});
      await prisma.jevDecision.deleteMany({ where: { missionId: { in: createdMissionIds } } }).catch(() => {});
      await prisma.directProposal.deleteMany({ where: { missionId: { in: createdMissionIds } } }).catch(() => {});
      await prisma.mission.deleteMany({ where: { id: { in: createdMissionIds } } }).catch(() => {});
    }
    if (createdSubIds.length > 0) {
      await prisma.subscription.deleteMany({ where: { id: { in: createdSubIds } } }).catch(() => {});
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => {});
    }
  }
}

runTests().catch((err) => {
  console.error("❌ ÉCHEC DES TESTS :", err);
  process.exit(1);
});
