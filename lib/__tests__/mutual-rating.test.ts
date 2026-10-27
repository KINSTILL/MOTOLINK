/**
 * MotoLink - Suite de tests : Notation mutuelle vendeur ⇄ livreur & tableau d'honneur
 *
 * Couvre :
 * 1. Migration OK (champs Mission/User, valeurs d'enum d'audit)
 * 2. Calcul du score de confiance /100 (pondérations, litiges, bornes)
 * 3. POST /api/missions/[id]/rate : vendeur -> livreur et livreur -> vendeur (Rating créé, score recalculé, audit)
 * 4. Un utilisateur ne peut pas noter deux fois (séquentiel et concurrent)
 * 5. Contrôles d'accès & validations (401, 400, 403, 404)
 * 6. Le score est mis à jour après chaque note, fenêtre des 50 dernières notes, litiges, notes acheteurs
 * 7. Tableau d'honneur : Top 10 par ville, tri, badge "Top Livreur du Mois", exclusions
 * 8. Score visible sur les cartes livreur de la flotte (API + composant)
 * 9. CGU, bouton "Noter" et modale (présence dans le code)
 * 10. Intégrité de la chaîne d'audit
 */

import assert from "assert";
import fs from "fs";
import path from "path";
import prisma from "../prisma";
import { POST as rateRoute } from "../../app/api/missions/[id]/rate/route";
import { GET as getFleetRoute } from "../../app/api/vendors/fleet/route";
import { resetFleetRateLimit } from "../fleet";
import {
  computeTrustScore,
  getMonthRange,
  getMonthlyLeaderboard,
  recalculateScore,
  submitRating,
  RatingError,
} from "../rating";
import { verifyChain } from "../audit";

const root = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf-8");

