/**
 * MotoLink - Suite de tests : Code de remise à 4 chiffres
 *
 * Tests unitaires :
 *  1. generateDeliveryCode() → 4 chiffres entre 1000 et 9999
 *  2. hashDeliveryCode() → hash scrypt valide (salt:key)
 *  3. verifyDeliveryCode() avec bon code → true
 *  4. verifyDeliveryCode() avec mauvais code → false
 *
 * Tests d'intégration API :
 *  5. POST /api/missions → code généré/hashé + notification + deliveryCodeSentAt
 *  6. POST /api/missions/[id]/verify-code avec bon code → deliveryCodeVerifiedAt
 *  7. POST verify-code avec mauvais code → 400 + deliveryCodeAttempts incrémenté
 *  8. 3 échecs → blocage (429)
 *  9. POST /api/missions/[id]/proof sans code validé → 400
 * 10. POST /api/missions/[id]/resend-delivery-code → nouveau code (ancien invalidé)
 * 11. Non-régression : enums, suivi public, CGU, UI, chaîne d'audit
 */

import assert from "assert";
import fs from "fs";
import path from "path";
import prisma from "../prisma";
import { POST as createMissionRoute } from "../../app/api/missions/route";
import { POST as verifyCodeRoute } from "../../app/api/missions/[id]/verify-code/route";
import { POST as proofRoute } from "../../app/api/missions/[id]/proof/route";
import { POST as resendCodeRoute } from "../../app/api/missions/[id]/resend-delivery-code/route";
import {
  generateDeliveryCode,
  hashDeliveryCode,
  verifyDeliveryCode,
} from "../delivery-code";
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

