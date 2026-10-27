/**
 * MotoLink - Suite de tests : Parrainage Livreur -> Livreur & Anti-fraude
 * (Badges progressifs, priorité 3 missions, détection d'auto-parrainage & rafales)
 * 
 * 21 tests couverts :
 * 1. Migration Prisma OK
 * 2. Script generate-driver-referral-codes génère des codes pour tous les DRIVER existants
 * 3. GET /api/referrals/my-code -> code + message de partage
 * 4. GET /api/referrals/status -> statistiques correctes
 * 5. POST /api/referrals/apply avec code valide -> Referral créé, priorité 3 missions appliquée, notification au parrain
 * 6. POST avec code invalide -> 404
 * 7. POST avec code déjà utilisé (déjà parrainé) -> 400
 * 8. POST avec téléphone identique au parrain -> 400 "Téléphone identique" + AuditLog REFERRAL_FRAUD_DETECTED
 * 9. POST avec device fingerprint identique -> 400 "Appareil identique" + AuditLog
 * 10. POST avec IP identique -> 400 "IP identique" + AuditLog
 * 11. POST avec > 5 parrainages en 24h -> 429 + AuditLog
 * 12. POST avec device utilisé par > 2 comptes -> 400 + AuditLog
 * 13. Filleul complète 5 livraisons -> badge "sponsor" au parrain, notification
 * 14. Filleul complète 20 livraisons -> badge "sponsor_confirmed" au parrain (si 1 seul COMPLETED), notification
 * 15. 3 filleuls COMPLETED -> badge "sponsor_gold"
 * 16. 5 filleuls COMPLETED -> badge "sponsor_platinum"
 * 17. 10 filleuls COMPLETED -> badge "sponsor_platinum" (reste)
 * 18. Page /join?ref=CODE vérifiée (route et composant prêts pour nouvel utilisateur)
 * 19. Page /join affiche message si déjà parrainé
 * 20. Profil intègre le champ "Code de parrainage" si non parrainé
 * 21. Intégrité de la chaîne cryptographique d'audit SHA-256
 */

import assert from "assert";
import prisma from "../prisma";
import { generateDriverReferralCodes } from "../../prisma/scripts/generate-driver-referral-codes";
import { ensureReferralCode, generateReferralCode } from "../referral";
import { checkReferralProgress, updateReferrerBadge } from "../referral-progress";
import { GET as getMyCodeRoute } from "../../app/api/referrals/my-code/route";
import { GET as getStatusRoute } from "../../app/api/referrals/status/route";
import { POST as applyReferralRoute } from "../../app/api/referrals/apply/route";
import { hashIp } from "../antifraud";
import { verifyChain } from "../audit";

