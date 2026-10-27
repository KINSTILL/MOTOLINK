/**
 * MotoLink - Suite de tests : Programmation de livraisons à l'avance & Agenda
 *
 * Couvre :
 * 1. Migration & Schéma (scheduledAt, scheduledStatus, drapeaux rappels, AuditEventType)
 * 2. POST /api/missions avec scheduledAt (succès pour vendeur abonné, statut 'pending', audit MISSION_SCHEDULED)
 * 3. Garde abonnement obligatoire (403 si vendeur sans abonnement actif)
 * 4. Règle préavis >= 2h (400 si scheduledAt < 2h dans le futur)
 * 5. GET /api/missions?view=agenda (tri ascendant par scheduledAt, filtrage pour livreur et vendeur)
 * 6. PATCH /api/missions/[id]/reschedule (mise à jour date, réinitialisation rappels, verrouillage < 2h)
 * 7. PATCH /api/missions/[id]/cancel-scheduled (verrouillage < 2h, désistement livreur -> marché ouvert, annulation vendeur, audit)
 * 8. Cron de rappels automatiques (J-1, 1h avant, à l'heure H, idempotence des drapeaux)
 * 9. Conformité CGU Article 22 (Programmation de missions)
 * 10. Intégrité cryptographique de la chaîne d'audit SHA-256
 */

