/**
 * MotoLink - Suite de tests : Confirmation de commande par le vendeur (appel / WhatsApp)
 * + confirmation acheteur par lien.
 *
 * Tests unitaires :
 *  1. generateBuyerConfirmToken() → 32 caractères hex
 *  2. POST /api/missions avec orderConfirmed = false (ou absent) → 400
 *  3. POST /api/missions avec orderConfirmed = true → mission créée (champs habituels)
 *  4. POST /api/missions avec callInitiatedAt → stocké + audits VENDOR_CALL_INITIATED / VENDOR_ORDER_CONFIRMED
 *  5. POST /api/public/missions/[id]/buyer-confirm avec token valide → buyerConfirmedAt mis à jour
 *  6. POST avec token invalide → 403
 *
 * Non-régression :
 *  - notification acheteur (mission_created) toujours envoyée + nouvelle demande de confirmation
 *  - le token n'est exposé ni au vendeur ni par l'API publique de suivi
 *  - les brouillons (finalize-draft) ne sont pas concernés par la confirmation
 *  - parcours livreur (acceptation) fonctionnel sur une mission créée avec le nouveau flux
 *  - UI : bloc, modale, bouton, page /confirm, affichage vendeur, CGU Article 24
 *  - chaîne d'audit SHA-256 intègre
 */

import assert from "assert";
import fs from "fs";
import path from "path";
import prisma from "../prisma";
import { POST as createMissionRoute } from "../../app/api/missions/route";
import { POST as buyerConfirmRoute } from "../../app/api/public/missions/[id]/buyer-confirm/route";
import { GET as publicMissionRoute } from "../../app/api/public/missions/[id]/route";
import { POST as acceptMissionRoute } from "../../app/api/missions/[id]/accept/route";
import {
  generateBuyerConfirmToken,
  parseOrderConfirmation,
  resetBuyerConfirmRateLimit,
} from "../order-confirmation";
import { verifyChain } from "../audit";

function mockSession(user: { id: string; role: string; phone: string }) {
  (global as any).__mockSession = {
    userId: user.id,
    role: user.role,
    phone: user.phone,
  };
}

function clearMockSession() {
  delete (global as any).__mockSession;
}

function read(...segments: string[]) {
  return fs.readFileSync(path.join(process.cwd(), ...segments), "utf-8");
}

/** Capture console.log le temps d'exécuter fn (pour inspecter les mocks WhatsApp). */
async function captureLogs<T>(fn: () => Promise<T>): Promise<{ result: T; logs: string }> {
  const original = console.log;
  const lines: string[] = [];
  console.log = (...args: any[]) => {
    lines.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };
  try {
    const result = await fn();
    return { result, logs: lines.join("\n") };
  } finally {
    console.log = original;
  }
}

