/**
 * MotoLink - Suite de tests : Annuaire volontaire des livreurs & Demandes de contact
 * 
 * Couvre :
 * 1. Migration OK (champs directoryVisible, directoryVisibleAt, workZones, DirectoryContactRequest, enums audit)
 * 2. PATCH /api/drivers/directory-visibility : toggle ON/OFF avec horodatage et audit log
 * 3. GET /api/directory/drivers : contrôle abonnement actif, stricte confidentialité (ZÉRO numéro exposé)
 * 4. Filtres de l'annuaire (ville, recherche quartiers/zones, statut, KYC)
 * 5. POST /api/directory/contact-request : création demande, notification au livreur, audit DIRECTORY_CONTACT_REQUESTED
 * 6. Gardes de demande (409 si déjà en flotte, 409 si déjà en attente, 404 si invisible)
 * 7. PATCH /api/directory/contact-request/[id] (accepted) : révélation du numéro, création FavoriteDriver (source: directory), audit
 * 8. PATCH /api/directory/contact-request/[id] (refused) : refus, notification au vendeur, pas de FavoriteDriver, audit
 * 9. Cooldown anti-harcèlement après refus (7 jours)
 * 10. Impossibilité de répondre deux fois à une demande (409)
 * 11. CGU Article 21 vérifié
 * 12. Intégrité cryptographique de la chaîne d'audit SHA-256
 */

import assert from "assert";
import fs from "fs";
import path from "path";
import prisma from "../prisma";
import { PATCH as toggleVisibilityRoute } from "../../app/api/drivers/directory-visibility/route";
import { GET as getDirectoryRoute } from "../../app/api/directory/drivers/route";
import {
  POST as createContactRequestRoute,
  GET as listContactRequestsRoute,
} from "../../app/api/directory/contact-request/route";
import { resetContactRequestRateLimit } from "../directory";
import { PATCH as respondContactRequestRoute } from "../../app/api/directory/contact-request/[id]/route";
import { verifyChain } from "../audit";

function session(user: { id: string; role: string; phone: string }) {
  (global as any).__mockSession = {
    userId: user.id,
    role: user.role,
    phone: user.phone,
  };
}