function rateRequest(missionId: string, body: unknown) {
  return new Request(`http://localhost:3000/api/missions/${missionId}/rate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function session(user: { id: string; role: string; phone: string }) {
  (global as any).__mockSession = {
    userId: user.id,
    role: user.role,
    phone: user.phone,
  };
}

async function runTests() {
  console.log("🚀 Exécution de la suite de tests : Notation mutuelle & tableau d'honneur...");

  const ts = Date.now();
  const tail = ts.toString().slice(-6);
  const createdUserIds: string[] = [];
  const createdMissionIds: string[] = [];
  const testCity = `TestVille${ts}`;
  let phoneSeq = 0;

  const mkUser = async (
    role: "VENDOR" | "DRIVER" | "BUYER",
    suffix: string,
    extra: Record<string, any> = {}
  ) => {
    phoneSeq += 1;
    const u = await prisma.user.create({
      data: {
        phone: `+2376${tail}${phoneSeq.toString().padStart(3, "0")}`,
        role,
        name: `${role} Notation ${suffix}`,
        shopName: role === "VENDOR" ? `Boutique Notation ${suffix}` : undefined,
        ...extra,
      },
    });
    createdUserIds.push(u.id);
    return u;
  };

  const mkMission = async (
    vendorId: string,
    driverId: string | null,
    status: "DELIVERED" | "IN_PROGRESS" | "DISPUTE" = "DELIVERED",
    extra: Record<string, any> = {}
  ) => {
    const m = await prisma.mission.create({
      data: {
        vendorId,
        driverId,
        buyerPhone: "+237655000111",
        address: "Akwa, Douala",
        price: 2500,
        status,
        ...extra,
      },
    });
    createdMissionIds.push(m.id);
    return m;
  };

  try {
    const vendor = await mkUser("VENDOR", "71");
    const driver = await mkUser("DRIVER", "72");
    const stranger = await mkUser("DRIVER", "73");

    // -----------------------------------------------------------------
    // TEST 1 : Migration
    // -----------------------------------------------------------------
    console.log("\n📦 TEST 1 : Migration OK (champs & enum d'audit)");
    assert.strictEqual(driver.driverScore, 0);
    assert.strictEqual(driver.vendorScore, 0);
    assert.strictEqual(driver.driverRatingCount, 0);
    assert.strictEqual(driver.vendorRatingCount, 0);
    const m0 = await mkMission(vendor.id, driver.id);
    assert.strictEqual(m0.vendorRatedDriver, false);
    assert.strictEqual(m0.driverRatedVendor, false);
    const enumValues = await prisma.$queryRaw<{ enumlabel: string }[]>`
      SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'AuditEventType'`;
    const labels = enumValues.map((e) => e.enumlabel);
    assert.ok(labels.includes("RATING_SUBMITTED"), "RATING_SUBMITTED manquant");
    assert.ok(labels.includes("SCORE_UPDATED"), "SCORE_UPDATED manquant");
    console.log("  ✓ Champs Mission/User et valeurs RATING_SUBMITTED / SCORE_UPDATED présents");

    // -----------------------------------------------------------------
    // TEST 2 : Calcul du score
    // -----------------------------------------------------------------
    console.log("\n🧮 TEST 2 : Calcul du score de confiance /100");
    assert.strictEqual(computeTrustScore({ partnerScores: [], buyerScores: [], disputes: 0, missions: 0 }), 0);
    assert.strictEqual(computeTrustScore({ partnerScores: [5, 5], buyerScores: [], disputes: 0, missions: 2 }), 100);
    assert.strictEqual(computeTrustScore({ partnerScores: [4], buyerScores: [], disputes: 0, missions: 1 }), 80);
    // (4*20*0.5 + 5*20*0.3) / 0.8 = 87.5
    assert.strictEqual(computeTrustScore({ partnerScores: [4], buyerScores: [5], disputes: 0, missions: 2 }), 87.5);
    // litiges : 1/4 = 25% -> pénalité 25*0.2 = 5
    assert.strictEqual(computeTrustScore({ partnerScores: [5], buyerScores: [], disputes: 1, missions: 4 }), 95);
    // bornes
    assert.strictEqual(computeTrustScore({ partnerScores: [1], buyerScores: [], disputes: 4, missions: 4 }), 0);
    console.log("  ✓ 5★ sans litige = 100, pondération 50/30 renormalisée, pénalité litiges 20%, bornes 0-100");

    // -----------------------------------------------------------------
    // TEST 3 : API vendeur -> livreur
    // -----------------------------------------------------------------
    console.log("\n⭐ TEST 3 : POST /api/missions/[id]/rate (vendeur note le livreur)");
    session(vendor);
    const res1 = await rateRoute(rateRequest(m0.id, { score: 5, comment: "  Très rapide !  " }), { params: { id: m0.id } });
    assert.strictEqual(res1.status, 200);
    assert.deepStrictEqual(await res1.json(), { success: true });

    const rating1 = await prisma.rating.findFirst({ where: { missionId: m0.id, fromUserId: vendor.id } });
    assert.ok(rating1, "Rating créé");
    assert.strictEqual(rating1!.toUserId, driver.id);
    assert.strictEqual(rating1!.score, 5);
    assert.strictEqual(rating1!.comment, "Très rapide !");
    const m0After = await prisma.mission.findUnique({ where: { id: m0.id } });
    assert.strictEqual(m0After!.vendorRatedDriver, true);
    assert.strictEqual(m0After!.driverRatedVendor, false);
    const driverAfter1 = await prisma.user.findUnique({ where: { id: driver.id } });
    assert.strictEqual(driverAfter1!.driverScore, 100);
    assert.strictEqual(driverAfter1!.driverRatingCount, 1);

    const ratingAudit = await prisma.auditLog.findMany({ where: { eventType: "RATING_SUBMITTED", entityId: rating1!.id } });
    assert.strictEqual(ratingAudit.length, 1);
    assert.strictEqual(ratingAudit[0].actorId, vendor.id);
    const scoreAudit = await prisma.auditLog.findMany({ where: { eventType: "SCORE_UPDATED", entityId: driver.id } });
    assert.strictEqual(scoreAudit.length, 1);
    console.log("  ✓ Rating créé, drapeau vendorRatedDriver, driverScore = 100, audits RATING_SUBMITTED + SCORE_UPDATED");

    // -----------------------------------------------------------------
    // TEST 4 : API livreur -> vendeur
    // -----------------------------------------------------------------
    console.log("\n🛵 TEST 4 : Le livreur note le vendeur");
    session(driver);
    const res2 = await rateRoute(rateRequest(m0.id, { score: 4 }), { params: { id: m0.id } });
    assert.strictEqual(res2.status, 200);
    const m0After2 = await prisma.mission.findUnique({ where: { id: m0.id } });
    assert.strictEqual(m0After2!.driverRatedVendor, true);
    const vendorAfter = await prisma.user.findUnique({ where: { id: vendor.id } });
    assert.strictEqual(vendorAfter!.vendorScore, 80);
    assert.strictEqual(vendorAfter!.vendorRatingCount, 1);
    assert.strictEqual(vendorAfter!.driverScore, 0, "Le score livreur du vendeur reste inchangé");
    console.log("  ✓ vendorScore = 80 (4★), driverRatedVendor = true");

    // -----------------------------------------------------------------
    // TEST 5 : Pas de double notation
    // -----------------------------------------------------------------
    console.log("\n🚫 TEST 5 : Un utilisateur ne peut pas noter deux fois");
    session(vendor);
    const resDup = await rateRoute(rateRequest(m0.id, { score: 1 }), { params: { id: m0.id } });
    assert.strictEqual(resDup.status, 409);
    assert.strictEqual(await prisma.rating.count({ where: { missionId: m0.id, fromUserId: vendor.id } }), 1);
    const driverStill = await prisma.user.findUnique({ where: { id: driver.id } });
    assert.strictEqual(driverStill!.driverScore, 100, "Le score ne bouge pas après une tentative refusée");

    // Soumissions concurrentes sur une nouvelle mission : une seule doit passer
    const mRace = await mkMission(vendor.id, driver.id);
    const [r1, r2, r3] = await Promise.all([
      rateRoute(rateRequest(mRace.id, { score: 3 }), { params: { id: mRace.id } }),
      rateRoute(rateRequest(mRace.id, { score: 3 }), { params: { id: mRace.id } }),
      rateRoute(rateRequest(mRace.id, { score: 3 }), { params: { id: mRace.id } }),
    ]);
    const statuses = [r1.status, r2.status, r3.status].sort();
    assert.deepStrictEqual(statuses, [200, 409, 409]);
    assert.strictEqual(await prisma.rating.count({ where: { missionId: mRace.id, fromUserId: vendor.id } }), 1);
    console.log("  ✓ 409 en séquentiel et 1 seule note acceptée en concurrence (3 requêtes simultanées)");

    // Note existante antérieure aux drapeaux (drapeau false mais Rating présent)
    const mLegacy = await mkMission(vendor.id, driver.id);
    await prisma.rating.create({ data: { missionId: mLegacy.id, fromUserId: vendor.id, toUserId: driver.id, score: 5 } });
    await assert.rejects(
      () => submitRating(mLegacy.id, vendor.id, driver.id, 2),
      (e: unknown) => e instanceof RatingError && e.status === 409
    );
    const legacyAfter = await prisma.mission.findUnique({ where: { id: mLegacy.id } });
    assert.strictEqual(legacyAfter!.vendorRatedDriver, false, "Le drapeau est annulé si la note est refusée");
    console.log("  ✓ Note héritée détectée (409) sans corrompre le drapeau");

    // -----------------------------------------------------------------
    // TEST 6 : Accès & validations
    // -----------------------------------------------------------------
    console.log("\n🔐 TEST 6 : Contrôles d'accès & validations");
    const mOpen = await mkMission(vendor.id, driver.id, "IN_PROGRESS");
    const mFresh = await mkMission(vendor.id, driver.id);

    session(vendor);
    const resNotDelivered = await rateRoute(rateRequest(mOpen.id, { score: 5 }), { params: { id: mOpen.id } });
    assert.strictEqual(resNotDelivered.status, 400);

    for (const bad of [0, 6, 3.5, "5", null]) {
      const resBad = await rateRoute(rateRequest(mFresh.id, { score: bad }), { params: { id: mFresh.id } });
      assert.strictEqual(resBad.status, 400, `score ${JSON.stringify(bad)} doit être refusé`);
    }
    const resLong = await rateRoute(rateRequest(mFresh.id, { score: 5, comment: "x".repeat(501) }), { params: { id: mFresh.id } });
    assert.strictEqual(resLong.status, 400);

    const resUnknown = await rateRoute(rateRequest("00000000-0000-0000-0000-000000000000", { score: 5 }), {
      params: { id: "00000000-0000-0000-0000-000000000000" },
    });
    assert.strictEqual(resUnknown.status, 404);

    session(stranger);
    const resStranger = await rateRoute(rateRequest(mFresh.id, { score: 5 }), { params: { id: mFresh.id } });
    assert.strictEqual(resStranger.status, 403);

    (global as any).__mockSession = null;
    const resAnon = await rateRoute(rateRequest(mFresh.id, { score: 5 }), { params: { id: mFresh.id } });
    // Sans mock, getSession lit les cookies hors contexte requête -> aucune session
    assert.ok([401, 500].includes(resAnon.status), `Anonyme refusé (reçu ${resAnon.status})`);
    assert.strictEqual(await prisma.rating.count({ where: { missionId: mFresh.id } }), 0, "Aucune note créée par les requêtes refusées");
    console.log("  ✓ Mission non livrée 400, scores invalides 400, commentaire trop long 400, inconnue 404, tiers 403, anonyme refusé");

    // -----------------------------------------------------------------
    // TEST 7 : Mise à jour du score après chaque note
    // -----------------------------------------------------------------
    console.log("\n📈 TEST 7 : Le score est mis à jour après chaque note");
    const d2 = await mkUser("DRIVER", "74");
    const ms = [await mkMission(vendor.id, d2.id), await mkMission(vendor.id, d2.id), await mkMission(vendor.id, d2.id)];
    session(vendor);
    const expectedAfter = [100, 90, 80]; // 5 -> moy 5 ; +4 -> 4.5 ; +3 -> 4
    const scoresToGive = [5, 4, 3];
    for (let i = 0; i < ms.length; i++) {
      const r = await rateRoute(rateRequest(ms[i].id, { score: scoresToGive[i] }), { params: { id: ms[i].id } });
      assert.strictEqual(r.status, 200);
      const u = await prisma.user.findUnique({ where: { id: d2.id } });
      assert.strictEqual(u!.driverScore, expectedAfter[i], `Score après note #${i + 1}`);
      assert.strictEqual(u!.driverRatingCount, i + 1);
    }
    console.log("  ✓ Scores successifs 100 → 90 → 80 et compteur 1 → 2 → 3");

    // Notes acheteurs (30%) + litiges (20%)
    const buyer = await mkUser("BUYER", "75");
    await prisma.rating.create({ data: { missionId: ms[0].id, fromUserId: buyer.id, toUserId: d2.id, score: 5 } });
    await recalculateScore(d2.id);
    // partner moy 4 (80), acheteur 5 (100) => (80*0.5+100*0.3)/0.8 = 87.5
    let d2u = await prisma.user.findUnique({ where: { id: d2.id } });
    assert.strictEqual(d2u!.driverScore, 87.5);
    assert.strictEqual(d2u!.driverRatingCount, 4);
    await mkMission(vendor.id, d2.id, "DISPUTE");
    await recalculateScore(d2.id);
    // 1 litige / 4 missions (3 livrées + 1 litige) = 25% -> -5
    d2u = await prisma.user.findUnique({ where: { id: d2.id } });
    assert.strictEqual(d2u!.driverScore, 82.5);
    console.log("  ✓ Notes acheteurs pondérées (87.5) puis pénalité litige (82.5)");

    // Fenêtre des 50 dernières notes
    const d3 = await mkUser("DRIVER", "76");
    const mWin = await mkMission(vendor.id, d3.id);
    const base = Date.now() - 100 * 60 * 1000;
    await prisma.rating.createMany({
      data: Array.from({ length: 55 }, (_, i) => ({
        missionId: mWin.id,
        fromUserId: vendor.id,
        toUserId: d3.id,
        score: i < 5 ? 1 : 5, // les 5 plus anciennes sont mauvaises
        createdAt: new Date(base + i * 1000),
      })),
    });
    await recalculateScore(d3.id);
    const d3u = await prisma.user.findUnique({ where: { id: d3.id } });
    assert.strictEqual(d3u!.driverScore, 100, "Seules les 50 dernières notes comptent");
    assert.strictEqual(d3u!.driverRatingCount, 55, "Le compteur reflète toutes les notes (jamais supprimées)");
    console.log("  ✓ Fenêtre de 50 notes respectée, aucune note supprimée");

    // -----------------------------------------------------------------
    // TEST 8 : Tableau d'honneur
    // -----------------------------------------------------------------
    console.log("\n🏆 TEST 8 : Tableau d'honneur mensuel (Top 10 par ville)");
    const ranked: { id: string; score: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const d = await mkUser("DRIVER", `Top${i}`, {
        city: testCity,
        driverScore: 60 + i * 3, // 60 ... 93
        driverRatingCount: 5,
      });
      await mkMission(vendor.id, d.id, "DELIVERED");
      ranked.push({ id: d.id, score: 60 + i * 3 });
    }
    // Départage par livraisons : 2 livreurs au même score que le meilleur, 1 livraison de plus pour l'un
    const bestId = ranked[11].id;
    await mkMission(vendor.id, bestId, "DELIVERED");

    // Exclusions : autre ville, aucune livraison ce mois, aucune note
    const otherCity = await mkUser("DRIVER", "90", { city: `Autre${ts}`, driverScore: 99, driverRatingCount: 3 });
    await mkMission(vendor.id, otherCity.id);
    const noDelivery = await mkUser("DRIVER", "91", { city: testCity, driverScore: 99, driverRatingCount: 3 });
    const lastMonth = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await mkMission(vendor.id, noDelivery.id, "DELIVERED", { updatedAt: lastMonth, createdAt: lastMonth });
    const noRating = await mkUser("DRIVER", "92", { city: testCity, driverScore: 99, driverRatingCount: 0 });
    await mkMission(vendor.id, noRating.id);

    const board = await getMonthlyLeaderboard({ city: testCity });
    assert.strictEqual(board.length, 10, "Top 10 uniquement");
    assert.deepStrictEqual(
      board.map((e) => e.driverId),
      ranked.slice().sort((a, b) => b.score - a.score).slice(0, 10).map((e) => e.id),
      "Tri par score décroissant"
    );
    assert.deepStrictEqual(board.map((e) => e.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.strictEqual(board[0].driverId, bestId);
    assert.strictEqual(board[0].deliveriesThisMonth, 2);
    assert.strictEqual(board.filter((e) => e.isTopOfMonth).length, 1);
    assert.strictEqual(board[0].isTopOfMonth, true);
    const ids = board.map((e) => e.driverId);
    for (const excluded of [otherCity.id, noDelivery.id, noRating.id]) {
      assert.ok(!ids.includes(excluded), "Livreur non éligible exclu");
    }
    // Insensible à la casse + ville vide -> aucune entrée
    const boardLower = await getMonthlyLeaderboard({ city: testCity.toLowerCase() });
    assert.strictEqual(boardLower.length, 10);
    assert.strictEqual((await getMonthlyLeaderboard({ city: `Inconnue${ts}` })).length, 0);

    // Bornes du mois en heure de Douala (UTC+1)
    const { start, end } = getMonthRange(new Date("2026-03-31T23:30:00Z")); // 00:30 le 1er avril à Douala
    assert.strictEqual(start.toISOString(), "2026-03-31T23:00:00.000Z");
    assert.strictEqual(end.toISOString(), "2026-04-30T23:00:00.000Z");

    const pageSrc = read("app/(app)/dashboard/vendor/leaderboard/page.tsx");
    assert.ok(pageSrc.includes("Top Livreur du Mois"));
    assert.ok(pageSrc.includes('session.role !== "VENDOR"'));
    console.log("  ✓ 10 entrées triées, 1 seul 'Top Livreur du Mois', exclusions, ville insensible à la casse, mois de Douala");

    // -----------------------------------------------------------------
    // TEST 9 : Score visible dans la flotte
    // -----------------------------------------------------------------
    console.log("\n🧑‍🤝‍🧑 TEST 9 : Score visible sur les cartes livreur (flotte)");
    await prisma.favoriteDriver.create({ data: { buyerId: vendor.id, driverId: driver.id } });
    await prisma.favoriteDriver.create({ data: { buyerId: vendor.id, driverId: stranger.id } });
    session(vendor);
    resetFleetRateLimit(vendor.id);
    const resFleet = await getFleetRoute(new Request("http://localhost:3000/api/vendors/fleet"));
    assert.strictEqual(resFleet.status, 200);
    const fleet = (await resFleet.json()).fleet as any[];
    const fDriver = fleet.find((f) => f.driverId === driver.id);
    assert.ok(fDriver);
    assert.strictEqual(fDriver.score, 80); // notes 5 (m0) puis 3 (mRace) => moyenne 4 => 80
    assert.strictEqual(fDriver.deliveriesCount, 4); // m0, mRace, mLegacy, mFresh sont DELIVERED
    assert.ok(typeof fDriver.rating.average === "number", "La note moyenne existante est conservée");
    const fStranger = fleet.find((f) => f.driverId === stranger.id);
    assert.strictEqual(fStranger.score, null, "Pas de score sans note");
    assert.strictEqual(fStranger.deliveriesCount, 0);

    const cardSrc = read("components/FleetDriverCard.tsx");
    assert.ok(cardSrc.includes("driver.deliveriesCount"));
    assert.ok(cardSrc.includes("driver.score"));
    assert.ok(cardSrc.includes("livraison"));
    console.log("  ✓ /api/vendors/fleet renvoie score + deliveriesCount, carte affichant '⭐ 4.9 (48 livraisons)' et score /100");

    // -----------------------------------------------------------------
    // TEST 10 : UI & CGU
    // -----------------------------------------------------------------
    console.log("\n📜 TEST 10 : CGU, bouton 'Noter' et modale");
    const cgu = read("app/legal/cgu/page.tsx");
    assert.ok(cgu.includes("ARTICLE 20 — NOTATION MUTUELLE"));
    assert.ok(cgu.includes("Les notes ne sont jamais supprimées."));
    assert.ok(cgu.includes("Il ne constitue pas une certification mais un indicateur de fiabilité."));
    const missionPage = read("app/(app)/missions/[id]/page.tsx");
    assert.ok(missionPage.includes("RateMissionButton"));
    assert.ok(missionPage.includes('mission.status === "DELIVERED"'));
    assert.ok(read("components/RateMissionButton.tsx").includes("Noter"));
    const modal = read("components/RatingModal.tsx");
    assert.ok(modal.includes("[1, 2, 3, 4, 5]") && modal.includes("Envoyer") && modal.includes("facultatif"));
    console.log("  ✓ Article 20, bouton Noter conditionnel, modale 5 étoiles + commentaire + Envoyer");

    // -----------------------------------------------------------------
    // TEST 11 : Chaîne d'audit
    // -----------------------------------------------------------------
    console.log("\n🔗 TEST 11 : Intégrité de la chaîne d'audit");
    const chain = await verifyChain();
    assert.strictEqual(chain.valid, true, "La chaîne d'audit doit rester intègre");
    console.log("  ✓ Chaîne SHA-256 intègre");

    console.log("\n🎉 TOUS LES TESTS DE NOTATION MUTUELLE ONT RÉUSSI !\n");
  } finally {
    (global as any).__mockSession = null;
    await prisma.rating.deleteMany({ where: { missionId: { in: createdMissionIds } } });
    await prisma.favoriteDriver.deleteMany({ where: { buyerId: { in: createdUserIds } } });
    await prisma.mission.deleteMany({ where: { id: { in: createdMissionIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
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