import assert from "assert";
import fs from "fs";
import path from "path";
import prisma from "../prisma";
import { POST as createMissionRoute, GET as listMissionsRoute } from "../../app/api/missions/route";
import { PATCH as rescheduleRoute } from "../../app/api/missions/[id]/reschedule/route";
import { PATCH as cancelScheduledRoute } from "../../app/api/missions/[id]/cancel-scheduled/route";
import { processScheduledMissionReminders, validateScheduledDate } from "../scheduled-missions";
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
  console.log("🚀 Exécution de la suite de tests : Programmation de livraisons & Agenda...");

  const ts = Date.now();
  const tail = ts.toString().slice(-6);

  const createdUserIds: string[] = [];
  const createdSubIds: string[] = [];
  const createdMissionIds: string[] = [];

  let userSeq = 1;
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
        name: `${role} Sched ${suffix} ${seq}`,
        shopName: role === "VENDOR" ? `Boutique Sched ${suffix} ${seq}` : undefined,
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
        pspRef: `notch_sub_sched_${ts}_${Math.random().toString(36).substring(2, 7)}`,
      },
    });
    createdSubIds.push(sub.id);
    return sub;
  };

  try {
    // -------------------------------------------------------------
    // TEST 1 : Vérification Schéma Prisma & Migration
    // -------------------------------------------------------------
    console.log("\n📦 TEST 1 : Schéma Prisma & champs de programmation");
    const testVendor = await mkUser("VENDOR", "01");
    await mkSub(testVendor.id, "VENDOR");

    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const mInitial = await prisma.mission.create({
      data: {
        vendorId: testVendor.id,
        buyerPhone: "+237677112233",
        address: "Akwa, Rue de la Joie, Douala",
        articlePhotoUrls: ["https://example.com/photo.jpg"],
        price: 2500,
        type: "PARCEL",
        status: "CREATED",
        publicToken: `token_sched_${ts}_1`,
        scheduledAt: futureDate,
        scheduledStatus: "pending",
      },
    });
    createdMissionIds.push(mInitial.id);

    assert.ok(mInitial.scheduledAt, "scheduledAt doit être défini");
    assert.strictEqual(mInitial.scheduledStatus, "pending");
    assert.strictEqual(mInitial.scheduledReminderDayBeforeSent, false);
    assert.strictEqual(mInitial.scheduledReminderOneHourSent, false);
    assert.strictEqual(mInitial.scheduledReminderDueSent, false);
    assert.strictEqual(mInitial.scheduledCancelledReason, null);

    // Vérifier les enums AuditEventType
    const enumRows = await prisma.$queryRaw<{ enumlabel: string }[]>`
      SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'AuditEventType'`;
    const enumLabels = enumRows.map((r) => r.enumlabel);

    assert.ok(enumLabels.includes("MISSION_SCHEDULED"), "MISSION_SCHEDULED doit exister");
    assert.ok(enumLabels.includes("MISSION_RESCHEDULED"), "MISSION_RESCHEDULED doit exister");
    assert.ok(enumLabels.includes("SCHEDULED_MISSION_CANCELLED"), "SCHEDULED_MISSION_CANCELLED doit exister");
    assert.ok(enumLabels.includes("SCHEDULED_MISSION_REMINDER_SENT"), "SCHEDULED_MISSION_REMINDER_SENT doit exister");
    console.log("✅ TEST 1 validé : Schéma et enums conformes.");

    // -------------------------------------------------------------
    // TEST 2 : POST /api/missions avec scheduledAt (Vendeur abonné)
    // -------------------------------------------------------------
    console.log("\n📦 TEST 2 : POST /api/missions avec date de livraison programmée (> 2h)");
    mockSession(testVendor);

    const schedIso = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(); // dans 5h
    const postReq = new Request("http://localhost:3000/api/missions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        buyerName: "Paul Biya",
        buyerPhone: "+237699112233",
        address: "Bonanjo, Face Palais de Justice, Douala",
        articlePhotoUrls: ["https://example.com/item1.jpg"],
        description: "Documents urgents et colis fragile",
        price: 3500,
        type: "PARCEL",
        scheduledAt: schedIso,
        orderConfirmed: true,
      }),
    });

    const postRes = await createMissionRoute(postReq);
    const postData = await postRes.json();

    assert.strictEqual(postRes.status, 201, `Doit retourner 201 (reçu ${postRes.status}: ${JSON.stringify(postData)})`);
    assert.ok(postData.mission, "Doit retourner l'objet mission");
    assert.strictEqual(postData.mission.scheduledStatus, "pending");
    assert.ok(postData.mission.scheduledAt);
    createdMissionIds.push(postData.mission.id);

    // Vérifier l'audit log MISSION_SCHEDULED
    const auditScheduled = await prisma.auditLog.findFirst({
      where: {
        entityId: postData.mission.id,
        eventType: "MISSION_SCHEDULED",
      },
    });
    assert.ok(auditScheduled, "Un AuditLog MISSION_SCHEDULED doit être enregistré");
    assert.ok(auditScheduled.currentHash, "L'AuditLog doit posséder un hash SHA-256");
    console.log("✅ TEST 2 validé : Mission programmée créée avec succès et auditée.");

    // -------------------------------------------------------------
    // TEST 3 : Garde abonnement & rôle (402/403 si non autorisé)
    // -------------------------------------------------------------
    console.log("\n📦 TEST 3 : Garde abonnement actif et rôle vendeur pour la programmation");
    const unsubVendor = await mkUser("VENDOR", "02");
    mockSession(unsubVendor);

    const unsubReq = new Request("http://localhost:3000/api/missions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        buyerPhone: "+237699445566",
        address: "Deido, Rond-point 4 Étages, Douala",
        articlePhotoUrls: ["https://example.com/box.jpg"],
        price: 2000,
        type: "PARCEL",
        scheduledAt: schedIso,
      }),
    });

    const unsubRes = await createMissionRoute(unsubReq);
    assert.ok(
      unsubRes.status === 402 || unsubRes.status === 403,
      `Vendeur non abonné doit recevoir 402 ou 403 (reçu ${unsubRes.status})`
    );

    // Tester également avec un rôle non-vendeur (ex: DRIVER)
    const mockDriverUser = await mkUser("DRIVER", "02");
    mockSession(mockDriverUser);

    const driverReq = new Request("http://localhost:3000/api/missions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        buyerPhone: "+237699445566",
        address: "Deido, Rond-point 4 Étages, Douala",
        articlePhotoUrls: ["https://example.com/box.jpg"],
        price: 2000,
        type: "PARCEL",
        scheduledAt: schedIso,
      }),
    });
    const driverRes = await createMissionRoute(driverReq);
    assert.strictEqual(driverRes.status, 403, "Rôle non-vendeur doit recevoir 403");
    console.log("✅ TEST 3 validé : Accès restreint aux vendeurs abonnés.");

    // -------------------------------------------------------------
    // TEST 4 : Règle préavis >= 2h (400 si scheduledAt < 2h)
    // -------------------------------------------------------------
    console.log("\n📦 TEST 4 : Règle préavis minimum 2h (400 si date trop proche)");
    mockSession(testVendor);

    const tooSoonIso = new Date(Date.now() + 45 * 60 * 1000).toISOString(); // dans 45 minutes
    const tooSoonReq = new Request("http://localhost:3000/api/missions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        buyerPhone: "+237699445566",
        address: "Deido, Rond-point 4 Étages, Douala",
        articlePhotoUrls: ["https://example.com/box.jpg"],
        price: 2000,
        type: "PARCEL",
        scheduledAt: tooSoonIso,
        orderConfirmed: true,
      }),
    });

    const tooSoonRes = await createMissionRoute(tooSoonReq);
    assert.strictEqual(tooSoonRes.status, 400, "Date < 2h doit être rejetée avec 400");
    const tooSoonData = await tooSoonRes.json();
    assert.ok(tooSoonData.error.includes("2 heures"), "Message mentionnant les 2 heures");
    console.log("✅ TEST 4 validé : Programmation < 2h rejetée.");

    // -------------------------------------------------------------
    // TEST 5 : GET /api/missions?view=agenda
    // -------------------------------------------------------------
    console.log("\n📦 TEST 5 : GET /api/missions?view=agenda pour Livreur et Vendeur");
    const testDriver = await mkUser("DRIVER", "01");
    await mkSub(testDriver.id, "DRIVER");

    // Assigner une mission au livreur
    await prisma.mission.update({
      where: { id: postData.mission.id },
      data: {
        driverId: testDriver.id,
        scheduledStatus: "assigned",
      },
    });

    // Test côté Vendeur
    mockSession(testVendor);
    const vendorAgendaReq = new Request("http://localhost:3000/api/missions?view=agenda");
    const vendorAgendaRes = await listMissionsRoute(vendorAgendaReq);
    assert.strictEqual(vendorAgendaRes.status, 200);
    const vendorAgendaData = await vendorAgendaRes.json();
    assert.ok(Array.isArray(vendorAgendaData.missions), "Doit retourner une liste de missions");
    assert.ok(vendorAgendaData.missions.length >= 1, "Doit inclure les missions programmées");
    // Vérifier l'ordre croissant
    for (let i = 0; i < vendorAgendaData.missions.length - 1; i++) {
      const d1 = new Date(vendorAgendaData.missions[i].scheduledAt).getTime();
      const d2 = new Date(vendorAgendaData.missions[i + 1].scheduledAt).getTime();
      assert.ok(d1 <= d2, "Les missions doivent être triées par scheduledAt asc");
    }

    // Test côté Livreur
    mockSession(testDriver);
    const driverAgendaReq = new Request("http://localhost:3000/api/missions?view=agenda");
    const driverAgendaRes = await listMissionsRoute(driverAgendaReq);
    assert.strictEqual(driverAgendaRes.status, 200);
    const driverAgendaData = await driverAgendaRes.json();
    assert.ok(Array.isArray(driverAgendaData.missions));
    const foundMyMission = driverAgendaData.missions.find((m: any) => m.id === postData.mission.id);
    assert.ok(foundMyMission, "Le livreur doit voir la mission qui lui est assignée");
    console.log("✅ TEST 5 validé : Vue agenda opérationnelle et triée par date.");

    // -------------------------------------------------------------
    // TEST 6 : PATCH /api/missions/[id]/reschedule
    // -------------------------------------------------------------
    console.log("\n📦 TEST 6 : PATCH /api/missions/[id]/reschedule (Report de date)");
    mockSession(testVendor);

    const newTargetDate = new Date(Date.now() + 48 * 60 * 60 * 1000); // dans 48h
    const rescheduleReq = new Request(`http://localhost:3000/api/missions/${postData.mission.id}/reschedule`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduledAt: newTargetDate.toISOString(),
        reason: "Client indisponible aujourd'hui",
      }),
    });

    const rescheduleRes = await rescheduleRoute(rescheduleReq, { params: { id: postData.mission.id } });
    assert.strictEqual(rescheduleRes.status, 200);
    const rescheduleData = await rescheduleRes.json();
    assert.strictEqual(rescheduleData.success, true);

    const updatedM = await prisma.mission.findUnique({ where: { id: postData.mission.id } });
    assert.strictEqual(new Date(updatedM!.scheduledAt!).getTime(), newTargetDate.getTime());
    assert.strictEqual(updatedM!.scheduledReminderDayBeforeSent, false, "Drapeau J-1 réinitialisé");
    assert.strictEqual(updatedM!.scheduledReminderOneHourSent, false, "Drapeau H-1 réinitialisé");
    assert.strictEqual(updatedM!.scheduledReminderDueSent, false, "Drapeau H réinitialisé");

    // Vérifier l'audit MISSION_RESCHEDULED
    const auditResched = await prisma.auditLog.findFirst({
      where: {
        entityId: postData.mission.id,
        eventType: "MISSION_RESCHEDULED",
      },
    });
    assert.ok(auditResched, "Audit log MISSION_RESCHEDULED présent");

    // Tentative de report d'une mission < 2h -> 400
    const nearMission = await prisma.mission.create({
      data: {
        vendorId: testVendor.id,
        buyerPhone: "+237699999999",
        address: "Bonaberi, Douala",
        articlePhotoUrls: ["https://example.com/p.jpg"],
        price: 1500,
        type: "PARCEL",
        status: "CREATED",
        publicToken: `token_sched_near_${ts}`,
        scheduledAt: new Date(Date.now() + 30 * 60 * 1000), // dans 30 min (verrouillée)
        scheduledStatus: "pending",
      },
    });
    createdMissionIds.push(nearMission.id);

    const lockedReschedReq = new Request(`http://localhost:3000/api/missions/${nearMission.id}/reschedule`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduledAt: newTargetDate.toISOString(),
      }),
    });
    const lockedReschedRes = await rescheduleRoute(lockedReschedReq, { params: { id: nearMission.id } });
    assert.strictEqual(lockedReschedRes.status, 400, "Mission < 2h doit être verrouillée pour le report");
    console.log("✅ TEST 6 validé : Report de livraison sécurisé et réinitialisation des rappels.");

    // -------------------------------------------------------------
    // TEST 7 : PATCH /api/missions/[id]/cancel-scheduled
    // -------------------------------------------------------------
    console.log("\n📦 TEST 7 : PATCH /api/missions/[id]/cancel-scheduled (Annulation et Désistement)");

    // 7.1 Désistement du livreur (> 2h) -> mission revient sur le marché ouvert
    mockSession(testDriver);
    const driverCancelReq = new Request(`http://localhost:3000/api/missions/${postData.mission.id}/cancel-scheduled`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: "Panne mécanique imprévue",
      }),
    });

    const driverCancelRes = await cancelScheduledRoute(driverCancelReq, { params: { id: postData.mission.id } });
    assert.strictEqual(driverCancelRes.status, 200);

    const unassignedM = await prisma.mission.findUnique({ where: { id: postData.mission.id } });
    assert.strictEqual(unassignedM!.driverId, null, "Livreur désassigné");
    assert.strictEqual(unassignedM!.status, "CREATED", "Statut remis à CREATED");
    assert.strictEqual(unassignedM!.scheduledStatus, "pending", "Statut repassé à pending");

    const auditDriverCancel = await prisma.auditLog.findFirst({
      where: {
        entityId: postData.mission.id,
        eventType: "SCHEDULED_MISSION_CANCELLED",
      },
    });
    assert.ok(auditDriverCancel, "Audit log SCHEDULED_MISSION_CANCELLED présent");

    // 7.2 Annulation par le vendeur (> 2h) -> mission annulée
    mockSession(testVendor);
    const vendorCancelReq = new Request(`http://localhost:3000/api/missions/${postData.mission.id}/cancel-scheduled`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: "Commande annulée par le client final",
      }),
    });

    const vendorCancelRes = await cancelScheduledRoute(vendorCancelReq, { params: { id: postData.mission.id } });
    assert.strictEqual(vendorCancelRes.status, 200);

    const cancelledM = await prisma.mission.findUnique({ where: { id: postData.mission.id } });
    assert.strictEqual(cancelledM!.status, "CANCELLED");
    assert.strictEqual(cancelledM!.scheduledStatus, "cancelled");

    // 7.3 Tentative d'annulation sur mission verrouillée (< 2h)
    const lockedCancelReq = new Request(`http://localhost:3000/api/missions/${nearMission.id}/cancel-scheduled`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: "Impossible d'annuler si près",
      }),
    });
    const lockedCancelRes = await cancelScheduledRoute(lockedCancelReq, { params: { id: nearMission.id } });
    assert.strictEqual(lockedCancelRes.status, 400, "Annulation interdite à moins de 2 heures");
    console.log("✅ TEST 7 validé : Règles d'annulation et désistement respectées.");

    // -------------------------------------------------------------
    // TEST 8 : Cron de rappels automatiques (J-1, 1h, Due)
    // -------------------------------------------------------------
    console.log("\n📦 TEST 8 : Cron de rappels automatiques (processScheduledMissionReminders)");

    // Créer une mission J-1 (dans 12h)
    const mDayBefore = await prisma.mission.create({
      data: {
        vendorId: testVendor.id,
        driverId: testDriver.id,
        buyerPhone: "+237699110011",
        address: "Akwa, Douala",
        articlePhotoUrls: ["https://example.com/p1.jpg"],
        price: 2000,
        type: "PARCEL",
        status: "ACCEPTED",
        publicToken: `token_jminus1_${ts}`,
        scheduledAt: new Date(Date.now() + 12 * 60 * 60 * 1000), // dans 12h
        scheduledStatus: "assigned",
      },
    });
    createdMissionIds.push(mDayBefore.id);

    // Créer une mission H-1 (dans 30 min)
    const mOneHour = await prisma.mission.create({
      data: {
        vendorId: testVendor.id,
        driverId: testDriver.id,
        buyerPhone: "+237699110022",
        address: "Bonanjo, Douala",
        articlePhotoUrls: ["https://example.com/p2.jpg"],
        price: 2500,
        type: "PARCEL",
        status: "ACCEPTED",
        publicToken: `token_hminus1_${ts}`,
        scheduledAt: new Date(Date.now() + 30 * 60 * 1000), // dans 30 min
        scheduledStatus: "assigned",
      },
    });
    createdMissionIds.push(mOneHour.id);

    // Créer une mission H (échue depuis 5 min)
    const mDue = await prisma.mission.create({
      data: {
        vendorId: testVendor.id,
        driverId: testDriver.id,
        buyerPhone: "+237699110033",
        address: "Deido, Douala",
        articlePhotoUrls: ["https://example.com/p3.jpg"],
        price: 3000,
        type: "PARCEL",
        status: "ACCEPTED",
        publicToken: `token_due_${ts}`,
        scheduledAt: new Date(Date.now() - 5 * 60 * 1000), // 5 min de retard
        scheduledStatus: "assigned",
      },
    });
    createdMissionIds.push(mDue.id);

    // Exécuter le traitement des rappels
    const reminderResults = await processScheduledMissionReminders();

    assert.ok(reminderResults.dayBeforeSent >= 1, "Rappels J-1 envoyés");
    assert.ok(reminderResults.oneHourSent >= 1, "Rappels H-1 envoyés");
    assert.ok(reminderResults.dueSent >= 1, "Rappels H envoyés");

    // Vérifier les drapeaux dans la base
    const reloadedMDay = await prisma.mission.findUnique({ where: { id: mDayBefore.id } });
    assert.strictEqual(reloadedMDay!.scheduledReminderDayBeforeSent, true);

    const reloadedM1h = await prisma.mission.findUnique({ where: { id: mOneHour.id } });
    assert.strictEqual(reloadedM1h!.scheduledReminderOneHourSent, true);

    const reloadedMDue = await prisma.mission.findUnique({ where: { id: mDue.id } });
    assert.strictEqual(reloadedMDue!.scheduledReminderDueSent, true);

    // Vérifier l'idempotence : deuxième passage = 0 rappels supplémentaires pour ces missions
    const secondPass = await processScheduledMissionReminders();
    assert.strictEqual(secondPass.dayBeforeSent, 0, "Idempotence J-1");
    assert.strictEqual(secondPass.oneHourSent, 0, "Idempotence H-1");
    assert.strictEqual(secondPass.dueSent, 0, "Idempotence H");
    console.log("✅ TEST 8 validé : Traitement des rappels cron et idempotence parfaits.");

    // -------------------------------------------------------------
    // TEST 9 : CGU Article 22
    // -------------------------------------------------------------
    console.log("\n📦 TEST 9 : Vérification de conformité légale (CGU Article 22)");
    const cguPath = path.join(process.cwd(), "app", "legal", "cgu", "page.tsx");
    const cguContent = fs.readFileSync(cguPath, "utf-8");

    assert.ok(
      cguContent.includes("ARTICLE 22 — PROGRAMMATION DE MISSIONS"),
      "Le titre ARTICLE 22 — PROGRAMMATION DE MISSIONS doit être présent"
    );
    assert.ok(
      cguContent.includes("22.1") && cguContent.includes("7 jours"),
      "Article 22.1 présent (délai 7 jours et préavis 2h)"
    );
    assert.ok(
      cguContent.includes("22.2") && cguContent.includes("sans frais jusqu'à 2 heures"),
      "Article 22.2 présent (modification sans frais)"
    );
    assert.ok(
      cguContent.includes("22.3") && cguContent.includes("mission est verrouillée"),
      "Article 22.3 présent (verrouillage < 2h)"
    );
    assert.ok(
      cguContent.includes("22.4") && cguContent.includes("J-1, H-1, H"),
      "Article 22.4 présent (rappels automatiques indicatifs)"
    );
    assert.ok(
      cguContent.includes("22.5") && cguContent.includes("engagement moral de ponctualité"),
      "Article 22.5 présent (engagement moral de ponctualité)"
    );
    console.log("✅ TEST 9 validé : CGU Article 22 fidèlement intégré.");

    // -------------------------------------------------------------
    // TEST 10 : Intégrité cryptographique de la chaîne d'audit SHA-256
    // -------------------------------------------------------------
    console.log("\n📦 TEST 10 : Intégrité cryptographique de la chaîne d'audit SHA-256");
    const chainVerification = await verifyChain();
    assert.strictEqual(chainVerification.valid, true, "La chaîne d'audit SHA-256 doit être 100% intègre");
    console.log(`✅ TEST 10 validé : Chaîne d'audit vérifiée sans rupture (${chainVerification.totalLogs} entrées).`);

    console.log("\n🎉 TOUS LES TESTS DE PROGRAMMATION DE LIVRAISONS ONT RÉUSSI AVEC SUCCÈS !");
  } finally {
    clearMockSession();
    // Laisser les classifications asynchrones se terminer
    await new Promise((r) => setTimeout(r, 600));
    // Nettoyage des données de test
    if (createdMissionIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { entityId: { in: createdMissionIds } } });
      await prisma.mission.deleteMany({ where: { id: { in: createdMissionIds } } });
    }
    if (createdSubIds.length > 0) {
      await prisma.subscription.deleteMany({ where: { id: { in: createdSubIds } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
  }
}

runTests().catch((err) => {
  console.error("❌ ÉCHEC DES TESTS :", err);
  process.exit(1);
});
