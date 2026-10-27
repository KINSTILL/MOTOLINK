/**
 * MotoLink — Suite de tests N7 : Contrat PDF de livraison.
 *
 * Tests unitaires :
 *  1. computeContractHash() → 64 hex stables + sensible aux changements
 *  2. generateContractPdf() → buffer PDF valide (%PDF) + hash
 *  3. Le PDF contient les mentions clés (texte extrait approximatif via taille > 1 Ko)
 *
 * Tests d'intégration :
 *  4. POST /api/missions avec generateContractPdf=true → contractPdfUrl + hash + audit
 *  5. POST /api/missions avec generateContractPdf=false → aucun contrat
 *  6. GET /api/missions/[id]/contract → 307 redirect + audit DOWNLOADED
 *  7. GET /api/missions/[id]/contract → 403 (tiers) / 404 (mission inconnue)
 *  8. PATCH /api/users/me/contract-settings → vendeur ok / livreur 403
 *  9. Non-régression : CGU Article 31, UI lien téléchargement, enums, chaîne d'audit
 */

import assert from "assert";
import fs from "fs";
import path from "path";
import prisma from "../prisma";
import {
  computeContractHash,
  generateContractPdf,
  type ContractInput,
} from "../contract-pdf";
import { POST as createMissionRoute } from "../../app/api/missions/route";
import { GET as contractRoute } from "../../app/api/missions/[id]/contract/route";
import { PATCH as contractSettingsRoute } from "../../app/api/users/me/contract-settings/route";
import { verifyChain } from "../audit";

function mockSession(user: { id: string; role: string; phone: string }) {
  (global as any).__mockSession = { userId: user.id, role: user.role, phone: user.phone };
}
function clearMockSession() {
  delete (global as any).__mockSession;
}
function read(...segments: string[]) {
  return fs.readFileSync(path.join(process.cwd(), ...segments), "utf-8");
}

const baseInput = (overrides: Partial<ContractInput> = {}): ContractInput => ({
  missionId: "11111111-2222-3333-4444-555555555555",
  shopName: "Boutique Test",
  vendorPhone: "+237699000111",
  driverName: null,
  buyerName: "Aïssatou Ngo",
  buyerPhone: "+237677110022",
  address: "Bonapriso, Douala",
  description: "Colis fragile",
  price: 5000,
  createdAt: new Date("2026-01-15T10:00:00.000Z"),
  ...overrides,
});

