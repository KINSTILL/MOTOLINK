/**
 * MotoLink — Suite de tests N6 : Carnet de bord public du livreur.
 *
 * Couverture :
 *  1. generateSlug() → minuscules, accents retirés, suffixe aléatoire
 *  2. getCarnetBySlug() → null si non visible / non livreur / slug inconnu
 *  3. getCarnetBySlug() → agrégats (note, livraisons) + badges + initiales
 *  4. AUCUNE donnée sensible exposée (téléphone, email…) dans le carnet public
 *  5. GET /api/public/drivers/[slug] → 200 (visible) / 404 (invisible)
 *  6. PATCH /api/users/me/carnet-settings → driver-only (403 sinon)
 *  7. PATCH → active + génère un slug (collision évitée), audit CARNET_VISIBILITY_TOGGLED
 *  8. PATCH → désactive (carnetVisible false)
 *  9. Non-régression : page /d/[slug], composant, CGU Article 30, N5 intact
 */

import assert from "assert";
import fs from "fs";
import path from "path";
import prisma from "../prisma";
import { generateSlug, getCarnetBySlug } from "../carnet";
import { GET as publicCarnetRoute } from "../../app/api/public/drivers/[slug]/route";
import { PATCH as carnetSettingsRoute } from "../../app/api/users/me/carnet-settings/route";

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

