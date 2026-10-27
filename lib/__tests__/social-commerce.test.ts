/**
 * MotoLink - Suite de tests : Social Commerce (Lien de Livraison Personnel + Smart Paste)
 *
 * Couvre :
 * 1. Migration & Schéma (User.publicSlug, Mission.source/draftToken, SmartPasteLog, AuditEventType)
 * 2. GET /api/vendors/public-slug (génération automatique, QR code, immuabilité du slug)
 * 3. POST /api/public/missions/draft (création brouillon DRAFT via lien public, submittedByBuyer: true, audit)
 * 4. Contrôle d'accès & abonnement sur /api/public/missions/draft (403 si vendeur inactif sans crédits)
 * 5. Rate limiting /api/public/missions/draft (429 après 5 soumissions par heure/IP)
 * 6. POST /api/vendors/smart-paste (extraction complète, status success, draft créé, SmartPasteLog, audit)
 * 7. POST /api/vendors/smart-paste (texte incompréhensible -> status failed, audit SMART_PASTE_FAILED)
 * 8. Rate limiting /api/vendors/smart-paste (429 après 20 requêtes par heure/vendeur)
 * 9. PATCH /api/missions/[id]/finalize-draft (photos obligatoires, passage en CREATED, notification acheteur)
 * 10. Garde de sécurité finalize-draft (403 si tiers, 400 si déjà finalisée)
 * 11. Cron cleanupExpiredDrafts (purge des DRAFT > 7 jours, audit DRAFT_EXPIRED, préservation des récents)
 * 12. Conformité légale CGU Article 23
 * 13. Intégrité cryptographique de la chaîne d'audit SHA-256
 */

import assert from "assert";
import fs from "fs";
import path from "path";
import prisma from "../prisma";
import { GET as getPublicSlugRoute } from "../../app/api/vendors/public-slug/route";
import { POST as createPublicDraftRoute } from "../../app/api/public/missions/draft/route";
import { POST as smartPasteRoute } from "../../app/api/vendors/smart-paste/route";
import { PATCH as finalizeDraftRoute } from "../../app/api/missions/[id]/finalize-draft/route";
import {
  cleanupExpiredDrafts,
  resetPublicDraftRateLimit,
  resetSmartPasteRateLimit,
} from "../social-commerce";
import { generatePublicSlug, slugify } from "../slug";
import { extractFromRawText } from "../smart-paste";
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