async function runTests() {
  console.log("🚀 Exécution de la suite : Contrat PDF de livraison (N7)...\n");

  const ts = Date.now();
  const createdUserIds: string[] = [];
  const createdSubIds: string[] = [];
  const createdMissionIds: string[] = [];

  let seq = 1;
  const mkUser = async (role: "VENDOR" | "DRIVER", extra: Record<string, any> = {}) => {
    const n = seq++;
    const digits = Math.floor(10000 + Math.random() * 90000);
    const u = await prisma.user.create({
      data: {
        phone: `+2378${digits}${n}`.slice(0, 13),
        role,
        name: `${role} Contrat ${n}`,
        shopName: role === "VENDOR" ? `Boutique Contrat ${n}` : undefined,
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
        pspRef: `notch_contract_${ts}_${Math.random().toString(36).substring(2, 9)}`,
      },
    });
    createdSubIds.push(sub.id);
    return sub;
  };

  try {
    // ─── TEST 1 : hash stable et sensible ──────────────────────────────
    console.log("📦 TEST 1 : computeContractHash() → 64 hex, stable, sensible");
    const h1 = computeContractHash(baseInput());
    const h2 = computeContractHash(baseInput());
    assert.match(h1, /^[0-9a-f]{64}$/, "SHA-256 = 64 hex");
    assert.strictEqual(h1, h2, "Hash stable pour un même contenu");
    const hDiff = computeContractHash(baseInput({ price: 9999 }));
    assert.notStrictEqual(h1, hDiff, "Hash change si le prix change");
    const hDiff2 = computeContractHash(baseInput({ buyerPhone: "+237600000000" }));
    assert.notStrictEqual(h1, hDiff2, "Hash change si le téléphone acheteur change");
    console.log("✅ TEST 1 validé\n");

    // ─── TEST 2 : génération PDF valide ────────────────────────────────
    console.log("📦 TEST 2 : generateContractPdf() → buffer %PDF + hash");
    const { buffer, hash } = await generateContractPdf(baseInput());
    assert.ok(Buffer.isBuffer(buffer), "Un Buffer est retourné");
    assert.ok(buffer.length > 1000, `PDF non trivial (${buffer.length} octets)`);
    assert.strictEqual(buffer.subarray(0, 4).toString("latin1"), "%PDF", "Signature %PDF");
    assert.strictEqual(hash, h1, "Le hash retourné correspond à computeContractHash");
    console.log(`✅ TEST 2 validé : PDF de ${buffer.length} octets\n`);

    // ─── TEST 3 : le PDF contient du texte (structure) ─────────────────
    console.log("📦 TEST 3 : Le PDF est un document valide et bien formé");
    const pdfText = buffer.toString("latin1");
    // pdf-lib compresse/stream les objets : on valide la structure du document.
    assert.ok(pdfText.startsWith("%PDF"), "En-tête %PDF présent");
    assert.ok(pdfText.includes("%%EOF"), "PDF correctement terminé (%%EOF)");
    assert.ok(pdfText.includes("obj"), "Le PDF contient des objets");
    console.log("✅ TEST 3 validé : structure PDF conforme\n");

    // ─── TEST 4 : création mission avec contrat activé ─────────────────
    console.log("📦 TEST 4 : POST /api/missions (generateContractPdf=true) → contrat généré");
    const vendorOn = await mkUser("VENDOR", { generateContractPdf: true });
    await mkSub(vendorOn.id, "VENDOR");
    mockSession(vendorOn);

    const resOn = await createMissionRoute(
      new Request("http://localhost:3000/api/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerName: "Client Contrat",
          buyerPhone: "+237677110099",
          address: "Akwa, Douala",
          articlePhotoUrls: ["https://example.com/c.jpg"],
          description: "Commande test contrat",
          price: 5000,
          type: "PARCEL",
          orderConfirmed: true,
        }),
      })
    );
    const dataOn = await resOn.json();
    assert.strictEqual(resOn.status, 201, `201 attendu (${JSON.stringify(dataOn)})`);
    const missionOnId = dataOn.mission.id as string;
    createdMissionIds.push(missionOnId);

    const mOn = await prisma.mission.findUnique({ where: { id: missionOnId } });
    assert.ok(mOn, "Mission créée");
    assert.ok(mOn!.contractPdfUrl, "contractPdfUrl doit être renseigné");
    assert.ok(mOn!.contractPdfUrl!.startsWith("/api/proofs/files/"), `URL de stockage attendue (${mOn!.contractPdfUrl})`);
    assert.ok(mOn!.contractGeneratedAt, "contractGeneratedAt renseigné");
    assert.match(mOn!.contractHash || "", /^[0-9a-f]{64}$/, "contractHash SHA-256");

    const auditGen = await prisma.auditLog.findFirst({
      where: { entityId: missionOnId, eventType: "CONTRACT_PDF_GENERATED" },
    });
    assert.ok(auditGen, "AuditLog CONTRACT_PDF_GENERATED attendu");

    // Le hash renvoyé en base correspond bien au contenu (vérif d'intégrité)
    const recomputed = computeContractHash({
      missionId: missionOnId,
      shopName: vendorOn.shopName || vendorOn.name || "Vendeur",
      vendorPhone: vendorOn.phone || "",
      driverName: null,
      buyerName: mOn!.buyerName || null,
      buyerPhone: mOn!.buyerPhone,
      address: mOn!.address,
      description: mOn!.description || null,
      price: Number(mOn!.price),
      createdAt: mOn!.createdAt,
    });
    assert.strictEqual(recomputed, mOn!.contractHash, "Le hash stocké correspond au contenu de la mission");
    console.log("✅ TEST 4 validé : contrat généré, stocké, hashé, audité\n");

    // ─── TEST 5 : création mission sans option → pas de contrat ────────
    console.log("📦 TEST 5 : POST /api/missions (generateContractPdf=false) → aucun contrat");
    const vendorOff = await mkUser("VENDOR", { generateContractPdf: false });
    await mkSub(vendorOff.id, "VENDOR");
    mockSession(vendorOff);
    const resOff = await createMissionRoute(
      new Request("http://localhost:3000/api/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerName: "Client Sans Contrat",
          buyerPhone: "+237677110088",
          address: "Deido, Douala",
          articlePhotoUrls: ["https://example.com/d.jpg"],
          description: "Sans contrat",
          price: 3000,
          type: "PARCEL",
          orderConfirmed: true,
        }),
      })
    );
    const dataOff = await resOff.json();
    assert.strictEqual(resOff.status, 201, `201 attendu (${JSON.stringify(dataOff)})`);
    const missionOffId = dataOff.mission.id as string;
    createdMissionIds.push(missionOffId);
    const mOff = await prisma.mission.findUnique({ where: { id: missionOffId } });
    assert.strictEqual(mOff!.contractPdfUrl, null, "Aucun contrat quand l'option est désactivée");
    const auditOff = await prisma.auditLog.findFirst({
      where: { entityId: missionOffId, eventType: "CONTRACT_PDF_GENERATED" },
    });
    assert.strictEqual(auditOff, null, "Aucun audit de génération si option désactivée");
    console.log("✅ TEST 5 validé : contrat non généré sans opt-in\n");

    // ─── TEST 6 : GET contract → redirect + audit ──────────────────────
    console.log("📦 TEST 6 : GET /api/missions/[id]/contract → redirect + audit DOWNLOADED");
    mockSession(vendorOn);
    const resGet = await contractRoute(
      new Request(`http://localhost:3000/api/missions/${missionOnId}/contract`),
      { params: { id: missionOnId } }
    );
    assert.ok(
      [302, 307, 308].includes(resGet.status),
      `Redirect attendu (reçu ${resGet.status})`
    );
    const auditDl = await prisma.auditLog.findFirst({
      where: { entityId: missionOnId, eventType: "CONTRACT_PDF_DOWNLOADED" },
    });
    assert.ok(auditDl, "AuditLog CONTRACT_PDF_DOWNLOADED attendu");
    console.log("✅ TEST 6 validé : téléchargement redirigé & audité\n");

    // ─── TEST 7 : GET contract → 403 tiers / 404 mission inconnue ──────
    console.log("📦 TEST 7 : GET contract → 403 (tiers) / 404 (mission inconnue)");
    const stranger = await mkUser("VENDOR");
    mockSession(stranger);
    const resForbidden = await contractRoute(
      new Request(`http://localhost:3000/api/missions/${missionOnId}/contract`),
      { params: { id: missionOnId } }
    );
    assert.strictEqual(resForbidden.status, 403, "Tiers → 403");

    mockSession(vendorOn);
    const resUnknown = await contractRoute(
      new Request(`http://localhost:3000/api/missions/00000000-0000-0000-0000-000000000000/contract`),
      { params: { id: "00000000-0000-0000-0000-000000000000" } }
    );
    assert.strictEqual(resUnknown.status, 404, "Mission inconnue → 404");

    // Le vendeur propriétaire d'une mission sans contrat reçoit 404
    mockSession(vendorOff);
    const resNoContract = await contractRoute(
      new Request(`http://localhost:3000/api/missions/${missionOffId}/contract`),
      { params: { id: missionOffId } }
    );
    assert.strictEqual(resNoContract.status, 404, "Mission sans contrat → 404");

    // Un tiers n'apprend jamais l'existence (ou non) d'un contrat : toujours 403
    mockSession(stranger);
    const resNoContractStranger = await contractRoute(
      new Request(`http://localhost:3000/api/missions/${missionOffId}/contract`),
      { params: { id: missionOffId } }
    );
    assert.strictEqual(resNoContractStranger.status, 403, "Tiers sur mission sans contrat → 403");
    console.log("✅ TEST 7 validé\n");

    // ─── TEST 8 : PATCH contract-settings ──────────────────────────────
    console.log("📦 TEST 8 : PATCH /api/users/me/contract-settings → vendeur ok / livreur 403");
    const driver = await mkUser("DRIVER");
    mockSession(driver);
    const resDriver = await contractSettingsRoute(
      new Request("http://localhost:3000/api/users/me/contract-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generateContractPdf: true }),
      }) as any
    );
    assert.strictEqual(resDriver.status, 403, "Livreur → 403");

    mockSession(vendorOff);
    const resVendor = await contractSettingsRoute(
      new Request("http://localhost:3000/api/users/me/contract-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generateContractPdf: true }),
      }) as any
    );
    const dataSettings = await resVendor.json();
    assert.strictEqual(resVendor.status, 200, `200 attendu (${JSON.stringify(dataSettings)})`);
    assert.strictEqual(dataSettings.settings.generateContractPdf, true);
    const vendorReloaded = await prisma.user.findUnique({ where: { id: vendorOff.id } });
    assert.strictEqual(vendorReloaded!.generateContractPdf, true, "Préférence persistée");
    console.log("✅ TEST 8 validé\n");

    // ─── TEST 9 : non-régression ───────────────────────────────────────
    console.log("📦 TEST 9 : Non-régression (CGU, UI, N6, N5, chaîne d'audit)");
    const cgu = read("app", "legal", "cgu", "page.tsx");
    assert.ok(cgu.includes("ARTICLE 31 — CONTRAT PDF DE LIVRAISON"), "CGU Article 31 présent");
    assert.ok(cgu.includes("ARTICLE 30 — CARNET DE BORD PUBLIC"), "N6 Article 30 conservé");
    assert.ok(cgu.includes("ARTICLE 25 — CODE DE REMISE"), "N-livraison Article 25 conservé");

    const missionPage = read("app", "(app)", "missions", "[id]", "page.tsx");
    assert.ok(missionPage.includes("contractPdfUrl"), "La page mission lit contractPdfUrl");
    assert.ok(missionPage.includes("/contract"), "La page mission pointe vers la route contrat");

    const carnet = read("lib", "carnet.ts");
    assert.ok(carnet.includes("getCarnetBySlug"), "N6 carnet intact");
    const buyerRel = read("lib", "buyer-reliability.ts");
    assert.ok(buyerRel.includes("hashBuyerPhone"), "N5 buyer-reliability intact");

    const enumRows = await prisma.$queryRaw<{ enumlabel: string }[]>`
      SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'AuditEventType'`;
    const labels = enumRows.map((r) => r.enumlabel);
    for (const l of ["CONTRACT_PDF_GENERATED", "CONTRACT_PDF_FAILED", "CONTRACT_PDF_DOWNLOADED"]) {
      assert.ok(labels.includes(l), `${l} doit exister dans l'enum`);
    }
    for (const l of ["DELIVERY_CODE_GENERATED", "CARNET_VIEWED", "PROOF_CREATED"]) {
      assert.ok(labels.includes(l), `${l} (ancien) doit être conservé`);
    }

    const chain = await verifyChain();
    assert.strictEqual(chain.valid, true, "Chaîne d'audit SHA-256 intègre");
    console.log("✅ TEST 9 validé : aucune régression détectée\n");

    console.log("🎉 TOUS LES TESTS DU CONTRAT PDF ONT RÉUSSI !");
  } finally {
    clearMockSession();
    if (createdMissionIds.length > 0) {
      for (const m of createdMissionIds) {
        try {
          const ms = await prisma.mission.findUnique({ where: { id: m }, select: { contractPdfUrl: true } });
          if (ms?.contractPdfUrl) {
            const fname = ms.contractPdfUrl.replace("/api/proofs/files/", "");
            const fp = path.join(process.cwd(), "public", "uploads", "proofs", fname);
            if (fs.existsSync(fp)) fs.unlinkSync(fp);
          }
        } catch { /* ignore */ }
      }
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
