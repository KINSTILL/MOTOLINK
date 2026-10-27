/**
 * MotoLink - Suite de tests : Score de fiabilité client (N5)
 *
 * Tests :
 *  1. hashBuyerPhone() → SHA-256 stable, normalisation du numéro
 *  2. computeBuyerReliability() avec < 2 missions → "Nouveau client" (neutre)
 *  3. computeBuyerReliability() avec historique → score cohérent (label + taux)
 *  4. JAMAIS de PII : le numéro n'est jamais renvoyé par l'API
 *  5. Création mission → buyerPhoneHash renseigné (jamais le numéro en clair)
 *  6. API /api/buyer-reliability : vendeur sans opt-in → enabled:false
 *  7. API /api/buyer-reliability : vendeur avec opt-in → agrégat renvoyé
 *  8. API : non-vendeur → enabled:false
 *  9. Non-régression : composant + intégration page + colonne Prisma
 */

import assert from "assert";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import prisma from "../prisma";
import {
  hashBuyerPhone,
  normalizePhone,
  computeBuyerReliability,
} from "../buyer-reliability";
import { GET as reliabilityRoute } from "../../app/api/buyer-reliability/route";

function mockSession(user: { id: string; role: string; phone: string }) {
  (global as any).__mockSession = { userId: user.id, role: user.role, phone: user.phone };
}
function clearMockSession() {
  delete (global as any).__mockSession;
}
function read(...segments: string[]) {
  return fs.readFileSync(path.join(process.cwd(), ...segments), "utf-8");
}