async function runTests() {
  console.log("🚀 Exécution de la suite de tests : Social Commerce (Lien Personnel + Smart Paste)...");

  const ts = Date.now();
  let userSeq = 1;

  const createdUserIds: string[] = [];
  const createdSubIds: string[] = [];
  const createdMissionIds: string[] = [];

  const mkUser = async (
    role: "VENDOR" | "DRIVER",
    suffix: string,
    extra: Record<string, any> = {}
  ) => {
    const seq = userSeq++;
    const randomDigits = Math.floor(10000 + Math.random() * 90000);
    const u = await prisma.user.create({
      data: {
        phone: `+2376${randomDigits}${seq}`.slice(0, 13),
        role,
        name: `${role} SC ${suffix} ${seq}`,
        shopName: role === "VENDOR" ? `Boutique Douala ${suffix} ${seq}` : undefined,
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
        pspRef: `notch_sub_sc_${ts}_${Math.random().toString(36).substring(2, 7)}`,
      },
    });
    createdSubIds.push(sub.id);
    return sub;
  };

  try {
    resetPublicDraftRateLimit();
    resetSmartPasteRateLimit();

    // -------------------------------------------------------------
    // TEST 1 : Vérification Schéma & Utilitaires de Slug
    // -------------------------------------------------------------
    console.log("\n📦 TEST 1 : Schéma Prisma & utilitaires de slug");
    assert.strictEqual(slugify("Boutique Mode & Beauté Akwa"), "boutique-mode-beaute-akwa");
    assert.strictEqual(slugify(""), "boutique");

    const v1 = await mkUser("VENDOR", "01");
    await mkSub(v1.id, "VENDOR");

    const uniqueShop = `Élégance Douala ${Math.floor(1000 + Math.random() * 9000)}`;
    const expectedBaseSlug = slugify(uniqueShop);

    const slug1 = await generatePublicSlug(uniqueShop, v1.id);
    assert.strictEqual(slug1, expectedBaseSlug);

    // Vérifier l'immuabilité : un 2ème appel retourne le même slug
    const slug1Again = await generatePublicSlug("Autre Nom", v1.id);
    assert.strictEqual(slug1Again, slug1, "Le slug doit être immuable pour un vendeur donné");

    // Collision avec un 2ème vendeur
    const v2 = await mkUser("VENDOR", "02");
    await mkSub(v2.id, "VENDOR");
    const slug2 = await generatePublicSlug(uniqueShop, v2.id);
    assert.strictEqual(slug2, `${expectedBaseSlug}-2`, "La collision doit ajouter un suffixe numérique");
    console.log("✅ TEST 1 validé : Slugification et gestion de collision parfaites.");

    // -------------------------------------------------------------
    // TEST 2 : GET /api/vendors/public-slug
    // -------------------------------------------------------------
    console.log("\n📦 TEST 2 : GET /api/vendors/public-slug (API)");
    mockSession(v1);

    const getSlugRes = await getPublicSlugRoute();
    assert.strictEqual(getSlugRes.status, 200);
    const getSlugData = await getSlugRes.json();

    assert.strictEqual(getSlugData.slug, slug1);
    assert.strictEqual(getSlugData.url, `https://motolink.cm/go/${slug1}`);
    assert.ok(getSlugData.qrCodeUrl, "Le QR Code en base64 data URL doit être généré");
    assert.ok(getSlugData.qrCodeUrl.startsWith("data:image/png;base64,"));
    console.log("✅ TEST 2 validé : Endpoint public-slug et QR Code validés.");

    // -------------------------------------------------------------
    // TEST 3 : POST /api/public/missions/draft (Création par l'acheteur)
    // -------------------------------------------------------------
    console.log("\n📦 TEST 3 : POST /api/public/missions/draft (Lien de livraison)");
    clearMockSession(); // Accès public sans authentification

    const draftReq1 = new Request("http://localhost:3000/api/public/missions/draft", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "192.168.1.100",
      },
      body: JSON.stringify({
        slug: slug1,
        buyerName: "Paul Biya",
        buyerPhone: "699 12 34 56",
        address: "Douala, Bonamoussadi, Carrefour du Marché face pharmacie",
        description: "Robe en pagne bleue",
      }),
    });

    const draftRes1 = await createPublicDraftRoute(draftReq1);
    const draftData1 = await draftRes1.json();
    assert.strictEqual(draftRes1.status, 201, `Doit retourner 201 (reçu ${draftRes1.status})`);
    assert.strictEqual(draftData1.success, true);
    assert.ok(draftData1.draftToken);
    assert.ok(draftData1.draftId);
    createdMissionIds.push(draftData1.draftId);

    // Vérifier la mission en base
    const dbDraft1 = await prisma.mission.findUnique({ where: { id: draftData1.draftId } });
    assert.strictEqual(dbDraft1!.status, "DRAFT", "Le statut initial doit être DRAFT");
    assert.strictEqual(dbDraft1!.source, "link");
    assert.strictEqual(dbDraft1!.submittedByBuyer, true);
    assert.strictEqual(dbDraft1!.buyerPhone, "+237699123456");
    assert.strictEqual(dbDraft1!.vendorId, v1.id);

    // Audit log
    const auditLink = await prisma.auditLog.findFirst({
      where: {
        entityId: draftData1.draftId,
        eventType: "DRAFT_CREATED_VIA_LINK",
      },
    });
    assert.ok(auditLink, "AuditLog DRAFT_CREATED_VIA_LINK présent");
    console.log("✅ TEST 3 validé : Brouillon DRAFT créé via lien public et audité.");

    // -------------------------------------------------------------
    // TEST 4 : Contrôle vendeur actif / crédits sur /api/public/missions/draft
    // -------------------------------------------------------------
    console.log("\n📦 TEST 4 : Vendeur inactif sans crédits (403)");
    const vInactive = await mkUser("VENDOR", "inactive");
    const inactiveSlug = await generatePublicSlug("Boutique Inactive", vInactive.id);

    const inactiveDraftReq = new Request("http://localhost:3000/api/public/missions/draft", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "192.168.1.101",
      },
      body: JSON.stringify({
        slug: inactiveSlug,
        buyerPhone: "+237699123456",
        address: "Douala, Akwa face glacier moderne",
      }),
    });

    const inactiveDraftRes = await createPublicDraftRoute(inactiveDraftReq);
    assert.strictEqual(inactiveDraftRes.status, 403, "Doit refuser si le vendeur n'a ni abonnement ni crédits");
    console.log("✅ TEST 4 validé : Protection contre soumission sur vendeur inactif.");

    // -------------------------------------------------------------
    // TEST 5 : Rate limiting sur /api/public/missions/draft (max 5/heure/IP)
    // -------------------------------------------------------------
    console.log("\n📦 TEST 5 : Rate limiting public (5/heure/IP)");
    const testIp = "192.168.5.50";
    resetPublicDraftRateLimit(testIp);

    for (let i = 0; i < 5; i++) {
      const r = new Request("http://localhost:3000/api/public/missions/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": testIp },
        body: JSON.stringify({
          slug: slug1,
          buyerPhone: "+237699123456",
          address: `Douala, Rue ${i} Bonamoussadi`,
        }),
      });
      const res = await createPublicDraftRoute(r);
      const data = await res.json();
      assert.strictEqual(res.status, 201);
      createdMissionIds.push(data.draftId);
    }

    // La 6ème doit renvoyer 429
    const r6 = new Request("http://localhost:3000/api/public/missions/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": testIp },
      body: JSON.stringify({
        slug: slug1,
        buyerPhone: "+237699123456",
        address: `Douala, Rue 6 Bonamoussadi`,
      }),
    });
    const res6 = await createPublicDraftRoute(r6);
    assert.strictEqual(res6.status, 429, "La 6ème soumission de la même IP doit être bloquée avec 429");
    console.log("✅ TEST 5 validé : Rate limiting anti-abus 5 req/heure/IP opérationnel.");

    // -------------------------------------------------------------
    // TEST 6 : POST /api/vendors/smart-paste (Extraction réussie)
    // -------------------------------------------------------------
    console.log("\n📦 TEST 6 : POST /api/vendors/smart-paste (Extraction message WhatsApp complet)");
    mockSession(v1);

    const whatsappMessage = `
Bonjour madame, je confirme la commande !
Nom : Marcelle Fouda
Tel : 677 88 99 00
Livrer à Bonamoussadi carrefour marché face pharmacie du rond-point
Prix : 3500 FCFA
Article : 2 paires de chaussures taille 38
Merci beaucoup !
    `;

    const spReq = new Request("http://localhost:3000/api/vendors/smart-paste", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawText: whatsappMessage }),
    });

    const spRes = await smartPasteRoute(spReq);
    const spData = await spRes.json();
    if (spRes.status !== 200 || !spData.success) {
      console.error("Test 6 Smart Paste failed:", spRes.status, spData);
    }
    assert.strictEqual(spRes.status, 200);
    assert.strictEqual(spData.success, true);
    assert.ok(spData.draftId);
    assert.strictEqual(spData.status, "success");
    assert.ok(spData.extracted.confidence >= 0.7);
    assert.strictEqual(spData.extracted.buyerPhone, "+237677889900");
    assert.strictEqual(spData.extracted.price, 3500);
    assert.ok(spData.extracted.address.includes("Bonamoussadi"));
    createdMissionIds.push(spData.draftId);

    // Vérifier le log SmartPasteLog
    const spLog = await prisma.smartPasteLog.findFirst({
      where: { missionId: spData.draftId },
    });
    assert.ok(spLog, "SmartPasteLog doit être enregistré");
    assert.strictEqual(spLog.status, "success");

    // Audits
    const auditSpSuccess = await prisma.auditLog.findFirst({
      where: { entityId: spData.draftId, eventType: "SMART_PASTE_SUCCESS" },
    });
    assert.ok(auditSpSuccess, "Audit SMART_PASTE_SUCCESS présent");

    const auditSpDraft = await prisma.auditLog.findFirst({
      where: { entityId: spData.draftId, eventType: "DRAFT_CREATED_VIA_PASTE" },
    });
    assert.ok(auditSpDraft, "Audit DRAFT_CREATED_VIA_PASTE présent");
    console.log("✅ TEST 6 validé : Analyse Smart Paste IA, extraction et log validés.");

    // -------------------------------------------------------------
    // TEST 7 : POST /api/vendors/smart-paste (Texte incompréhensible -> failed)
    // -------------------------------------------------------------
    console.log("\n📦 TEST 7 : POST /api/vendors/smart-paste (Texte inexploitable)");
    const gibberish = "Salut ça va ? Ok à demain.";

    const spFailReq = new Request("http://localhost:3000/api/vendors/smart-paste", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawText: gibberish }),
    });

    const spFailRes = await smartPasteRoute(spFailReq);
    assert.strictEqual(spFailRes.status, 200);
    const spFailData = await spFailRes.json();

    assert.strictEqual(spFailData.success, false);
    assert.ok(spFailData.message.includes("Impossible d'extraire"));

    const auditSpFailed = await prisma.auditLog.findFirst({
      where: { eventType: "SMART_PASTE_FAILED", actorId: v1.id },
    });
    assert.ok(auditSpFailed, "Audit SMART_PASTE_FAILED présent");
    console.log("✅ TEST 7 validé : Échec Smart Paste proprement géré avec fallback.");

    // -------------------------------------------------------------
    // TEST 8 : Rate limiting Smart Paste (20 par heure par vendeur)
    // -------------------------------------------------------------
    console.log("\n📦 TEST 8 : Rate limiting Smart Paste (20 req/heure/vendeur)");
    const vRate = await mkUser("VENDOR", "rate_paste");
    await mkSub(vRate.id, "VENDOR");
    mockSession(vRate);
    resetSmartPasteRateLimit(vRate.id);

    for (let i = 0; i < 20; i++) {
      const r = new Request("http://localhost:3000/api/vendors/smart-paste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText: "Client 699112233 Bonamoussadi 1500" }),
      });
      const res = await smartPasteRoute(r);
      const data = await res.json();
      assert.strictEqual(res.status, 200);
      if (data.draftId) createdMissionIds.push(data.draftId);
    }

    // 21ème
    const r21 = new Request("http://localhost:3000/api/vendors/smart-paste", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawText: "Client 699112233 Bonamoussadi 1500" }),
    });
    const res21 = await smartPasteRoute(r21);
    assert.strictEqual(res21.status, 429, "La 21ème requête doit retourner 429");
    console.log("✅ TEST 8 validé : Rate limiting Smart Paste (20 req/h) opérationnel.");

    // -------------------------------------------------------------
    // TEST 9 : PATCH /api/missions/[id]/finalize-draft (Validation & Création)
    // -------------------------------------------------------------
    console.log("\n📦 TEST 9 : PATCH /api/missions/[id]/finalize-draft (Photos obligatoires & statut CREATED)");
    mockSession(v1);

    // a. Tentative sans photo -> 400
    const finalizeNoPhotoReq = new Request(
      `http://localhost:3000/api/missions/${spData.draftId}/finalize-draft`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          price: 2500,
          type: "PARCEL",
          articlePhotoUrls: [],
        }),
      }
    );
    const finNoPhotoRes = await finalizeDraftRoute(finalizeNoPhotoReq, {
      params: { id: spData.draftId },
    });
    assert.strictEqual(finNoPhotoRes.status, 400, "Photos obligatoires pour finaliser la mission");

    // b. Succès avec photo et prix
    const finalizeReq = new Request(
      `http://localhost:3000/api/missions/${spData.draftId}/finalize-draft`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          price: 2500,
          type: "PARCEL",
          articlePhotoUrls: ["https://example.com/colis1.jpg"],
          description: "2 paires de chaussures emballées",
        }),
      }
    );

    const finRes = await finalizeDraftRoute(finalizeReq, { params: { id: spData.draftId } });
    assert.strictEqual(finRes.status, 200);
    const finData = await finRes.json();
    assert.strictEqual(finData.success, true);
    assert.strictEqual(finData.mission.status, "CREATED", "La mission doit passer à CREATED");
    assert.ok(finData.mission.publicToken);

    // Audit log
    const auditCreated = await prisma.auditLog.findFirst({
      where: {
        entityId: spData.draftId,
        eventType: "MISSION_STATUS_CHANGED",
      },
    });
    assert.ok(auditCreated, "Audit MISSION_STATUS_CHANGED présent");
    console.log("✅ TEST 9 validé : Finalisation de brouillon avec photos et publication.");

    // -------------------------------------------------------------
    // TEST 10 : Gardes de sécurité finalize-draft
    // -------------------------------------------------------------
    console.log("\n📦 TEST 10 : Sécurité finalize-draft (refus si tiers ou déjà finalisé)");
    // Déjà finalisé -> 400
    const reFinalizeReq = new Request(
      `http://localhost:3000/api/missions/${spData.draftId}/finalize-draft`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          price: 2500,
          type: "PARCEL",
          articlePhotoUrls: ["https://example.com/colis1.jpg"],
        }),
      }
    );
    const reFinRes = await finalizeDraftRoute(reFinalizeReq, { params: { id: spData.draftId } });
    assert.strictEqual(reFinRes.status, 400, "Brouillon déjà finalisé doit être rejeté");

    // Tentative par un autre vendeur -> 403
    mockSession(v2);
    const otherDraft = await prisma.mission.create({
      data: {
        vendorId: v1.id,
        buyerPhone: "+237699112233",
        address: "Akwa, Douala",
        price: 0,
        status: "DRAFT",
      },
    });
    createdMissionIds.push(otherDraft.id);

    const unauthorizedReq = new Request(
      `http://localhost:3000/api/missions/${otherDraft.id}/finalize-draft`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          price: 1500,
          type: "PARCEL",
          articlePhotoUrls: ["https://example.com/c.jpg"],
        }),
      }
    );
    const unauthRes = await finalizeDraftRoute(unauthorizedReq, { params: { id: otherDraft.id } });
    assert.strictEqual(unauthRes.status, 403, "Un tiers ne peut pas finaliser le brouillon d'un autre vendeur");
    console.log("✅ TEST 10 validé : Contrôles d'accès et d'état stricts.");

    // -------------------------------------------------------------
    // TEST 11 : Cron de nettoyage des brouillons expirés (> 7 jours)
    // -------------------------------------------------------------
    console.log("\n📦 TEST 11 : Purge des brouillons expirés (> 7 jours)");
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);

    // Brouillon expiré
    const staleDraft = await prisma.mission.create({
      data: {
        vendorId: v1.id,
        buyerPhone: "+237699000000",
        address: "Deido, Douala",
        price: 0,
        status: "DRAFT",
        createdAt: eightDaysAgo,
      },
    });

    // Brouillon récent (3 jours)
    const recentDraft = await prisma.mission.create({
      data: {
        vendorId: v1.id,
        buyerPhone: "+237699111111",
        address: "Bastos, Yaoundé",
        price: 0,
        status: "DRAFT",
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      },
    });
    createdMissionIds.push(recentDraft.id);

    const cleanupResult = await cleanupExpiredDrafts();
    assert.ok(cleanupResult.deletedCount >= 1, "Le brouillon de 8 jours doit être purgé");

    const staleInDb = await prisma.mission.findUnique({ where: { id: staleDraft.id } });
    assert.strictEqual(staleInDb, null, "Le brouillon ancien doit être supprimé de la base");

    const recentInDb = await prisma.mission.findUnique({ where: { id: recentDraft.id } });
    assert.ok(recentInDb, "Le brouillon récent de 3 jours doit être préservé");

    const auditExpired = await prisma.auditLog.findFirst({
      where: { entityId: staleDraft.id, eventType: "DRAFT_EXPIRED" },
    });
    assert.ok(auditExpired, "AuditLog DRAFT_EXPIRED créé");
    console.log("✅ TEST 11 validé : Purge des brouillons > 7 jours et traçabilité confirmées.");

    // -------------------------------------------------------------
    // TEST 12 : Conformité CGU Article 23
    // -------------------------------------------------------------
    console.log("\n📦 TEST 12 : Conformité légale (CGU Article 23)");
    const cguContent = fs.readFileSync(
      path.join(process.cwd(), "app", "legal", "cgu", "page.tsx"),
      "utf-8"
    );

    assert.ok(
      cguContent.includes("LIEN DE LIVRAISON PERSONNEL ET SMART PASTE"),
      "Le titre de l'article CGU doit être présent"
    );
    assert.ok(
      cguContent.includes("Le vendeur dispose d'un lien personnel qu'il peut partager à ses acheteurs"),
      "Mention du lien personnel"
    );
    assert.ok(
      cguContent.includes("modèle de décision automatisé (Jev)"),
      "Mention de Jev pour Smart Paste"
    );
    assert.ok(
      cguContent.includes("brouillons non finalisés après 7 jours sont automatiquement supprimés"),
      "Mention de la suppression après 7 jours"
    );
    console.log("✅ TEST 12 validé : CGU Article 23 fidèlement intégré.");

    // -------------------------------------------------------------
    // TEST 13 : Chaîne d'audit cryptographique SHA-256
    // -------------------------------------------------------------
    console.log("\n📦 TEST 13 : Intégrité cryptographique de la chaîne d'audit SHA-256");
    const chainVerification = await verifyChain();
    assert.strictEqual(chainVerification.valid, true, "La chaîne d'audit doit être intacte");
    console.log(`✅ TEST 13 validé : Chaîne d'audit vérifiée sans rupture (${chainVerification.totalLogs} logs).`);

    console.log("\n🎉 TOUS LES TESTS DE SOCIAL COMMERCE ONT RÉUSSI AVEC SUCCÈS !");
  } finally {
    clearMockSession();
    // Laisser les classifications asynchrones se terminer
    await new Promise((r) => setTimeout(r, 600));

    if (createdMissionIds.length > 0) {
      await prisma.smartPasteLog.deleteMany({ where: { missionId: { in: createdMissionIds } } });
      await prisma.mission.deleteMany({ where: { id: { in: createdMissionIds } } });
    }
    if (createdSubIds.length > 0) {
      await prisma.subscription.deleteMany({ where: { id: { in: createdSubIds } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.smartPasteLog.deleteMany({ where: { vendorId: { in: createdUserIds } } });
      await prisma.mission.deleteMany({ where: { vendorId: { in: createdUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
  }
}

runTests().catch((err) => {
  console.error("❌ ÉCHEC DES TESTS :", err);
  process.exit(1);
});