async function runTests() {
  console.log("🚀 Exécution de la suite : Carnet de bord livreur (N6)...\n");

  const ts = Date.now();
  const createdUserIds: string[] = [];
  const createdMissionIds: string[] = [];

  let seq = 1;
  const mkUser = async (role: "VENDOR" | "DRIVER", extra: Record<string, any> = {}) => {
    const n = seq++;
    const digits = Math.floor(10000000 + Math.random() * 89999999);
    const u = await prisma.user.create({
      data: {
        phone: `+237${digits}${n}`.slice(0, 13),
        role,
        name: `${role} Carnet ${n}`,
        acceptedCguAt: new Date(),
        acceptedPrivacyAt: new Date(),
        ...extra,
      },
    });
    createdUserIds.push(u.id);
    return u;
  };

  try {
    // ─── TEST 1 : generateSlug ─────────────────────────────────────────
    console.log("📦 TEST 1 : generateSlug() → normalisation + suffixe");
    const s1 = generateSlug("Jean-Marc Ébé");
    assert.match(s1, /^[a-z0-9-]+-[0-9a-f]{4}$/, `slug malformé: ${s1}`);
    assert.ok(s1.startsWith("jean-marc-eb"), `attendu jean-marc-eb…, reçu ${s1}`);
    assert.notStrictEqual(generateSlug("Jean"), generateSlug("Jean"), "suffixe aléatoire");
    assert.match(generateSlug(""), /^driver-[0-9a-f]{4}$/, "nom vide → driver-xxxx");
    console.log("✅ TEST 1 validé\n");

    // ─── TEST 2 : carnet invisible → null ──────────────────────────────
    console.log("📦 TEST 2 : carnet non visible / non livreur / inconnu → null");
    const hidden = await mkUser("DRIVER", {
      name: "Paul Hidden",
      driverSlug: `paul-hidden-${ts.toString().slice(-4)}`,
      carnetVisible: false,
    });
    assert.strictEqual(await getCarnetBySlug(hidden.driverSlug!), null, "invisible → null");

    const vendorWithSlug = await mkUser("VENDOR", {
      name: "Vendor Slug",
      driverSlug: `vendor-slug-${ts.toString().slice(-4)}`,
      carnetVisible: true,
    });
    assert.strictEqual(
      await getCarnetBySlug(vendorWithSlug.driverSlug!),
      null,
      "non-livreur → null"
    );
    assert.strictEqual(await getCarnetBySlug("slug-inexistant-zzzz"), null);
    console.log("✅ TEST 2 validé\n");

    // ─── TEST 3 : agrégats + badges + initiales ────────────────────────
    console.log("📦 TEST 3 : carnet visible → agrégats, badges, initiales");
    const slug = generateSlug("Awa Ngo Bell");
    const driver = await mkUser("DRIVER", {
      name: "Awa Ngo Bell",
      driverSlug: slug,
      carnetVisible: true,
      carnetZones: "Akwa, Deido",
      referrerBadge: "sponsor_gold",
      kycStatus: "VERIFIED",
    });

    // 2 missions livrées
    for (let i = 0; i < 2; i++) {
      const m = await prisma.mission.create({
        data: {
          vendorId: vendorWithSlug.id,
          driverId: driver.id,
          buyerPhone: "+237677000111",
          address: "Akwa, Douala",
          articlePhotoUrls: ["https://example.com/a.jpg"],
          price: 1500,
          type: "PARCEL",
          status: "DELIVERED",
        },
      });
      createdMissionIds.push(m.id);
    }
    // 1 rating 5 + 1 rating 3 → moyenne 4.0
    const m1 = createdMissionIds[0];
    const m2 = createdMissionIds[1];
    await prisma.rating.create({
      data: { missionId: m1, fromUserId: vendorWithSlug.id, toUserId: driver.id, score: 5 },
    });
    await prisma.rating.create({
      data: { missionId: m2, fromUserId: vendorWithSlug.id, toUserId: driver.id, score: 3 },
    });
    // KYC documents vérifiés
    await prisma.kycDocument.create({
      data: { userId: driver.id, type: "ID_CARD", status: "VERIFIED", frontKey: "k1" },
    });
    await prisma.kycDocument.create({
      data: { userId: driver.id, type: "SYNDICATE_CARD", status: "VERIFIED", frontKey: "k2" },
    });

    const carnet = await getCarnetBySlug(slug);
    assert.ok(carnet, "carnet attendu");
    assert.strictEqual(carnet!.slug, slug);
    assert.strictEqual(carnet!.name, "Awa Ngo Bell");
    assert.strictEqual(carnet!.initials, "AN", "initiales A + N");
    assert.strictEqual(carnet!.ratingCount, 2);
    assert.strictEqual(carnet!.ratingAverage, 4, "(5+3)/2 = 4.0");
    assert.strictEqual(carnet!.deliveredCount, 2);
    assert.strictEqual(carnet!.badges.kycVerified, true);
    assert.strictEqual(carnet!.badges.syndicate, true);
    assert.strictEqual(carnet!.badges.enrolled, false);
    assert.strictEqual(carnet!.badges.sponsor, "sponsor_gold");
    assert.strictEqual(carnet!.zones, "Akwa, Deido");
    console.log("✅ TEST 3 validé : moyenne 4.0, 2 livraisons, badges corrects\n");

    // ─── TEST 4 : aucune PII ───────────────────────────────────────────
    console.log("📦 TEST 4 : aucune donnée sensible exposée");
    const serialized = JSON.stringify(carnet);
    assert.ok(!serialized.includes(driver.phone), "le téléphone ne doit jamais apparaître");
    assert.ok(!/"phone"/.test(serialized), "pas de clé phone");
    assert.ok(!/"email"/.test(serialized), "pas de clé email");
    assert.ok(!/"lat"|"lng"|"gps"/i.test(serialized), "pas de position GPS");
    console.log("✅ TEST 4 validé : carnet 100% non sensible\n");

    // ─── TEST 5 : route publique ───────────────────────────────────────
    console.log("📦 TEST 5 : GET /api/public/drivers/[slug] → 200 / 404");
    const resOk = await publicCarnetRoute(
      new Request(`http://localhost:3000/api/public/drivers/${slug}`) as any,
      { params: { slug } }
    );
    assert.strictEqual(resOk.status, 200);
    const bodyOk = await resOk.json();
    assert.strictEqual(bodyOk.carnet.slug, slug);
    assert.ok(!JSON.stringify(bodyOk).includes(driver.phone), "pas de fuite téléphone");

    const res404 = await publicCarnetRoute(

      new Request(`http://localhost:3000/api/public/drivers/${hidden.driverSlug}`) as any,
      { params: { slug: hidden.driverSlug! } }
    );
    assert.strictEqual(res404.status, 404, "carnet invisible → 404");
    console.log("✅ TEST 5 validé\n");

    // ─── TEST 6 : PATCH interdit aux non-livreurs ──────────────────────
    console.log("📦 TEST 6 : PATCH /api/users/me/carnet-settings → 403 non-livreur");
    mockSession(vendorWithSlug as any);
    const resVendor = await carnetSettingsRoute(
      new Request("http://localhost:3000/api/users/me/carnet-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ carnetVisible: true }),
      }) as any
    );
    assert.strictEqual(resVendor.status, 403, "vendeur → 403");

    clearMockSession();
    const resAnon = await carnetSettingsRoute(
      new Request("http://localhost:3000/api/users/me/carnet-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ carnetVisible: true }),
      }) as any
    );
    assert.strictEqual(resAnon.status, 403, "anonyme → 403");
    console.log("✅ TEST 6 validé\n");

    // ─── TEST 7 : PATCH active + génère slug + audit ───────────────────
    console.log("📦 TEST 7 : PATCH active le carnet d'un livreur sans slug → slug généré + audit");
    // livreur sans slug
    const noSlugDriver = await mkUser("DRIVER", { name: "Sans Slug Livreur" });
    mockSession(noSlugDriver as any);
    const resActivate = await carnetSettingsRoute(
      new Request("http://localhost:3000/api/users/me/carnet-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ carnetVisible: true, carnetZones: "Bonapriso" }),
      }) as any
    );
    const dataActivate = await resActivate.json();
    assert.strictEqual(resActivate.status, 200);
    assert.ok(dataActivate.carnet.driverSlug, "un slug doit être généré");
    assert.strictEqual(dataActivate.carnet.carnetVisible, true);
    assert.strictEqual(dataActivate.carnet.carnetZones, "Bonapriso");

    const reloaded = await prisma.user.findUnique({ where: { id: noSlugDriver.id } });
    assert.ok(reloaded!.driverSlug, "slug persisté en base");

    const auditToggle = await prisma.auditLog.findFirst({
      where: { entityId: noSlugDriver.id, eventType: "CARNET_VISIBILITY_TOGGLED" },
    });
    assert.ok(auditToggle, "audit CARNET_VISIBILITY_TOGGLED attendu");
    console.log("✅ TEST 7 validé : slug généré, visibilité + zones persistées, auditées\n");

    // ─── TEST 8 : PATCH désactive ──────────────────────────────────────
    console.log("📦 TEST 8 : PATCH désactive → le carnet public renvoie 404");
    const resDeactivate = await carnetSettingsRoute(
      new Request("http://localhost:3000/api/users/me/carnet-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ carnetVisible: false }),
      }) as any
    );
    const dataDeactivate = await resDeactivate.json();
    assert.strictEqual(dataDeactivate.carnet.carnetVisible, false);
    const publicAfter = await getCarnetBySlug(dataDeactivate.carnet.driverSlug);
    assert.strictEqual(publicAfter, null, "désactivé → plus visible publiquement");
    console.log("✅ TEST 8 validé\n");

    // ─── TEST 9 : non-régression ───────────────────────────────────────
    console.log("📦 TEST 9 : Non-régression (page, composant, CGU, N5)");
    assert.ok(
      fs.existsSync(path.join(process.cwd(), "app", "d", "[slug]", "page.tsx")),
      "page /d/[slug] doit exister"
    );
    const page = read("app", "d", "[slug]", "page.tsx");
    assert.ok(page.includes("Contacter via MotoLink"), "bouton Contacter présent");
    assert.ok(page.includes("Aucune donnée personnelle"), "mention non-PII présente");

    const comp = read("components", "CarnetSettingsBlock.tsx");
    assert.ok(comp.includes("Carnet de bord public"), "bloc de réglages présent");
    assert.ok(comp.includes("Partager sur WhatsApp"), "partage WhatsApp présent");

    const cgu = read("app", "legal", "cgu", "page.tsx");
    assert.ok(cgu.includes("ARTICLE 30 — CARNET DE BORD PUBLIC"), "CGU Article 30 présent");
    assert.ok(cgu.includes("ARTICLE 25 — CODE DE REMISE"), "Article 25 (N-livraison) toujours présent");

    const br = read("lib", "buyer-reliability.ts");
    assert.ok(br.includes("hashBuyerPhone"), "N5 buyer-reliability intact");
    console.log("✅ TEST 9 validé\n");

    console.log("🎉 TOUS LES TESTS DU CARNET DE BORD LIVREUR ONT RÉUSSI !");
  } finally {
    clearMockSession();
    if (createdMissionIds.length > 0) {
      await prisma.rating
        .deleteMany({ where: { missionId: { in: createdMissionIds } } })
        .catch(() => {});
      await prisma.mission
        .deleteMany({ where: { id: { in: createdMissionIds } } })
        .catch(() => {});
    }
    if (createdUserIds.length > 0) {
      await prisma.kycDocument
        .deleteMany({ where: { userId: { in: createdUserIds } } })
        .catch(() => {});
      await prisma.user
        .deleteMany({ where: { id: { in: createdUserIds } } })
        .catch(() => {});
    }
  }
}

runTests().catch((err) => {
  console.error("❌ ÉCHEC DES TESTS :", err);
  process.exit(1);
});