const PNG_1X1 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function runTests() {
  console.log("🚀 Exécution de la suite de tests : Code de remise à 4 chiffres...\n");

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
        name: `${role} Code ${n}`,
        shopName: role === "VENDOR" ? `Boutique Code ${n}` : undefined,
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
        pspRef: `notch_code_${ts}_${Math.random().toString(36).substring(2, 9)}`,
      },
    });
    createdSubIds.push(sub.id);
    return sub;
  };

  try {
    // ─── TESTS UNITAIRES ────────────────────────────────────────────────
    console.log("📦 TEST 1 : generateDeliveryCode() → 4 chiffres entre 1000 et 9999");
    for (let i = 0; i < 20; i++) {
      const code = generateDeliveryCode();
      assert.ok(/^\d{4}$/.test(code), `Code doit être 4 chiffres, reçu: ${code}`);
      const num = parseInt(code, 10);
      assert.ok(num >= 1000 && num <= 9999, `Code hors plage: ${num}`);
    }
    console.log("✅ TEST 1 validé\n");

    console.log("📦 TEST 2 : hashDeliveryCode() → hash scrypt valide");
    const hash = await hashDeliveryCode("1234");
    const parts = hash.split(":");
    assert.strictEqual(parts.length, 2, "Format salt:key attendu");
    assert.strictEqual(parts[0].length, 32, "Salt 16 octets hex = 32 chars");
    assert.strictEqual(parts[1].length, 64, "Key 32 octets hex = 64 chars");
    const hash2 = await hashDeliveryCode("1234");
    assert.notStrictEqual(hash, hash2, "Salts aléatoires → hashes différents");
    console.log("✅ TEST 2 validé\n");

    console.log("📦 TEST 3 : verifyDeliveryCode() avec bon code → true");
    assert.strictEqual(await verifyDeliveryCode("1234", hash), true);
    assert.strictEqual(await verifyDeliveryCode("1234", hash2), true);
    console.log("✅ TEST 3 validé\n");

    console.log("📦 TEST 4 : verifyDeliveryCode() avec mauvais code → false");
    assert.strictEqual(await verifyDeliveryCode("9999", hash), false);
    console.log("✅ TEST 4 validé\n");

    // ─── SETUP ───────────────────────────────────────────────────────────
    const vendor = await mkUser("VENDOR");
    await mkSub(vendor.id, "VENDOR");
    mockSession(vendor);

    const missionBody = (extra: Record<string, any> = {}) => ({
      buyerName: "Aïssatou Ngo",
      buyerPhone: "+237677110022",
      address: "Bonapriso, Rue Njo-Njo, Douala",
      articlePhotoUrls: ["https://example.com/colis.jpg"],
      description: "Colis fragile - 2 articles",
      price: 5000,
      type: "PARCEL",
      orderConfirmed: true,
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

    // ─── TEST 5 : création mission → code généré + envoyé ───────────────
    console.log("📦 TEST 5 : POST /api/missions → code généré, hashé, envoyé");
    const { result: created, logs: createLogs } = await captureLogs(() =>
      postMission(missionBody())
    );
    assert.strictEqual(created.res.status, 201, `201 attendu (${JSON.stringify(created.data)})`);
    const m5 = await prisma.mission.findUnique({ where: { id: created.data.mission.id } });
    assert.ok(m5, "Mission créée en base");
    assert.ok(m5!.deliveryCode, "deliveryCode doit être renseigné (hashé)");
    assert.match(m5!.deliveryCode!, /^[0-9a-f]{32}:[0-9a-f]{64}$/, "Format scrypt salt:key");
    assert.notStrictEqual(m5!.deliveryCode!.length, 4, "Le code ne doit PAS être stocké en clair");
    assert.ok(m5!.deliveryCodeSentAt, "deliveryCodeSentAt doit être renseigné après envoi");
    assert.strictEqual(m5!.deliveryCodeVerifiedAt, null);
    assert.strictEqual(m5!.deliveryCodeAttempts, 0);

    assert.strictEqual(
      JSON.stringify(created.data).includes(m5!.deliveryCode!),
      false,
      "Le hash du code ne doit pas être exposé dans la réponse"
    );

    assert.ok(createLogs.includes("delivery_code"), "Template delivery_code envoyé à l'acheteur");
    assert.ok(createLogs.includes("code de remise est"), "Le message contient le texte du code");
    assert.ok(createLogs.includes("mission_created"), "mission_created toujours envoyé (non-régression 5.2)");
    assert.ok(createLogs.includes("buyer_confirm_request"), "buyer_confirm_request toujours envoyé (non-régression N1)");

    const auditGen = await prisma.auditLog.findFirst({
      where: { entityId: m5!.id, eventType: "DELIVERY_CODE_GENERATED" },
    });
    const auditSent = await prisma.auditLog.findFirst({
      where: { entityId: m5!.id, eventType: "DELIVERY_CODE_SENT" },
    });
    assert.ok(auditGen, "AuditLog DELIVERY_CODE_GENERATED attendu");
    assert.ok(auditSent, "AuditLog DELIVERY_CODE_SENT attendu");
    console.log("✅ TEST 5 validé : code hashé, envoyé, audité, notifications mission non régressées\n");

    // ─── SETUP LIVREUR ───────────────────────────────────────────────────
    const driver = await mkUser("DRIVER");
    await mkSub(driver.id, "DRIVER");
    await prisma.mission.update({
      where: { id: m5!.id },
      data: { driverId: driver.id, status: "IN_PROGRESS", driverStatusBeforeMission: "AVAILABLE" },
    });

    const postVerifyCode = async (missionId: string, code: string) => {
      const req = new Request(`http://localhost:3000/api/missions/${missionId}/verify-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const res = await verifyCodeRoute(req, { params: { id: missionId } });
      return { res, data: await res.json() };
    };

    // Le code en clair n'est jamais stocké : on contrôle un code connu en base pour tester le bon chemin
    const KNOWN_CODE = "4242";
    await prisma.mission.update({
      where: { id: m5!.id },
      data: { deliveryCode: await hashDeliveryCode(KNOWN_CODE), deliveryCodeAttempts: 0 },
    });

    // ─── TEST 6 : verify-code avec bon code → deliveryCodeVerifiedAt ────
    console.log("📦 TEST 6 : POST verify-code avec bon code → success + deliveryCodeVerifiedAt");
    mockSession(driver);
    const okVerify = await postVerifyCode(m5!.id, KNOWN_CODE);
    assert.strictEqual(okVerify.res.status, 200, `200 attendu (${JSON.stringify(okVerify.data)})`);
    assert.strictEqual(okVerify.data.success, true);
    const m6 = await prisma.mission.findUnique({ where: { id: m5!.id } });
    assert.ok(m6!.deliveryCodeVerifiedAt, "deliveryCodeVerifiedAt doit être renseigné");
    assert.strictEqual(m6!.deliveryCodeAttempts, 0, "Tentatives remises à 0 après succès");
    const auditVerified = await prisma.auditLog.findFirst({
      where: { entityId: m5!.id, eventType: "DELIVERY_CODE_VERIFIED" },
    });
    assert.ok(auditVerified, "AuditLog DELIVERY_CODE_VERIFIED attendu");
    console.log("✅ TEST 6 validé\n");

    // ─── TEST 7 & 8 : mauvais code puis blocage après 3 échecs ──────────
    console.log("📦 TEST 7 : POST verify-code avec mauvais code → 400 + compteur incrémenté");
    const mFail = await prisma.mission.create({
      data: {
        vendorId: vendor.id,
        driverId: driver.id,
        buyerPhone: "+237677110033",
        address: "Akwa, Douala",
        articlePhotoUrls: ["https://example.com/x.jpg"],
        price: 2000,
        type: "PARCEL",
        status: "IN_PROGRESS",
        deliveryCode: await hashDeliveryCode("1111"),
      },
    });
    createdMissionIds.push(mFail.id);

    for (let attempt = 1; attempt <= 3; attempt++) {
      const bad = await postVerifyCode(mFail.id, "9999");
      assert.strictEqual(bad.res.status, 400, `Tentative ${attempt} : 400 attendu`);
      assert.strictEqual(bad.data.error, "Code incorrect. Réessayez.");
      const current = await prisma.mission.findUnique({ where: { id: mFail.id } });
      assert.strictEqual(current!.deliveryCodeAttempts, attempt, `Compteur doit être ${attempt}`);
    }

    const auditFailed = await prisma.auditLog.count({
      where: { entityId: mFail.id, eventType: "DELIVERY_CODE_FAILED" },
    });
    assert.strictEqual(auditFailed, 3, "3 AuditLog DELIVERY_CODE_FAILED attendus");
    console.log("✅ TEST 7 validé : compteur incrémenté, 3 audits d'échec\n");

    console.log("📦 TEST 8 : 3 échecs → blocage (429)");
    const locked = await postVerifyCode(mFail.id, "1111");
    assert.strictEqual(locked.res.status, 429, "Après 3 échecs, la vérification est bloquée (429)");
    assert.strictEqual(locked.data.locked, true);
    const mFailAfter = await prisma.mission.findUnique({ where: { id: mFail.id } });
    assert.strictEqual(mFailAfter!.deliveryCodeVerifiedAt, null, "Validation impossible une fois bloqué");
    console.log("✅ TEST 8 validé : blocage après 3 échecs\n");

    // ─── TEST 9 : proof sans code validé → 400 ──────────────────────────
    console.log("📦 TEST 9 : POST /api/missions/[id]/proof sans code validé → 400");
    const mNoVerify = await prisma.mission.create({
      data: {
        vendorId: vendor.id,
        driverId: driver.id,
        buyerPhone: "+237677110044",
        address: "Deido, Douala",
        articlePhotoUrls: ["https://example.com/y.jpg"],
        price: 3000,
        type: "PARCEL",
        status: "IN_PROGRESS",
        deliveryCode: await hashDeliveryCode("5555"),
        deliveryCodeVerifiedAt: null,
      },
    });
    createdMissionIds.push(mNoVerify.id);
    mockSession(driver);
    const proofBlocked = await proofRoute(
      new Request(`http://localhost:3000/api/missions/${mNoVerify.id}/proof`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoBase64: PNG_1X1, signatureBase64: PNG_1X1, lat: 4.05, lng: 9.7 }),
      }),
      { params: { id: mNoVerify.id } }
    );
    assert.strictEqual(proofBlocked.status, 400, `400 attendu (reçu ${proofBlocked.status})`);
    const proofBlockedData = await proofBlocked.json();
    assert.strictEqual(proofBlockedData.error, "Code de remise non validé");
    assert.strictEqual(await prisma.proof.findUnique({ where: { missionId: mNoVerify.id } }), null);
    console.log("✅ TEST 9 validé : preuve bloquée sans code validé\n");

    // ─── TEST 10 : resend-delivery-code → nouveau code ──────────────────
    console.log("📦 TEST 10 : POST resend-delivery-code → nouveau code généré (ancien invalidé)");
    const mResend = await prisma.mission.create({
      data: {
        vendorId: vendor.id,
        driverId: driver.id,
        buyerPhone: "+237677110055",
        address: "Bonamoussadi, Douala",
        articlePhotoUrls: ["https://example.com/z.jpg"],
        price: 4000,
        type: "PARCEL",
        status: "IN_PROGRESS",
        deliveryCode: await hashDeliveryCode("7777"),
        deliveryCodeAttempts: 1,
      },
    });
    createdMissionIds.push(mResend.id);
    const oldHash = mResend.deliveryCode;
    mockSession(vendor);
    const resendRes = await resendCodeRoute(
      new Request(`http://localhost:3000/api/missions/${mResend.id}/resend-delivery-code`, {
        method: "POST",
      }),
      { params: { id: mResend.id } }
    );
    const resendData = await resendRes.json();
    assert.strictEqual(resendRes.status, 200, `200 attendu (${JSON.stringify(resendData)})`);
    assert.strictEqual(resendData.success, true);
    const mResendAfter = await prisma.mission.findUnique({ where: { id: mResend.id } });
    assert.notStrictEqual(mResendAfter!.deliveryCode, oldHash, "Le hash doit avoir changé (nouveau code)");
    assert.strictEqual(mResendAfter!.deliveryCodeAttempts, 2, "Compteur incrémenté");
    assert.strictEqual(await verifyDeliveryCode("7777", mResendAfter!.deliveryCode!), false, "Ancien code invalidé");
    const auditResend = await prisma.auditLog.count({
      where: { entityId: mResend.id, eventType: "DELIVERY_CODE_SENT" },
    });
    assert.strictEqual(auditResend, 1, "AuditLog DELIVERY_CODE_SENT (resend) attendu");
    console.log("✅ TEST 10 validé : nouveau code, ancien invalidé, audité\n");

    // ─── TEST 11 : NON-RÉGRESSION ───────────────────────────────────────
    console.log("📦 TEST 11 : Non-régression (enums, suivi public, CGU, UI, audit chain)");

    const enumRows = await prisma.$queryRaw<{ enumlabel: string }[]>`
      SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'AuditEventType'`;
    const labels = enumRows.map((r) => r.enumlabel);
    for (const l of ["DELIVERY_CODE_GENERATED", "DELIVERY_CODE_SENT", "DELIVERY_CODE_VERIFIED", "DELIVERY_CODE_FAILED"]) {
      assert.ok(labels.includes(l), `${l} doit exister`);
    }
    for (const l of ["PROOF_CREATED", "BUYER_CONFIRMED", "VENDOR_ORDER_CONFIRMED", "MISSION_STATUS_CHANGED"]) {
      assert.ok(labels.includes(l), `${l} (ancien) doit être conservé`);
    }

    const suiviPage = read("app", "suivi", "[id]", "page.tsx");
    assert.ok(!suiviPage.includes("deliveryCode"), "Le code ne doit pas être exposé sur /suivi");
    const publicRoute = read("app", "api", "public", "missions", "[id]", "route.ts");
    assert.ok(!publicRoute.includes("deliveryCode"), "L'API publique ne doit pas exposer deliveryCode");

    const cgu = read("app", "legal", "cgu", "page.tsx");
    assert.ok(cgu.includes("ARTICLE 25 — CODE DE REMISE"), "CGU doit contenir l'Article 25");
    assert.ok(cgu.includes("un code à 4 chiffres est généré et envoyé à l'acheteur"), "CGU : texte du code");

    const stepper = read("components", "ProofStepperClient.tsx");
    assert.ok(stepper.includes("DeliveryCodeInput"), "Le stepper intègre l'écran du code");
    assert.ok(stepper.includes("deliveryCodeVerified"), "Le stepper reçoit l'état de vérification");
    const codeInput = read("components", "DeliveryCodeInput.tsx");
    assert.ok(codeInput.includes("inputMode=\"numeric\""), "Cases numériques tactiles");
    assert.ok(codeInput.includes("Valider le code"), "Bouton de validation du code");

    const checkpointsSrc = read("app", "api", "missions", "[id]", "checkpoint", "route.ts");
    assert.ok(!checkpointsSrc.includes("deliveryCodeVerified"), "Les checkpoints ne dépendent pas du code");

    const chain = await verifyChain();
    assert.strictEqual(chain.valid, true, "Chaîne d'audit SHA-256 intègre");

    console.log("✅ TEST 11 validé : aucune régression détectée\n");

    console.log("🎉 TOUS LES TESTS DU CODE DE REMISE ONT RÉUSSI AVEC SUCCÈS !");
  } finally {
    clearMockSession();
    await new Promise((r) => setTimeout(r, 600));
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