async function runTests() {
  console.log("🚀 Exécution de la suite de tests : Confirmation de commande vendeur & acheteur...");

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
        phone: `+2376${randomDigits}${n}`.slice(0, 13),
        role,
        name: `${role} Confirm ${n}`,
        shopName: role === "VENDOR" ? `Boutique Confirm ${n}` : undefined,
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
        pspRef: `notch_sub_confirm_${ts}_${Math.random().toString(36).substring(2, 7)}`,
      },
    });
    createdSubIds.push(sub.id);
    return sub;
  };

  const missionBody = (extra: Record<string, any> = {}) => ({
    buyerName: "Marcelle Fouda",
    buyerPhone: "+237677889900",
    address: "Bonamoussadi, carrefour du marché, Douala",
    articlePhotoUrls: ["https://example.com/robe.jpg"],
    description: "Robe de soirée rouge",
    price: 4500,
    type: "PARCEL",
    ...extra,
  });

  const postMission = async (body: any) => {
    const req = new Request("http://localhost:3000/api/missions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const res = await createMissionRoute(req);
    const data = await res.json();
    if (data?.mission?.id) createdMissionIds.push(data.mission.id);
    return { res, data };
  };

  let ipSeq = 10;
  const postBuyerConfirm = async (missionId: string, body: any, ip?: string) => {
    const req = new Request(`http://localhost:3000/api/public/missions/${missionId}/buyer-confirm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": ip || `197.159.31.${ipSeq++}`,
      },
      body: JSON.stringify(body),
    });
    const res = await buyerConfirmRoute(req, { params: { id: missionId } });
    return { res, data: await res.json() };
  };

  try {
    const vendor = await mkUser("VENDOR");
    await mkSub(vendor.id, "VENDOR");
    mockSession(vendor);

    // -------------------------------------------------------------
    // TEST 1 : generateBuyerConfirmToken()
    // -------------------------------------------------------------
    console.log("\n📦 TEST 1 : generateBuyerConfirmToken() → 32 caractères hexadécimaux");
    const t1 = generateBuyerConfirmToken();
    const t2 = generateBuyerConfirmToken();
    assert.match(t1, /^[0-9a-f]{32}$/, "Le token doit faire 32 caractères hex");
    assert.notStrictEqual(t1, t2, "Deux tokens consécutifs doivent différer");
    console.log("✅ TEST 1 validé : token de 32 caractères hex, unique.");

    // -------------------------------------------------------------
    // TEST 2 : orderConfirmed manquant / false → 400
    // -------------------------------------------------------------
    console.log("\n📦 TEST 2 : POST /api/missions sans confirmation (orderConfirmed false / absent) → 400");
    const beforeCount = await prisma.mission.count({ where: { vendorId: vendor.id } });

    const noConfirm = await postMission(missionBody({ orderConfirmed: false }));
    assert.strictEqual(noConfirm.res.status, 400, "orderConfirmed=false doit retourner 400");
    assert.strictEqual(noConfirm.data.error, "Veuillez confirmer la commande");

    const absent = await postMission(missionBody());
    assert.strictEqual(absent.res.status, 400, "orderConfirmed absent doit retourner 400");

    const stringTrue = await postMission(missionBody({ orderConfirmed: "true" }));
    assert.strictEqual(stringTrue.res.status, 400, "orderConfirmed doit valoir exactement le booléen true");

    const afterCount = await prisma.mission.count({ where: { vendorId: vendor.id } });
    assert.strictEqual(afterCount, beforeCount, "Aucune mission ne doit être créée sans confirmation");
    console.log("✅ TEST 2 validé : création refusée sans confirmation (400), aucune mission créée.");

    // -------------------------------------------------------------
    // TEST 3 : orderConfirmed true → mission créée (+ non-régression champs & notifications)
    // -------------------------------------------------------------
    console.log("\n📦 TEST 3 : POST /api/missions avec orderConfirmed = true → mission créée");
    const { result: created, logs: createLogs } = await captureLogs(() =>
      postMission(missionBody({ orderConfirmed: true }))
    );
    assert.strictEqual(created.res.status, 201, `201 attendu (reçu ${created.res.status}: ${JSON.stringify(created.data)})`);
    const m3 = await prisma.mission.findUnique({ where: { id: created.data.mission.id } });
    assert.ok(m3, "La mission doit exister en base");
    assert.strictEqual(m3.status, "CREATED");
    assert.strictEqual(m3.buyerPhone, "+237677889900");
    assert.strictEqual(m3.address, "Bonamoussadi, carrefour du marché, Douala");
    assert.deepStrictEqual(m3.articlePhotoUrls, ["https://example.com/robe.jpg"]);
    assert.strictEqual(Number(m3.price), 4500);
    assert.strictEqual(m3.type, "PARCEL");
    assert.strictEqual(m3.callInitiatedAt, null, "Sans appel, callInitiatedAt reste null");
    assert.strictEqual(m3.callMethod, null);
    assert.strictEqual(m3.buyerConfirmedAt, null, "Le client n'a pas encore confirmé");
    assert.match(m3.buyerConfirmToken || "", /^[0-9a-f]{32}$/, "Un token de confirmation acheteur doit être généré");

    // Le token n'est jamais renvoyé au vendeur
    assert.strictEqual(
      JSON.stringify(created.data).includes(m3.buyerConfirmToken!),
      false,
      "Le token de confirmation ne doit pas être exposé dans la réponse vendeur"
    );
    console.log("✅ TEST 3 validé : mission créée avec ses champs habituels et un token acheteur.");

    // -------------------------------------------------------------
    // TEST 3b : notifications acheteur (non-régression 5.2 + demande de confirmation)
    // -------------------------------------------------------------
    console.log("\n📦 TEST 3b : Notification acheteur mission_created + demande de confirmation");
    assert.ok(createLogs.includes("mission_created"), "Le template mission_created doit toujours être envoyé");
    assert.ok(createLogs.includes("buyer_confirm_request"), "La demande de confirmation doit être envoyée");
    assert.ok(
      createLogs.includes(`/confirm/${m3.id}/${m3.buyerConfirmToken}`),
      "Le message doit contenir le lien /confirm/{missionId}/{token}"
    );
    assert.strictEqual(m3.notifStatus, "SENT", "notifStatus doit passer à SENT (flux 5.2 inchangé)");
    assert.strictEqual(m3.notificationSent, true);
    console.log("✅ TEST 3b validé : mission_created inchangé + lien de confirmation envoyé.");

    // -------------------------------------------------------------
    // TEST 4 : callInitiatedAt stocké + audits
    // -------------------------------------------------------------
    console.log("\n📦 TEST 4 : POST /api/missions avec callInitiatedAt → stocké et audité");
    const callAt = new Date(Date.now() - 2 * 60 * 1000);
    const withCall = await postMission(
      missionBody({
        orderConfirmed: true,
        callInitiatedAt: callAt.toISOString(),
        callMethod: "tel",
        callTarget: "+237677889900",
      })
    );
    assert.strictEqual(withCall.res.status, 201, `201 attendu (${JSON.stringify(withCall.data)})`);
    const m4 = await prisma.mission.findUnique({ where: { id: withCall.data.mission.id } });
    assert.ok(m4?.callInitiatedAt, "callInitiatedAt doit être stocké");
    assert.strictEqual(m4!.callInitiatedAt!.getTime(), callAt.getTime());
    assert.strictEqual(m4!.callMethod, "tel");
    assert.strictEqual(m4!.callTarget, "+237677889900");

    const auditCall = await prisma.auditLog.findFirst({
      where: { entityId: m4!.id, eventType: "VENDOR_CALL_INITIATED" },
    });
    const auditConfirmed = await prisma.auditLog.findFirst({
      where: { entityId: m4!.id, eventType: "VENDOR_ORDER_CONFIRMED" },
    });
    assert.ok(auditCall, "AuditLog VENDOR_CALL_INITIATED attendu");
    assert.ok(auditConfirmed, "AuditLog VENDOR_ORDER_CONFIRMED attendu");

    // Variante WhatsApp
    const withWa = await postMission(
      missionBody({
        orderConfirmed: true,
        callInitiatedAt: new Date().toISOString(),
        callMethod: "whatsapp",
        callTarget: "+237677889900",
      })
    );
    assert.strictEqual(withWa.res.status, 201);
    const m4wa = await prisma.mission.findUnique({ where: { id: withWa.data.mission.id } });
    assert.strictEqual(m4wa!.callMethod, "whatsapp");

    // « Continuer sans appeler » : confirmation sans horodatage d'appel
    const noCall = await postMission(missionBody({ orderConfirmed: true, callInitiatedAt: null, callMethod: null }));
    assert.strictEqual(noCall.res.status, 201);
    const m4nc = await prisma.mission.findUnique({ where: { id: noCall.data.mission.id } });
    assert.strictEqual(m4nc!.callInitiatedAt, null);
    assert.ok(
      await prisma.auditLog.findFirst({ where: { entityId: m4nc!.id, eventType: "VENDOR_ORDER_CONFIRMED" } }),
      "VENDOR_ORDER_CONFIRMED enregistré même sans appel"
    );
    assert.strictEqual(
      await prisma.auditLog.findFirst({ where: { entityId: m4nc!.id, eventType: "VENDOR_CALL_INITIATED" } }),
      null,
      "Pas de VENDOR_CALL_INITIATED sans appel initié"
    );

    // Données de confirmation invalides → 400
    const badMethod = await postMission(
      missionBody({ orderConfirmed: true, callInitiatedAt: new Date().toISOString(), callMethod: "sms" })
    );
    assert.strictEqual(badMethod.res.status, 400, "callMethod inconnu doit être rejeté");
    const future = await postMission(
      missionBody({
        orderConfirmed: true,
        callInitiatedAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
        callMethod: "tel",
      })
    );
    assert.strictEqual(future.res.status, 400, "callInitiatedAt futur doit être rejeté");
    const half = await postMission(missionBody({ orderConfirmed: true, callMethod: "tel" }));
    assert.strictEqual(half.res.status, 400, "callMethod sans callInitiatedAt doit être rejeté");

    // parseOrderConfirmation (unitaire)
    assert.strictEqual(parseOrderConfirmation({ orderConfirmed: false }).ok, false);
    assert.strictEqual(parseOrderConfirmation({ orderConfirmed: true }).ok, true);
    console.log("✅ TEST 4 validé : appel stocké (tel & WhatsApp), audits créés, entrées invalides rejetées.");

    // -------------------------------------------------------------
    // TEST 5 : confirmation acheteur — token valide
    // -------------------------------------------------------------
    console.log("\n📦 TEST 5 : POST /api/public/missions/[id]/buyer-confirm avec token valide");
    const confirmIp = "197.159.31.201";
    const ok = await postBuyerConfirm(m3.id, { token: m3.buyerConfirmToken }, confirmIp);
    assert.strictEqual(ok.res.status, 200, `200 attendu (${JSON.stringify(ok.data)})`);
    assert.strictEqual(ok.data.success, true);
    const m5 = await prisma.mission.findUnique({ where: { id: m3.id } });
    assert.ok(m5?.buyerConfirmedAt, "buyerConfirmedAt doit être renseigné");
    assert.strictEqual(m5!.buyerConfirmedVia, "link");
    const auditBuyer = await prisma.auditLog.count({
      where: { entityId: m3.id, eventType: "BUYER_CONFIRMED" },
    });
    assert.strictEqual(auditBuyer, 1, "Un AuditLog BUYER_CONFIRMED attendu");

    // Idempotence : second clic → succès sans nouvelle écriture ni nouvel audit
    const again = await postBuyerConfirm(m3.id, { token: m3.buyerConfirmToken }, confirmIp);
    assert.strictEqual(again.res.status, 200);
    assert.strictEqual(again.data.alreadyConfirmed, true);
    const m5b = await prisma.mission.findUnique({ where: { id: m3.id } });
    assert.strictEqual(m5b!.buyerConfirmedAt!.getTime(), m5!.buyerConfirmedAt!.getTime(), "Horodatage inchangé");
    assert.strictEqual(
      await prisma.auditLog.count({ where: { entityId: m3.id, eventType: "BUYER_CONFIRMED" } }),
      1,
      "Pas de doublon d'audit"
    );
    console.log("✅ TEST 5 validé : confirmation enregistrée, auditée, idempotente.");

    // -------------------------------------------------------------
    // TEST 6 : token invalide → 403
    // -------------------------------------------------------------
    console.log("\n📦 TEST 6 : Token invalide / manquant / mission inconnue");
    const bad = await postBuyerConfirm(m4!.id, { token: "0".repeat(32) });
    assert.strictEqual(bad.res.status, 403, "Token invalide doit retourner 403");
    const badShort = await postBuyerConfirm(m4!.id, { token: "abc" });
    assert.strictEqual(badShort.res.status, 403, "Token de mauvaise longueur doit retourner 403");
    const m6 = await prisma.mission.findUnique({ where: { id: m4!.id } });
    assert.strictEqual(m6!.buyerConfirmedAt, null, "Une tentative invalide ne confirme rien");

    const missing = await postBuyerConfirm(m4!.id, {});
    assert.strictEqual(missing.res.status, 400, "Token absent doit retourner 400");

    const unknown = await postBuyerConfirm("00000000-0000-0000-0000-000000000000", { token: t1 });
    assert.strictEqual(unknown.res.status, 404, "Mission inconnue doit retourner 404");

    // Mission sans token (ex : issue d'un brouillon) : aucune confirmation possible
    const noTokenMission = await prisma.mission.create({
      data: {
        vendorId: vendor.id,
        buyerPhone: "+237655000111",
        address: "Akwa, Rue de la Joie, Douala",
        articlePhotoUrls: ["https://example.com/x.jpg"],
        price: 1000,
        type: "PARCEL",
        status: "CREATED",
      },
    });
    createdMissionIds.push(noTokenMission.id);
    const noToken = await postBuyerConfirm(noTokenMission.id, { token: t1 });
    assert.strictEqual(noToken.res.status, 403, "Une mission sans token ne peut pas être confirmée");

    // Rate limiting anti-bruteforce (10 tentatives / 15 min / IP)
    const bruteIp = "197.159.31.250";
    resetBuyerConfirmRateLimit(bruteIp);
    let lastStatus = 0;
    for (let i = 0; i < 11; i++) {
      lastStatus = (await postBuyerConfirm(m4!.id, { token: "f".repeat(32) }, bruteIp)).res.status;
    }
    assert.strictEqual(lastStatus, 429, "La 11e tentative depuis la même IP doit être limitée (429)");
    console.log("✅ TEST 6 validé : 403 / 400 / 404 / 429 conformes, aucune confirmation indue.");

    // -------------------------------------------------------------
    // TEST 7 : non-régression — API publique de suivi (pas de fuite du token)
    // -------------------------------------------------------------
    console.log("\n📦 TEST 7 : API publique de suivi inchangée et sans fuite du token");
    const pubRes = await publicMissionRoute(
      new Request(`http://localhost:3000/api/public/missions/${m3.id}`, {
        headers: { "x-forwarded-for": "197.159.31.240" },
      }),
      { params: { id: m3.id } }
    );
    assert.strictEqual(pubRes.status, 200);
    const pubText = JSON.stringify(await pubRes.json());
    assert.strictEqual(pubText.includes(m3.buyerConfirmToken!), false, "Le token ne doit jamais fuiter publiquement");
    assert.ok(pubText.includes("Bonamoussadi"), "Les informations habituelles de suivi restent présentes");
    console.log("✅ TEST 7 validé : suivi public intact, token jamais exposé.");

    // -------------------------------------------------------------
    // TEST 8 : non-régression — parcours livreur sur une mission créée avec le nouveau flux
    // -------------------------------------------------------------
    console.log("\n📦 TEST 8 : Acceptation livreur d'une mission confirmée");
    const driver = await mkUser("DRIVER", { kycStatus: "VERIFIED", verified: true });
    await mkSub(driver.id, "DRIVER");
    mockSession(driver);
    const acceptRes = await acceptMissionRoute(
      new Request(`http://localhost:3000/api/missions/${m3.id}/accept`, { method: "POST" }),
      { params: { id: m3.id } }
    );
    assert.strictEqual(acceptRes.status, 200, `Acceptation attendue (reçu ${acceptRes.status})`);
    const m8 = await prisma.mission.findUnique({ where: { id: m3.id } });
    assert.strictEqual(m8!.status, "ACCEPTED");
    assert.strictEqual(m8!.driverId, driver.id);
    assert.ok(m8!.buyerConfirmedAt, "La confirmation acheteur est conservée après acceptation");
    mockSession(vendor);
    console.log("✅ TEST 8 validé : acceptation livreur inchangée.");

    // -------------------------------------------------------------
    // TEST 9 : non-régression — brouillons non concernés
    // -------------------------------------------------------------
    console.log("\n📦 TEST 9 : Les brouillons ne passent pas par la confirmation");
    const finalizeSrc = read("app", "api", "missions", "[id]", "finalize-draft", "route.ts");
    assert.ok(
      !finalizeSrc.includes("orderConfirmed") && !finalizeSrc.includes("parseOrderConfirmation"),
      "finalize-draft ne doit pas exiger orderConfirmed"
    );
    const draftSrc = read("app", "api", "public", "missions", "draft", "route.ts");
    assert.ok(!draftSrc.includes("orderConfirmed"), "Le lien personnel ne doit pas exiger orderConfirmed");
    const pasteSrc = read("app", "api", "vendors", "smart-paste", "route.ts");
    assert.ok(!pasteSrc.includes("orderConfirmed"), "Smart Paste ne doit pas exiger orderConfirmed");
    console.log("✅ TEST 9 validé : brouillons (lien / Smart Paste / finalisation) inchangés.");

    // -------------------------------------------------------------
    // TEST 10 : UI — bloc, bouton désactivé, modale, pages
    // -------------------------------------------------------------
    console.log("\n📦 TEST 10 : Interface (bloc, bouton, modale, /confirm, dashboard, CGU)");
    const newPage = read("app", "(app)", "missions", "new", "page.tsx");
    const block = read("components", "OrderConfirmationBlock.tsx");
    const reminder = read("components", "OrderConfirmationReminder.tsx");

    assert.ok(newPage.includes("<OrderConfirmationBlock"), "Le bloc est affiché dans la page de création");
    assert.ok(
      newPage.indexOf("<OrderConfirmationBlock") < newPage.indexOf('data-testid="create-mission-button"'),
      "Le bloc est placé au-dessus du bouton « Créer la mission »"
    );
    assert.ok(block.includes("Confirmer la commande"));
    assert.ok(block.includes("Appeler le client") && block.includes("Envoyer un message WhatsApp"));
    assert.ok(block.includes("J&apos;ai confirmé la commande") && block.includes("(obligatoire)"));
    assert.ok(block.includes("disabled={!phoneReady}"), "Boutons désactivés tant que le téléphone n'est pas saisi");
    assert.ok(block.includes("disabled={!callInitiated}"), "Case désactivée tant qu'aucun appel/message initié");

    assert.ok(newPage.includes("window.location.href = `tel:${dialablePhone}`"), "Appel via tel:");
    assert.ok(newPage.includes("https://wa.me/${phoneClean}?text="), "Message via wa.me");
    assert.ok(newPage.includes('setCallMethod(method)') && newPage.includes("new Date().toISOString()"));
    assert.ok(newPage.includes("aria-disabled={!isFormValid || !orderConfirmed || submitting}"),
      "Bouton « Créer » grisé tant que la case n'est pas cochée");
    assert.ok(newPage.includes("setShowConfirmReminder(true)"), "Modale de rappel si tentative sans cocher");
    assert.ok(newPage.includes("orderConfirmed: true"), "Le body envoie orderConfirmed");
    assert.ok(newPage.includes("setOrderConfirmed(true);\n    await submitMission();"),
      "« Continuer sans appeler » coche la case puis crée la mission");

    assert.ok(reminder.includes("Avez-vous confirmé la commande ?"));
    assert.ok(reminder.includes("Il est recommandé d&apos;appeler le client avant de lancer la livraison."));
    assert.ok(reminder.includes("Appeler maintenant") && reminder.includes("Continuer sans appeler"));

    assert.ok(fs.existsSync(path.join(process.cwd(), "app", "confirm", "[missionId]", "[token]", "page.tsx")));
    assert.ok(read("components", "BuyerConfirmButton.tsx").includes("Confirmer ma commande"));
    assert.ok(read("app", "suivi", "[id]", "page.tsx").includes("<BuyerConfirmButton"),
      "Le bouton de confirmation est proposé sur /suivi si le token est présent");

    const detail = read("app", "(app)", "missions", "[id]", "page.tsx");
    assert.ok(detail.includes("Appel initié à"));
    assert.ok(detail.includes("Client a confirmé à"));
    assert.ok(detail.includes("En attente de confirmation du client"));

    const cgu = read("app", "legal", "cgu", "page.tsx");
    assert.ok(cgu.includes("ARTICLE 24 — CONFIRMATION DE COMMANDE"));
    assert.ok(cgu.includes("ne vérifie pas que l'appel a effectivement abouti"));
    assert.ok(cgu.includes("Le vendeur reste seul responsable de la confirmation"));
    console.log("✅ TEST 10 validé : interface et CGU Article 24 conformes.");

    // -------------------------------------------------------------
    // TEST 11 : enums d'audit présents
    // -------------------------------------------------------------
    console.log("\n📦 TEST 11 : Enums AuditEventType");
    const enumRows = await prisma.$queryRaw<{ enumlabel: string }[]>`
      SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'AuditEventType'`;
    const labels = enumRows.map((r) => r.enumlabel);
    for (const l of ["VENDOR_CALL_INITIATED", "VENDOR_ORDER_CONFIRMED", "BUYER_CONFIRMED", "MISSION_STATUS_CHANGED"]) {
      assert.ok(labels.includes(l), `${l} doit exister`);
    }
    console.log("✅ TEST 11 validé : nouveaux événements présents, anciens conservés.");

    // -------------------------------------------------------------
    // TEST 12 : intégrité de la chaîne d'audit
    // -------------------------------------------------------------
    console.log("\n📦 TEST 12 : Intégrité cryptographique de la chaîne d'audit SHA-256");
    const chain = await verifyChain();
    assert.strictEqual(chain.valid, true, "La chaîne d'audit doit être 100% intègre");
    console.log(`✅ TEST 12 validé : chaîne d'audit intègre (${chain.totalLogs} logs).`);

    console.log("\n🎉 TOUS LES TESTS DE CONFIRMATION DE COMMANDE ONT RÉUSSI AVEC SUCCÈS !");
  } finally {
    clearMockSession();
    // Laisse se terminer les classifications Jev asynchrones
    await new Promise((r) => setTimeout(r, 600));
    // ⚠️ Les AuditLog ne sont jamais supprimés : la chaîne SHA-256 est append-only.
    if (createdMissionIds.length > 0) {
      await prisma.directProposal.deleteMany({ where: { missionId: { in: createdMissionIds } } }).catch(() => {});
      await prisma.jevDecision.deleteMany({ where: { missionId: { in: createdMissionIds } } }).catch(() => {});
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