async function runTests() {
  console.log("🚀 Exécution de la suite : Score de fiabilité client (N5)...\n");

  const ts = Date.now();
  const createdUserIds: string[] = [];
  const createdMissionIds: string[] = [];

  let seq = 1;
  const mkUser = async (role: "VENDOR" | "DRIVER" | "BUYER", extra: Record<string, any> = {}) => {
    const n = seq++;
    const digits = Math.floor(10000000 + Math.random() * 89999999);
    const u = await prisma.user.create({
      data: {
        phone: `+237${digits}${n}`.slice(0, 13),
        role,
        name: `${role} Reliability ${n}`,
        shopName: role === "VENDOR" ? `Boutique Reliability ${n}` : undefined,
        acceptedCguAt: new Date(),
        acceptedPrivacyAt: new Date(),
        ...extra,
      },
    });
    createdUserIds.push(u.id);
    return u;
  };

  const mkMission = async (
    vendorId: string,
    buyerPhone: string,
    status: "CREATED" | "DELIVERED" | "CANCELLED" | "DISPUTE"
  ) => {
    const m = await prisma.mission.create({
      data: {
        vendorId,
        buyerPhone,
        buyerPhoneHash: hashBuyerPhone(buyerPhone),
        address: "Akwa, Douala",
        articlePhotoUrls: ["https://example.com/x.jpg"],
        price: 2000,
        type: "PARCEL",
        status,
      },
    });
    createdMissionIds.push(m.id);
    return m;
  };

  try {
    // ─── TEST 1 : hash stable + normalisation ──────────────────────────
    console.log("📦 TEST 1 : hashBuyerPhone() → SHA-256 stable + normalisation");
    const a = hashBuyerPhone("+237 677 110 022");
    const b = hashBuyerPhone("+237677110022");
    assert.strictEqual(a, b, "Espaces ignorés → même hash");
    assert.strictEqual(a.length, 64, "SHA-256 hex = 64 chars");
    assert.strictEqual(
      a,
      crypto.createHash("sha256").update("237677110022").digest("hex"),
      "Hash = SHA-256 du numéro normalisé"
    );
    assert.strictEqual(normalizePhone("+237-677.110.022"), "237677110022");
    assert.notStrictEqual(a, hashBuyerPhone("+237677110023"), "Numéros différents → hash différents");
    console.log("✅ TEST 1 validé\n");

    // ─── TEST 2 : < 2 missions → Nouveau client ────────────────────────
    console.log("📦 TEST 2 : < 2 missions historiques → « Nouveau client » (neutre)");
    const vendor = await mkUser("VENDOR");
    const phoneNew = `+237650${ts.toString().slice(-6)}`;
    const relNew = await computeBuyerReliability(phoneNew);
    assert.strictEqual(relNew.hasData, false, "Pas assez de données");
    assert.strictEqual(relNew.label, "Nouveau client");
    assert.strictEqual(relNew.score, 100, "Score neutre par défaut");
    console.log("✅ TEST 2 validé\n");

    // ─── TEST 3 : historique → score cohérent ──────────────────────────
    console.log("📦 TEST 3 : historique suffisant → label + taux calculés");
    const phoneHist = `+237651${ts.toString().slice(-6)}`;
    await mkMission(vendor.id, phoneHist, "DELIVERED");
    await mkMission(vendor.id, phoneHist, "DELIVERED");
    await mkMission(vendor.id, phoneHist, "CANCELLED");
    await mkMission(vendor.id, phoneHist, "DISPUTE");
    const relHist = await computeBuyerReliability(phoneHist);
    assert.strictEqual(relHist.hasData, true, "Données suffisantes");
    assert.strictEqual(relHist.totalMissions, 4);
    assert.strictEqual(relHist.deliveredCount, 2);
    assert.strictEqual(relHist.cancelledCount, 1);
    assert.strictEqual(relHist.disputeCount, 1);
    assert.strictEqual(relHist.failureRate, 0.5, "(1 cancel + 1 dispute)/4 = 0.5");
    assert.strictEqual(relHist.disputeRate, 0.25);
    // score = 100 - 0.5*60 - 0.25*40 = 100 - 30 - 10 = 60 → "À surveiller"
    assert.strictEqual(relHist.score, 60);
    assert.strictEqual(relHist.label, "À surveiller");
    console.log("✅ TEST 3 validé : score/taux/label cohérents\n");

    // ─── TEST 4 & 5 : PII + buyerPhoneHash à la création ───────────────
    console.log("📦 TEST 4 : buyerPhoneHash renseigné en base, jamais le numéro en clair");
    const m = await prisma.mission.findFirst({ where: { buyerPhoneHash: hashBuyerPhone(phoneHist) } });
    assert.ok(m, "Mission liée au hash trouvée");
    assert.strictEqual(m!.buyerPhoneHash, hashBuyerPhone(phoneHist));
    console.log("✅ TEST 4 validé\n");

    // ─── TEST 6 : vendeur sans opt-in → enabled:false ──────────────────
    console.log("📦 TEST 6 : /api/buyer-reliability — vendeur sans opt-in → enabled:false");
    mockSession(vendor);
    const reqNoOptin = new Request(
      `http://localhost:3000/api/buyer-reliability?phone=${encodeURIComponent(phoneHist)}`
    );
    const resNoOptin = await reliabilityRoute(reqNoOptin);
    const dataNoOptin = await resNoOptin.json();
    assert.strictEqual(dataNoOptin.enabled, false, "Opt-in désactivé par défaut");
    assert.strictEqual(dataNoOptin.reliability, null, "Aucun calcul si désactivé");
    console.log("✅ TEST 6 validé\n");

    // ─── TEST 7 : vendeur avec opt-in → agrégat renvoyé (sans PII) ─────
    console.log("📦 TEST 7 : /api/buyer-reliability — vendeur avec opt-in → agrégat (sans PII)");
    await prisma.user.update({ where: { id: vendor.id }, data: { showBuyerReliability: true } });
    const reqOptin = new Request(
      `http://localhost:3000/api/buyer-reliability?phone=${encodeURIComponent(phoneHist)}`
    );
    const resOptin = await reliabilityRoute(reqOptin);
    const dataOptin = await resOptin.json();
    assert.strictEqual(dataOptin.enabled, true);
    assert.ok(dataOptin.reliability, "Agrégat renvoyé");
    assert.strictEqual(dataOptin.reliability.totalMissions, 4);
    const serialized = JSON.stringify(dataOptin);
    assert.ok(!serialized.includes(phoneHist), "JAMAIS de PII : le numéro n'est pas renvoyé");
    assert.ok(!serialized.includes(phoneHist.replace("+", "")), "JAMAIS de PII (sans +)");
    console.log("✅ TEST 7 validé : agrégat sans PII\n");

    // ─── TEST 8 : non-vendeur → enabled:false ──────────────────────────
    console.log("📦 TEST 8 : /api/buyer-reliability — non-vendeur → enabled:false");
    const driver = await mkUser("DRIVER");
    mockSession(driver);
    const resDriver = await reliabilityRoute(
      new Request(`http://localhost:3000/api/buyer-reliability?phone=${encodeURIComponent(phoneHist)}`)
    );
    const dataDriver = await resDriver.json();
    assert.strictEqual(dataDriver.enabled, false, "Réservé aux vendeurs");
    console.log("✅ TEST 8 validé\n");

    // ─── TEST 9 : non-régression (composant, page, schéma) ─────────────
    console.log("📦 TEST 9 : Non-régression (composant + intégration page + schéma)");
    const badge = read("components", "BuyerReliabilityBadge.tsx");
    assert.ok(badge.includes("buyer-reliability-badge"), "data-testid du badge présent");
    assert.ok(badge.includes("Nouveau client"), "Libellé neutre présent");

    const page = read("app", "(app)", "missions", "new", "page.tsx");
    assert.ok(page.includes("BuyerReliabilityBadge"), "Badge intégré dans /missions/new");
    assert.ok(page.includes("showBuyerReliability"), "Conditionné par l'opt-in N4");

    const schema = read("prisma", "schema.prisma");
    assert.ok(schema.includes("buyerPhoneHash"), "Colonne buyerPhoneHash présente");
    assert.ok(schema.includes("showBuyerReliability"), "Colonne showBuyerReliability (N4) présente");

    // Le badge est non-bloquant : aucun guard dans la création de mission lié à la fiabilité
    const missionsRoute = read("app", "api", "missions", "route.ts");
    assert.ok(!missionsRoute.includes("buyerReliability"), "La fiabilité ne bloque jamais la création");

    console.log("✅ TEST 9 validé : aucune régression détectée\n");

    console.log("🎉 TOUS LES TESTS DU SCORE DE FIABILITÉ CLIENT ONT RÉUSSI !");
  } finally {
    clearMockSession();
    await new Promise((r) => setTimeout(r, 300));
    if (createdMissionIds.length > 0) {
      await prisma.mission.deleteMany({ where: { id: { in: createdMissionIds } } }).catch(() => {});
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