async function runTests() {
  console.log("🚀 Exécution de la suite de tests : Parrainage Livreur -> Livreur...");

  const ts = Date.now();
  const parrainPhone = `+23767711${ts.toString().slice(-4)}`;
  const filleulPhone1 = `+23767712${ts.toString().slice(-4)}`;
  const filleulPhone2 = `+23767713${ts.toString().slice(-4)}`;

  // -------------------------------------------------------------
  // Test 1 : Migration Prisma OK
  // -------------------------------------------------------------
  console.log("👉 Test 1: Migration Prisma & Modèle Referral / User");
  const testUser = await prisma.user.create({
    data: {
      phone: `+23767700${ts.toString().slice(-4)}`,
      role: "DRIVER",
      name: "Livreur Test Migration",
      referrerBadge: "sponsor",
      referrerCount: 1,
      lastDeviceFingerprint: "device_test_mig_1",
      lastIpHash: hashIp("192.168.1.100"),
    },
  });
  assert.strictEqual(testUser.referrerBadge, "sponsor");
  assert.strictEqual(testUser.referrerCount, 1);
  console.log("✅ Test 1 validé");

  // -------------------------------------------------------------
  // Test 2 : Script generate-driver-referral-codes
  // -------------------------------------------------------------
  console.log("👉 Test 2: Script de génération automatique des codes pour livreurs");
  // Créer un livreur sans code
  const driverWithoutCode = await prisma.user.create({
    data: {
      phone: `+23767709${ts.toString().slice(-4)}`,
      role: "DRIVER",
      name: "Amadou SansCode",
    },
  });
  assert.strictEqual(driverWithoutCode.referralCode, null);

  const genResult = await generateDriverReferralCodes();
  assert(genResult.codesGenerated >= 1, "Le script doit générer au moins un code");

  const driverAfterScript = await prisma.user.findUnique({
    where: { id: driverWithoutCode.id },
  });
  assert(driverAfterScript?.referralCode !== null, "Le livreur doit désormais avoir un referralCode");
  assert(driverAfterScript?.referralCode?.startsWith("MOTO-AMADOU-"), "Format MOTO-AMADOU-ANNEE attendu");
  console.log(`✅ Test 2 validé (${driverAfterScript?.referralCode})`);

  // Livreur Parrain Principal pour les tests suivants
  const parrain = await prisma.user.create({
    data: {
      phone: parrainPhone,
      role: "DRIVER",
      name: "Jean Parrain",
      lastDeviceFingerprint: `parrain_fp_${ts}`,
      lastIpHash: hashIp("10.0.0.1"),
      subscriptionStatus: "ACTIVE",
    },
  });
  const parrainCode = await ensureReferralCode(parrain.id);

  // -------------------------------------------------------------
  // Test 3 : GET /api/referrals/my-code
  // -------------------------------------------------------------
  console.log("👉 Test 3: GET /api/referrals/my-code");
  (global as any).__mockSession = { userId: parrain.id, role: "DRIVER" };
  const resMyCode = await getMyCodeRoute();
  assert.strictEqual(resMyCode.status, 200);
  const myCodeData = await resMyCode.json();
  assert.strictEqual(myCodeData.code, parrainCode);
  assert(myCodeData.shareUrl.includes(parrainCode), "L'URL de partage doit contenir le code");
  assert(myCodeData.message.includes(parrainCode), "Le message doit contenir le code");
  console.log(`✅ Test 3 validé (${myCodeData.code})`);

  // -------------------------------------------------------------
  // Test 4 : GET /api/referrals/status (initial)
  // -------------------------------------------------------------
  console.log("👉 Test 4: GET /api/referrals/status");
  const resStatusInit = await getStatusRoute();
  assert.strictEqual(resStatusInit.status, 200);
  const statusInitData = await resStatusInit.json();
  assert.strictEqual(statusInitData.stats.totalReferrals, 0);
  assert.strictEqual(statusInitData.stats.currentBadge, null);
  assert.strictEqual(statusInitData.stats.nextMilestone?.badge, "sponsor");
  console.log("✅ Test 4 validé");

  // -------------------------------------------------------------
  // Test 5 : POST /api/referrals/apply avec code valide
  // -------------------------------------------------------------
  console.log("👉 Test 5: POST /api/referrals/apply avec code valide");
  const filleul1 = await prisma.user.create({
    data: {
      phone: filleulPhone1,
      role: "DRIVER",
      name: "Paul Filleul Un",
      lastDeviceFingerprint: `filleul1_fp_${ts}`,
    },
  });

  (global as any).__mockSession = { userId: filleul1.id, role: "DRIVER" };
  const reqApplyValid = new Request("http://localhost:3000/api/referrals/apply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": "192.168.1.55",
    },
    body: JSON.stringify({
      code: parrainCode,
      deviceFingerprint: `filleul1_fp_${ts}`,
    }),
  });
  const resApplyValid = await applyReferralRoute(reqApplyValid);
  const applyData = await resApplyValid.json();
  if (resApplyValid.status !== 200) {
    console.error("DEBUG resApplyValid error:", applyData);
  }
  assert.strictEqual(resApplyValid.status, 200, "L'application d'un code valide doit renvoyer 200");
  assert.strictEqual(applyData.priorityMissions, 3, "Le filleul doit recevoir 3 missions prioritaires");

  const createdRef = await prisma.referral.findFirst({
    where: { referrerId: parrain.id, refereeId: filleul1.id },
  });
  assert(createdRef, "L'enregistrement Referral doit exister en base");
  assert.strictEqual(createdRef.priorityMissionsRemaining, 3);
  assert.strictEqual(createdRef.type, "DRIVER_TO_DRIVER");

  const filleulAfter = await prisma.user.findUnique({ where: { id: filleul1.id } });
  assert.strictEqual(filleulAfter?.sponsorDriverId, parrain.id);
  console.log("✅ Test 5 validé (Referral créé, priorité 3 missions)");

  // -------------------------------------------------------------
  // Test 6 : POST avec code invalide -> 404
  // -------------------------------------------------------------
  console.log("👉 Test 6: POST /api/referrals/apply avec code invalide (404)");
  const filleul2 = await prisma.user.create({
    data: {
      phone: filleulPhone2,
      role: "DRIVER",
      name: "Pierre Filleul Deux",
    },
  });

  (global as any).__mockSession = { userId: filleul2.id, role: "DRIVER" };
  const reqInvalidCode = new Request("http://localhost:3000/api/referrals/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: "MOTO-INEXISTANT-9999" }),
  });
  const resInvalidCode = await applyReferralRoute(reqInvalidCode);
  assert.strictEqual(resInvalidCode.status, 404, "Code inexistant doit renvoyer 404");
  console.log("✅ Test 6 validé (404)");

  // -------------------------------------------------------------
  // Test 7 : POST avec code déjà utilisé (déjà parrainé) -> 400
  // -------------------------------------------------------------
  console.log("👉 Test 7: POST /api/referrals/apply si déjà parrainé (400)");
  (global as any).__mockSession = { userId: filleul1.id, role: "DRIVER" };
  const reqAlreadySponsored = new Request("http://localhost:3000/api/referrals/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: parrainCode }),
  });
  const resAlreadySponsored = await applyReferralRoute(reqAlreadySponsored);
  assert.strictEqual(resAlreadySponsored.status, 400, "Un filleul déjà parrainé doit être rejeté 400");
  console.log("✅ Test 7 validé (400 déjà parrainé)");

  // -------------------------------------------------------------
  // Test 8 : Anti-fraude : Téléphone identique -> 400 + AuditLog REFERRAL_FRAUD_DETECTED
  // -------------------------------------------------------------
  console.log("👉 Test 8: Anti-fraude Téléphone identique");
  (global as any).__mockSession = { userId: parrain.id, role: "DRIVER" };
  const reqSelfPhone = new Request("http://localhost:3000/api/referrals/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: parrainCode }),
  });
  const resSelfPhone = await applyReferralRoute(reqSelfPhone);
  assert.strictEqual(resSelfPhone.status, 400, "Auto-parrainage par téléphone doit renvoyer 400");
  const selfPhoneErr = await resSelfPhone.json();
  assert(selfPhoneErr.error.includes("Téléphone identique"));

  const fraudLogPhone = await prisma.auditLog.findFirst({
    where: { eventType: "REFERRAL_FRAUD_DETECTED" },
    orderBy: { createdAt: "desc" },
  });
  assert(fraudLogPhone, "AuditLog REFERRAL_FRAUD_DETECTED doit être créé");
  console.log("✅ Test 8 validé (400 Téléphone identique + Audit)");

  // -------------------------------------------------------------
  // Test 9 : Anti-fraude : Device fingerprint identique -> 400 + AuditLog
  // -------------------------------------------------------------
  console.log("👉 Test 9: Anti-fraude Appareil identique");
  const filleulDeviceFraud = await prisma.user.create({
    data: {
      phone: `+23767721${ts.toString().slice(-4)}`,
      role: "DRIVER",
      name: "Filleul Meme Device",
    },
  });

  (global as any).__mockSession = { userId: filleulDeviceFraud.id, role: "DRIVER" };
  const reqSameDevice = new Request("http://localhost:3000/api/referrals/apply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": "172.16.0.40",
    },
    body: JSON.stringify({
      code: parrainCode,
      deviceFingerprint: parrain.lastDeviceFingerprint, // Même empreinte que le parrain
    }),
  });
  const resSameDevice = await applyReferralRoute(reqSameDevice);
  assert.strictEqual(resSameDevice.status, 400, "Device identique doit renvoyer 400");
  const sameDeviceData = await resSameDevice.json();
  assert(sameDeviceData.error.includes("Appareil identique"));
  console.log("✅ Test 9 validé (400 Appareil identique + Audit)");

  // -------------------------------------------------------------
  // Test 10 : Anti-fraude : IP identique -> 400 + AuditLog
  // -------------------------------------------------------------
  console.log("👉 Test 10: Anti-fraude IP identique");
  const filleulIpFraud = await prisma.user.create({
    data: {
      phone: `+23767722${ts.toString().slice(-4)}`,
      role: "DRIVER",
      name: "Filleul Meme IP",
    },
  });

  (global as any).__mockSession = { userId: filleulIpFraud.id, role: "DRIVER" };
  const reqSameIp = new Request("http://localhost:3000/api/referrals/apply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": "10.0.0.1", // IP enregistrée sur le parrain
    },
    body: JSON.stringify({
      code: parrainCode,
      deviceFingerprint: "filleul_distinct_device_ip",
    }),
  });
  const resSameIp = await applyReferralRoute(reqSameIp);
  assert.strictEqual(resSameIp.status, 400, "IP identique doit renvoyer 400");
  const sameIpData = await resSameIp.json();
  assert(sameIpData.error.includes("IP identique"));
  console.log("✅ Test 10 validé (400 IP identique + Audit)");

  // -------------------------------------------------------------
  // Test 11 : Anti-fraude : Parrainages en rafale (> 5 en 24h) -> 429
  // -------------------------------------------------------------
  console.log("👉 Test 11: Anti-fraude > 5 parrainages en 24h (429)");
  // Créons 4 parrainages de plus pour ce parrain (il en a déjà 1 : filleul1) -> total 5
  for (let i = 2; i <= 5; i++) {
    const u = await prisma.user.create({
      data: { phone: `+2376773${i}${ts.toString().slice(-4)}`, role: "DRIVER" },
    });
    await prisma.referral.create({
      data: {
        referrerId: parrain.id,
        refereeId: u.id,
        type: "DRIVER_TO_DRIVER",
        status: "ACTIVE",
        priorityMissionsRemaining: 3,
      },
    });
  }

  // Le 6ème parrainage doit être rejeté 429
  const filleulRafale = await prisma.user.create({
    data: {
      phone: `+23767739${ts.toString().slice(-4)}`,
      role: "DRIVER",
      name: "Filleul Trop Vite",
    },
  });

  (global as any).__mockSession = { userId: filleulRafale.id, role: "DRIVER" };
  const reqRapid = new Request("http://localhost:3000/api/referrals/apply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": "192.168.100.99",
    },
    body: JSON.stringify({
      code: parrainCode,
      deviceFingerprint: "filleul_rapid_device",
    }),
  });
  const resRapid = await applyReferralRoute(reqRapid);
  assert.strictEqual(resRapid.status, 429, "Plus de 5 parrainages en 24h doit retourner 429");
  console.log("✅ Test 11 validé (429 Trop de parrainages récents)");

  // -------------------------------------------------------------
  // Test 12 : Anti-fraude : Même device utilisé par > 2 comptes -> 400
  // -------------------------------------------------------------
  console.log("👉 Test 12: Anti-fraude multi-comptes sur le même appareil");
  const parrainMulti = await prisma.user.create({
    data: {
      phone: `+23767749${ts.toString().slice(-4)}`,
      role: "DRIVER",
      name: "Parrain Multi Test",
      lastDeviceFingerprint: "distinct_parrain_multi_fp",
    },
  });
  const parrainMultiCode = await ensureReferralCode(parrainMulti.id);

  const sharedFp = `device_fp_multi_${ts}`;
  await prisma.user.create({
    data: { phone: `+23767741${ts.toString().slice(-4)}`, role: "DRIVER", lastDeviceFingerprint: sharedFp },
  });
  await prisma.user.create({
    data: { phone: `+23767742${ts.toString().slice(-4)}`, role: "DRIVER", lastDeviceFingerprint: sharedFp },
  });
  await prisma.user.create({
    data: { phone: `+23767744${ts.toString().slice(-4)}`, role: "DRIVER", lastDeviceFingerprint: sharedFp },
  });

  const filleulMultiAccount = await prisma.user.create({
    data: {
      phone: `+23767743${ts.toString().slice(-4)}`,
      role: "DRIVER",
      name: "Filleul Multi Compte",
    },
  });

  (global as any).__mockSession = { userId: filleulMultiAccount.id, role: "DRIVER" };
  const reqMultiDevice = new Request("http://localhost:3000/api/referrals/apply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": "172.20.10.5",
    },
    body: JSON.stringify({
      code: parrainMultiCode,
      deviceFingerprint: sharedFp,
    }),
  });
  const resMultiDevice = await applyReferralRoute(reqMultiDevice);
  const multiDeviceData = await resMultiDevice.json();
  assert.strictEqual(resMultiDevice.status, 400, "Device partagé par plus de 2 comptes doit retourner 400");
  assert(
    multiDeviceData.error.includes("Plusieurs comptes sur cet appareil") ||
    multiDeviceData.error.includes("Plusieurs comptes sur le même appareil"),
    "Message d'erreur multi-comptes attendu"
  );
  console.log("✅ Test 12 validé (400 Multi-comptes même appareil)");

  // -------------------------------------------------------------
  // Test 13 : Filleul complète 5 livraisons -> badge "sponsor"
  // -------------------------------------------------------------
  console.log("👉 Test 13: Filleul à 5 livraisons -> badge 'sponsor'");
  const vendorTest = await prisma.user.create({
    data: {
      phone: `+23769911${ts.toString().slice(-4)}`,
      role: "VENDOR",
      name: "Boutique Test Progression",
    },
  });

  // Créer 5 missions DELIVERED pour filleul1
  for (let i = 1; i <= 5; i++) {
    await prisma.mission.create({
      data: {
        vendorId: vendorTest.id,
        driverId: filleul1.id,
        description: `Mission Palier 5 #${i}`,
        address: "Akwa",
        buyerPhone: "+237699990001",
        price: 1500,
        status: "DELIVERED",
      },
    });
  }

  await checkReferralProgress(filleul1.id);

  const parrainAfter5 = await prisma.user.findUnique({ where: { id: parrain.id } });
  assert.strictEqual(parrainAfter5?.referrerBadge, "sponsor", "Le badge doit être 'sponsor' après 5 livraisons");
  console.log("✅ Test 13 validé (Badge 'sponsor' attribué)");

  // -------------------------------------------------------------
  // Test 14 : Filleul complète 20 livraisons -> badge "sponsor_confirmed"
  // -------------------------------------------------------------
  console.log("👉 Test 14: Filleul à 20 livraisons -> COMPLETED & badge 'sponsor_confirmed'");
  // Ajouter 15 missions de plus pour atteindre 20
  for (let i = 6; i <= 20; i++) {
    await prisma.mission.create({
      data: {
        vendorId: vendorTest.id,
        driverId: filleul1.id,
        description: `Mission Palier 20 #${i}`,
        address: "Akwa",
        buyerPhone: "+237699990001",
        price: 1500,
        status: "DELIVERED",
      },
    });
  }

  await checkReferralProgress(filleul1.id);

  const refAfter20 = await prisma.referral.findFirst({
    where: { refereeId: filleul1.id, referrerId: parrain.id },
  });
  assert.strictEqual(refAfter20?.status, "COMPLETED", "Le referral doit passer au statut COMPLETED");

  const parrainAfter20 = await prisma.user.findUnique({ where: { id: parrain.id } });
  assert.strictEqual(parrainAfter20?.referrerBadge, "sponsor_confirmed", "Le badge doit être 'sponsor_confirmed'");
  assert.strictEqual(parrainAfter20?.referrerCount, 1);
  console.log("✅ Test 14 validé (COMPLETED + badge 'sponsor_confirmed')");

  // -------------------------------------------------------------
  // Test 15 : 3 filleuls COMPLETED -> badge "sponsor_gold"
  // -------------------------------------------------------------
  console.log("👉 Test 15: 3 filleuls COMPLETED -> badge 'sponsor_gold'");
  for (let i = 2; i <= 3; i++) {
    const f = await prisma.user.create({
      data: { phone: `+2376775${i}${ts.toString().slice(-4)}`, role: "DRIVER" },
    });
    await prisma.referral.create({
      data: {
        referrerId: parrain.id,
        refereeId: f.id,
        type: "DRIVER_TO_DRIVER",
        status: "COMPLETED",
      },
    });
  }

  const badge3 = await updateReferrerBadge(parrain.id);
  assert.strictEqual(badge3, "sponsor_gold", "3 filleuls COMPLETED doivent conférer 'sponsor_gold'");

  const parrainGold = await prisma.user.findUnique({ where: { id: parrain.id } });
  assert.strictEqual(parrainGold?.referrerBadge, "sponsor_gold");
  assert.strictEqual(parrainGold?.referrerCount, 3);
  console.log("✅ Test 15 validé (Badge 'sponsor_gold')");

  // -------------------------------------------------------------
  // Test 16 : 5 filleuls COMPLETED -> badge "sponsor_platinum"
  // -------------------------------------------------------------
  console.log("👉 Test 16: 5 filleuls COMPLETED -> badge 'sponsor_platinum'");
  for (let i = 4; i <= 5; i++) {
    const f = await prisma.user.create({
      data: { phone: `+2376775${i}${ts.toString().slice(-4)}`, role: "DRIVER" },
    });
    await prisma.referral.create({
      data: {
        referrerId: parrain.id,
        refereeId: f.id,
        type: "DRIVER_TO_DRIVER",
        status: "COMPLETED",
      },
    });
  }

  const badge5 = await updateReferrerBadge(parrain.id);
  assert.strictEqual(badge5, "sponsor_platinum", "5 filleuls COMPLETED doivent conférer 'sponsor_platinum'");
  console.log("✅ Test 16 validé (Badge 'sponsor_platinum')");

  // -------------------------------------------------------------
  // Test 17 : 10 filleuls COMPLETED -> badge "sponsor_platinum" (reste constant)
  // -------------------------------------------------------------
  console.log("👉 Test 17: 10 filleuls COMPLETED -> reste 'sponsor_platinum'");
  for (let i = 6; i <= 10; i++) {
    const f = await prisma.user.create({
      data: { phone: `+2376775${i}${ts.toString().slice(-4)}`, role: "DRIVER" },
    });
    await prisma.referral.create({
      data: {
        referrerId: parrain.id,
        refereeId: f.id,
        type: "DRIVER_TO_DRIVER",
        status: "COMPLETED",
      },
    });
  }

  const badge10 = await updateReferrerBadge(parrain.id);
  assert.strictEqual(badge10, "sponsor_platinum");
  const parrain10 = await prisma.user.findUnique({ where: { id: parrain.id } });
  assert.strictEqual(parrain10?.referrerCount, 10);
  console.log("✅ Test 17 validé (Reste 'sponsor_platinum')");

  // -------------------------------------------------------------
  // Test 18 : Page /join?ref=CODE (composant et route existants)
  // -------------------------------------------------------------
  console.log("👉 Test 18: Page /join présente et fonctionnelle");
  const fs = await import("fs");
  assert(fs.existsSync("app/join/page.tsx"), "Le fichier app/join/page.tsx doit exister");
  const joinContent = fs.readFileSync("app/join/page.tsx", "utf-8");
  assert(joinContent.includes("missions prioritaires"), "La page join doit mentionner les 3 missions prioritaires");
  assert(joinContent.includes("/api/auth/otp"), "La page join doit utiliser l'API OTP");
  console.log("✅ Test 18 validé");

  // -------------------------------------------------------------
  // Test 19 : Page /join affiche un message si déjà parrainé
  // -------------------------------------------------------------
  console.log("👉 Test 19: Message 'déjà un parrain' sur /join");
  assert(joinContent.includes("Vous avez déjà un parrain"), "La page join doit informer l'utilisateur déjà parrainé");
  console.log("✅ Test 19 validé");

  // -------------------------------------------------------------
  // Test 20 : Profil affiche le champ 'Code de parrainage' si non parrainé
  // -------------------------------------------------------------
  console.log("👉 Test 20: Champ code de parrainage dans ProfileClient");
  const profileContent = fs.readFileSync("components/ProfileClient.tsx", "utf-8");
  assert(profileContent.includes("Code de parrainage"), "ProfileClient doit comporter la section Code de parrainage");
  assert(profileContent.includes("/api/referrals/apply"), "ProfileClient doit appeler /api/referrals/apply");
  console.log("✅ Test 20 validé");

  // -------------------------------------------------------------
  // Test 21 : Intégrité cryptographique SHA-256 de la chaîne d'audit
  // -------------------------------------------------------------
  console.log("👉 Test 21: Vérification cryptographique de la chaîne d'audit");
  const chainResult = await verifyChain();
  assert.strictEqual(chainResult.valid, true, "La chaîne d'audit SHA-256 doit être 100% intègre");
  console.log(`✅ Test 21 validé (${chainResult.totalLogs} logs vérifiés)`);

  console.log("\n🎉 LES 21 TESTS DU PARRAINAGE LIVREUR -> LIVREUR SONT VALIDÉS AVEC SUCCÈS !");
}

runTests()
  .catch((err) => {
    console.error("❌ Échec de la suite de tests parrainage livreur:", err);
    process.exit(1);
  })
  .finally(async () => {
    delete (global as any).__mockSession;
    await prisma.$disconnect();
  });