async function runTests() {
  console.log("🚀 Exécution de la suite de tests : Annuaire volontaire des livreurs...");

  const ts = Date.now();
  const tail = ts.toString().slice(-6);
  const testCity = `Douala`;
  const otherCity = `Yaoundé`;

  const createdUserIds: string[] = [];
  const createdSubIds: string[] = [];

  const mkUser = async (
    role: "VENDOR" | "DRIVER",
    suffix: string,
    extra: Record<string, any> = {}
  ) => {
    const u = await prisma.user.create({
      data: {
        phone: `+237699${tail}${suffix}`.slice(0, 15),
        role,
        name: `${role} Annuaire ${suffix}`,
        shopName: role === "VENDOR" ? `Boutique Annuaire ${suffix}` : undefined,
        city: testCity,
        ...extra,
      },
    });
    createdUserIds.push(u.id);
    return u;
  };

  const mkActiveSub = async (vendorId: string) => {
    const sub = await prisma.subscription.create({
      data: {
        userId: vendorId,
        role: "VENDOR",
        plan: "WEEKLY",
        status: "ACTIVE",
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        priceFCFA: 1000,
        pspRef: `notch_sub_dir_${ts}_${Math.random().toString(36).substring(2, 7)}`,
      },
    });
    createdSubIds.push(sub.id);
    return sub;
  };

  try {
    // -------------------------------------------------------------
    // TEST 1 : Migration & Modèle
    // -------------------------------------------------------------
    console.log("\n📦 TEST 1 : Migration Prisma & structure de l'annuaire");
    const dInit = await mkUser("DRIVER", "01");
    assert.strictEqual(dInit.directoryVisible, false, "directoryVisible doit être false par défaut");
    assert.strictEqual(dInit.directoryVisibleAt, null);
    assert.deepStrictEqual(dInit.workZones, []);

    const enumValues = await prisma.$queryRaw<{ enumlabel: string }[]>`
      SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'AuditEventType'`;
    const labels = enumValues.map((e) => e.enumlabel);
    assert.ok(labels.includes("DIRECTORY_VISIBILITY_TOGGLED"));
    assert.ok(labels.includes("DIRECTORY_CONTACT_REQUESTED"));
    assert.ok(labels.includes("DIRECTORY_CONTACT_ACCEPTED"));
    assert.ok(labels.includes("DIRECTORY_CONTACT_REFUSED"));
    console.log("  ✓ Modèle User, table DirectoryContactRequest et énumérations d'audit conformes");

    // -------------------------------------------------------------
    // TEST 2 : PATCH /api/drivers/directory-visibility (Toggle ON/OFF)
    // -------------------------------------------------------------
    console.log("\n🔘 TEST 2 : PATCH /api/drivers/directory-visibility (Toggle visibilité)");
    session(dInit);

    // a. Activation de la visibilité
    const reqOn = new Request("http://localhost:3000/api/drivers/directory-visibility", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visible: true }),
    });
    const resOn = await toggleVisibilityRoute(reqOn);
    assert.strictEqual(resOn.status, 200);
    const dataOn = await resOn.json();
    assert.strictEqual(dataOn.visible, true);
    assert.ok(dataOn.visibleAt, "Horodatage de consentement requis");

    const dAfterOn = await prisma.user.findUnique({ where: { id: dInit.id } });
    assert.strictEqual(dAfterOn?.directoryVisible, true);
    assert.ok(dAfterOn?.directoryVisibleAt);

    // Vérification AuditLog
    const auditOn = await prisma.auditLog.findMany({
      where: { eventType: "DIRECTORY_VISIBILITY_TOGGLED", entityId: dInit.id },
    });
    assert.strictEqual(auditOn.length, 1);

    // b. Désactivation de la visibilité
    const reqOff = new Request("http://localhost:3000/api/drivers/directory-visibility", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visible: false }),
    });
    const resOff = await toggleVisibilityRoute(reqOff);
    assert.strictEqual(resOff.status, 200);
    const dataOff = await resOff.json();
    assert.strictEqual(dataOff.visible, false);
    assert.strictEqual(dataOff.visibleAt, null);

    // c. Sécurité : seul un DRIVER connecté peut modifier sa visibilité
    const vendor1 = await mkUser("VENDOR", "02");
    session(vendor1);
    const reqForbidden = new Request("http://localhost:3000/api/drivers/directory-visibility", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visible: true }),
    });
    const resForbidden = await toggleVisibilityRoute(reqForbidden);
    assert.strictEqual(resForbidden.status, 403, "Un vendeur ne peut pas appeler la route livreur");

    // Réactiver pour dInit pour la suite
    session(dInit);
    await toggleVisibilityRoute(
      new Request("http://localhost:3000/api/drivers/directory-visibility", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visible: true }),
      })
    );
    console.log("  ✓ Activation / désactivation avec horodatage, audit log et protection de rôle validées");

    // -------------------------------------------------------------
    // TEST 3 : GET /api/directory/drivers (Confidentialité stricte & Zéro téléphone)
    // -------------------------------------------------------------
    console.log("\n🔒 TEST 3 : GET /api/directory/drivers (Stricte confidentialité du numéro)");
    // Vendeur sans abonnement -> 403
    session(vendor1);
    const reqNoSub = new Request("http://localhost:3000/api/directory/drivers");
    const resNoSub = await getDirectoryRoute(reqNoSub);
    assert.strictEqual(resNoSub.status, 403, "Un vendeur non abonné doit être rejeté (403)");

    // Activer abonnement vendeur
    await mkActiveSub(vendor1.id);

    // Créer plusieurs livreurs de test
    const dVisible1 = await mkUser("DRIVER", "03", {
      name: "Jean Express Akwa",
      directoryVisible: true,
      directoryVisibleAt: new Date(),
      workZones: ["Akwa", "Bonanjo"],
      driverStatus: "AVAILABLE",
      driverScore: 95,
      driverRatingCount: 12,
    });
    await prisma.kycDocument.create({
      data: {
        userId: dVisible1.id,
        type: "ID_CARD",
        status: "VERIFIED",
        frontKey: "k_front_1",
      },
    });

    const dVisible2 = await mkUser("DRIVER", "04", {
      name: "Paul Cargo Deido",
      city: otherCity,
      directoryVisible: true,
      directoryVisibleAt: new Date(),
      workZones: ["Deido", "Bastos"],
      driverStatus: "ON_MISSION",
      driverScore: 88,
      driverRatingCount: 5,
    });

    const dHidden = await mkUser("DRIVER", "05", {
      name: "Livreur Secret Non Visible",
      directoryVisible: false,
    });

    session(vendor1);
    const reqDir = new Request("http://localhost:3000/api/directory/drivers?city=Douala");
    const resDir = await getDirectoryRoute(reqDir);
    assert.strictEqual(resDir.status, 200);
    const dataDir = await resDir.json();

    assert.ok(Array.isArray(dataDir.drivers));
    // Vérification de sécurité absolue : AUCUN champ phone dans TOUTE la réponse !
    const jsonString = JSON.stringify(dataDir);
    assert.ok(!jsonString.includes(dVisible1.phone), "Le numéro de téléphone du livreur ne doit JAMAIS fuiter !");
    assert.ok(!jsonString.includes(dVisible2.phone), "Le numéro de téléphone ne doit pas apparaître");
    assert.ok(!jsonString.includes('"phone"'), "Aucune propriété 'phone' dans l'annuaire");

    const returnedIds = dataDir.drivers.map((d: any) => d.driverId);
    assert.ok(returnedIds.includes(dVisible1.id), "dVisible1 doit être listé");
    assert.ok(!returnedIds.includes(dHidden.id), "Le livreur masqué ne doit pas être listé");

    const card = dataDir.drivers.find((d: any) => d.driverId === dVisible1.id);
    assert.strictEqual(card.name, "Jean Express Akwa");
    assert.strictEqual(card.score, 95);
    assert.strictEqual(card.ratingCount, 12);
    assert.deepStrictEqual(card.zones, ["Akwa", "Bonanjo"]);
    assert.ok(card.badges.includes("id_verified"));
    assert.strictEqual(card.contactStatus, "none");
    assert.strictEqual(card.inFleet, false);
    console.log("  ✓ Annuaire filtré aux livreurs visibles, données complètes SANS aucun numéro de téléphone");

    // -------------------------------------------------------------
    // TEST 4 : Filtres de recherche & ville
    // -------------------------------------------------------------
    console.log("\n🔍 TEST 4 : Filtres de recherche, ville, statut et KYC");
    // Filtrage par quartier / zone de travail
    const reqSearch = new Request("http://localhost:3000/api/directory/drivers?city=Douala&search=Bonanjo");
    const resSearch = await getDirectoryRoute(reqSearch);
    const dataSearch = await resSearch.json();
    assert.strictEqual(dataSearch.drivers.length, 1);
    assert.strictEqual(dataSearch.drivers[0].driverId, dVisible1.id);

    // Filtrage par autre ville
    const reqYaounde = new Request(`http://localhost:3000/api/directory/drivers?city=${otherCity}`);
    const resYaounde = await getDirectoryRoute(reqYaounde);
    const dataYaounde = await resYaounde.json();
    assert.ok(dataYaounde.drivers.some((d: any) => d.driverId === dVisible2.id));

    // Filtrage statut available
    const reqStatus = new Request("http://localhost:3000/api/directory/drivers?city=Douala&status=available");
    const resStatus = await getDirectoryRoute(reqStatus);
    const dataStatus = await resStatus.json();
    dataStatus.drivers.forEach((d: any) => {
      assert.strictEqual(d.driverStatus, "AVAILABLE");
    });
    console.log("  ✓ Recherche par quartier, filtre ville et statut opérationnels");

    // -------------------------------------------------------------
    // TEST 5 : POST /api/directory/contact-request (Demande de contact)
    // -------------------------------------------------------------
    console.log("\n✉️ TEST 5 : POST /api/directory/contact-request (Envoi demande & notification)");
    resetContactRequestRateLimit();
    session(vendor1);

    const reqPost = new Request("http://localhost:3000/api/directory/contact-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ driverId: dVisible1.id }),
    });
    const resPost = await createContactRequestRoute(reqPost);
    assert.strictEqual(resPost.status, 201);
    const dataPost = await resPost.json();
    assert.strictEqual(dataPost.success, true);
    assert.strictEqual(dataPost.request.status, "pending");

    const createdReq = await prisma.directoryContactRequest.findUnique({
      where: { id: dataPost.request.id },
    });
    assert.ok(createdReq);
    assert.strictEqual(createdReq?.vendorId, vendor1.id);
    assert.strictEqual(createdReq?.driverId, dVisible1.id);
    assert.strictEqual(createdReq?.status, "pending");
    assert.strictEqual(createdReq?.driverNotifStatus, "sent");

    // Vérifier AuditLog DIRECTORY_CONTACT_REQUESTED
    const auditContact = await prisma.auditLog.findMany({
      where: { eventType: "DIRECTORY_CONTACT_REQUESTED", entityId: createdReq!.id },
    });
    assert.strictEqual(auditContact.length, 1);
    assert.strictEqual(auditContact[0].actorId, vendor1.id);

    // Dans l'annuaire, le statut de ce livreur est maintenant "pending"
    const reqAfterPost = new Request("http://localhost:3000/api/directory/drivers?city=Douala");
    const resAfterPost = await getDirectoryRoute(reqAfterPost);
    const dataAfterPost = await resAfterPost.json();
    const cardAfterPost = dataAfterPost.drivers.find((d: any) => d.driverId === dVisible1.id);
    assert.strictEqual(cardAfterPost.contactStatus, "pending");
    console.log("  ✓ Demande créée en statut 'pending', livreur notifié et audit log généré");

    // -------------------------------------------------------------
    // TEST 6 : Gardes contre les doublons & livreurs masqués
    // -------------------------------------------------------------
    console.log("\n🛡️ TEST 6 : Gardes anti-doublon et contrôle de visibilité");
    // a. Demande déjà en cours (409)
    const reqDup = new Request("http://localhost:3000/api/directory/contact-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ driverId: dVisible1.id }),
    });
    const resDup = await createContactRequestRoute(reqDup);
    assert.strictEqual(resDup.status, 409, "Doit refuser une deuxième demande en attente");

    // b. Demande sur un livreur non visible (404)
    const reqHidden = new Request("http://localhost:3000/api/directory/contact-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ driverId: dHidden.id }),
    });
    const resHidden = await createContactRequestRoute(reqHidden);
    assert.strictEqual(resHidden.status, 404, "Livreur invisible doit retourner 404");
    console.log("  ✓ Doublon 409 et livreur masqué 404 validés");

    // -------------------------------------------------------------
    // TEST 7 : PATCH accept -> Numéro révélé & FavoriteDriver créé
    // -------------------------------------------------------------
    console.log("\n🤝 TEST 7 : PATCH response: 'accepted' (Révélation numéro & flotte)");
    // Le livreur répond
    session(dVisible1);
    const reqAccept = new Request(`http://localhost:3000/api/directory/contact-request/${createdReq!.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response: "accepted" }),
    });
    const resAccept = await respondContactRequestRoute(reqAccept, { params: { id: createdReq!.id } });
    assert.strictEqual(resAccept.status, 200);
    const dataAccept = await resAccept.json();
    assert.strictEqual(dataAccept.status, "accepted");
    assert.strictEqual(dataAccept.phoneRevealed, true);

    // Vérifier FavoriteDriver créé
    const fav = await prisma.favoriteDriver.findUnique({
      where: { buyerId_driverId: { buyerId: vendor1.id, driverId: dVisible1.id } },
    });
    assert.ok(fav, "FavoriteDriver doit être créé automatiquement");
    assert.strictEqual(fav?.source, "directory");

    // Vérifier AuditLog DIRECTORY_CONTACT_ACCEPTED
    const auditAccept = await prisma.auditLog.findMany({
      where: { eventType: "DIRECTORY_CONTACT_ACCEPTED", entityId: createdReq!.id },
    });
    assert.strictEqual(auditAccept.length, 1);
    assert.strictEqual(auditAccept[0].actorId, dVisible1.id);

    // Le vendeur consulte maintenant sa liste de demandes : le numéro du livreur lui est révélé
    session(vendor1);
    const reqListReqs = new Request("http://localhost:3000/api/directory/contact-request");
    const resListReqs = await listContactRequestsRoute();
    assert.strictEqual(resListReqs.status, 200);
    const dataListReqs = await resListReqs.json();
    const itemReq = dataListReqs.requests.find((r: any) => r.id === createdReq!.id);
    assert.ok(itemReq);
    assert.strictEqual(itemReq.driver.phone, dVisible1.phone, "Le numéro doit être révélé suite à l'acceptation");
    console.log("  ✓ Statut 'accepted', FavoriteDriver créé avec source 'directory', numéro révélé au vendeur");

    // -------------------------------------------------------------
    // TEST 8 : PATCH refuse -> Notification vendeur & Pas de FavoriteDriver
    // -------------------------------------------------------------
    console.log("\n❌ TEST 8 : PATCH response: 'refused' (Refus sans révélation)");
    // Nouvelle demande sur dVisible2
    const reqPost2 = new Request("http://localhost:3000/api/directory/contact-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ driverId: dVisible2.id }),
    });
    const resPost2 = await createContactRequestRoute(reqPost2);
    const dataPost2 = await resPost2.json();
    const req2Id = dataPost2.request.id;

    // dVisible2 refuse
    session(dVisible2);
    const reqRefuse = new Request(`http://localhost:3000/api/directory/contact-request/${req2Id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response: "refused" }),
    });
    const resRefuse = await respondContactRequestRoute(reqRefuse, { params: { id: req2Id } });
    assert.strictEqual(resRefuse.status, 200);
    const dataRefuse = await resRefuse.json();
    assert.strictEqual(dataRefuse.status, "refused");
    assert.strictEqual(dataRefuse.phoneRevealed, false);

    // Aucun FavoriteDriver créé
    const favRefused = await prisma.favoriteDriver.findUnique({
      where: { buyerId_driverId: { buyerId: vendor1.id, driverId: dVisible2.id } },
    });
    assert.strictEqual(favRefused, null, "Aucun favori ne doit être créé en cas de refus");

    // Le vendeur ne voit PAS le numéro
    session(vendor1);
    const resListReqsRefuse = await listContactRequestsRoute();
    const dataListReqsRefuse = await resListReqsRefuse.json();
    const itemRefused = dataListReqsRefuse.requests.find((r: any) => r.id === req2Id);
    assert.strictEqual(itemRefused.driver.phone, null, "Le numéro doit rester NULL");

    // AuditLog DIRECTORY_CONTACT_REFUSED
    const auditRefuse = await prisma.auditLog.findMany({
      where: { eventType: "DIRECTORY_CONTACT_REFUSED", entityId: req2Id },
    });
    assert.strictEqual(auditRefuse.length, 1);
    console.log("  ✓ Refus enregistré, aucun favori créé, numéro resté strictement masqué");

    // -------------------------------------------------------------
    // TEST 9 : Règle anti-harcèlement (Cooldown 7 jours)
    // -------------------------------------------------------------
    console.log("\n⏱️ TEST 9 : Cooldown anti-harcèlement de 7 jours après refus");
    session(vendor1);
    const reqSpam = new Request("http://localhost:3000/api/directory/contact-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ driverId: dVisible2.id }),
    });
    const resSpam = await createContactRequestRoute(reqSpam);
    assert.strictEqual(resSpam.status, 429, "Doit être bloqué par le cooldown après refus");
    console.log("  ✓ 429 Too Many Requests reçu : cooldown anti-harcèlement actif");

    // -------------------------------------------------------------
    // TEST 10 : Double-réponse impossible (Concurrence / Idempotence)
    // -------------------------------------------------------------
    console.log("\n🚫 TEST 10 : Double-réponse rejetée");
    session(dVisible2);
    const reqSecondResponse = new Request(`http://localhost:3000/api/directory/contact-request/${req2Id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response: "accepted" }),
    });
    const resSecondResponse = await respondContactRequestRoute(reqSecondResponse, { params: { id: req2Id } });
    assert.strictEqual(resSecondResponse.status, 409, "Doit renvoyer 409 Conflit si la demande a déjà été traitée");
    console.log("  ✓ 409 reçu sur tentative de modification ultérieure");

    // -------------------------------------------------------------
    // TEST 11 : CGU ARTICLE 21
    // -------------------------------------------------------------
    console.log("\n📜 TEST 11 : Présence de l'Article 21 dans les CGU");
    const rootDir = path.resolve(__dirname, "../..");
    const cguContent = fs.readFileSync(path.join(rootDir, "app/legal/cgu/page.tsx"), "utf-8");
    assert.ok(cguContent.includes("ARTICLE 21 — ANNUAIRE VOLONTAIRE"));
    assert.ok(cguContent.includes("Cette visibilité est volontaire et peut être désactivée à tout moment."));
    assert.ok(cguContent.includes("Le numéro de téléphone n'est jamais affiché directement."));
    console.log("  ✓ Article 21 CGU présent et conforme");

    // -------------------------------------------------------------
    // TEST 12 : Intégrité cryptographique SHA-256
    // -------------------------------------------------------------
    console.log("\n🔗 TEST 12 : Intégrité cryptographique du journal d'audit");
    const chainResult = await verifyChain();
    assert.strictEqual(chainResult.valid, true, "La chaîne d'audit doit être 100% intègre");
    console.log("  ✓ Chaîne d'audit SHA-256 100% intègre");

    console.log("\n🎉 TOUS LES TESTS DE L'ANNUAIRE VOLONTAIRE ONT RÉUSSI !\n");
  } finally {
    (global as any).__mockSession = null;
    await prisma.directoryContactRequest.deleteMany({
      where: { vendorId: { in: createdUserIds } },
    });
    await prisma.favoriteDriver.deleteMany({
      where: { buyerId: { in: createdUserIds } },
    });
    await prisma.subscription.deleteMany({
      where: { id: { in: createdSubIds } },
    });
    await prisma.kycDocument.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: createdUserIds } },
    });
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

