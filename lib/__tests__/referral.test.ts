/**
 * MotoLink - Suite de tests : Parrainage Vendeur -> Livreur
 * 
 * Tests couverts (17/17) :
 * 1. Code parrainage unique généré (format MOTO-NOM-ANNEE)
 * 2. Invitation créée avec token unique et expiration à 7 jours
 * 3. Validation du numéro camerounais (+237 6XXXXXXXX)
 * 4. Rejet si vendeur non abonné (403)
 * 5. Rejet si livreur déjà inscrit (409)
 * 6. Rejet si invitation en attente existe déjà (409)
 * 7. Rate limit 10 invitations/jour/vendeur (429)
 * 8. Acceptation d'invitation : création compte livreur + abonnement offert + ajout flotte
 * 9. Disclaimer "pas employeur" présent dans l'invitation et sur la page
 * 10. Priorité 3 missions décrémentée à chaque mission avec ce vendeur
 * 11. Priorité non décrémentée pour les missions d'autres vendeurs
 * 12. Après 3 missions, le livreur reste dans la flotte mais sans priorité
 * 13. Désolidarisation livreur : suppression lien + arrêt priorité + passage abonnement propre
 * 14. Réduction vendeur : 1 livreur = 10%, 3 = 20%, 5 = 30%, 10 = 50%
 * 15. Réduction appliquée au paiement suivant puis marquée used
 * 16. Expiration invitation à 7 jours : statut "expired" + audit log
 * 17. Audit logs créés pour chaque action (7 types d'events) + intégrité SHA-256
 */

import assert from "assert";
import prisma from "../prisma";
import {
  generateReferralCode,
  generateInvitationToken,
  calculateReward,
  applyDiscount,
  usePriorityMission,
  expireStaleInvitations,
} from "../referral";
import { isValidCameroonPhone, normalizePhone } from "../utils";
import { POST as inviteDriverRoute } from "../../app/api/vendors/invite-driver/route";
import { POST as acceptInvitationRoute } from "../../app/api/invitations/[token]/accept/route";
import { POST as unsponsorRoute } from "../../app/api/drivers/unsponsor/route";
import { POST as createSubscriptionRoute } from "../../app/api/subscriptions/create/route";
import { renderNotificationTemplate } from "../notifications";
import { verifyChain } from "../audit";

async function runTests() {
  console.log("🚀 Exécution de la suite de tests : Parrainage Vendeur -> Livreur...");

  const ts = Date.now();
  const vendorPhone = `+23769944${ts.toString().slice(-4)}`;
  const otherVendorPhone = `+23769945${ts.toString().slice(-4)}`;
  const driverPhone1 = `+23767744${ts.toString().slice(-4)}`;
  const driverPhone2 = `+23767745${ts.toString().slice(-4)}`;

  // Vendeur de référence
  const vendor = await prisma.user.create({
    data: {
      phone: vendorPhone,
      role: "VENDOR",
      name: "Boutique Parrainage Akwa",
      shopName: "Quincaillerie Akwa",
      subscriptionStatus: "ACTIVE",
      acceptedCguAt: new Date(),
    },
  });

  // Autre vendeur pour vérifier la non-décrémentation des priorités
  const otherVendor = await prisma.user.create({
    data: {
      phone: otherVendorPhone,
      role: "VENDOR",
      name: "Autre Boutique Bonanjo",
      shopName: "Bonanjo Express",
      subscriptionStatus: "ACTIVE",
      acceptedCguAt: new Date(),
    },
  });

  // Abonnement actif pour le vendeur
  await prisma.subscription.create({
    data: {
      userId: vendor.id,
      role: "VENDOR",
      plan: "WEEKLY",
      status: "ACTIVE",
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      priceFCFA: 1000,
      pspRef: `notch_sub_${ts}`,
    },
  });

  // -------------------------------------------------------------
  // Test 1 : Code parrainage unique généré (format MOTO-NOM-ANNEE)
  // -------------------------------------------------------------
  console.log("👉 Test 1: Code parrainage unique format MOTO-NOM-ANNEE");
  const code1 = await generateReferralCode("Quincaillerie Akwa");
  const year = new Date().getFullYear();
  assert(code1.startsWith("MOTO-QUINCAILLE-") || code1.startsWith("MOTO-"), "Le code doit commencer par MOTO-");
  assert(code1.includes(year.toString()), "Le code doit inclure l'année courante");

  // Collision handling test
  await prisma.user.update({
    where: { id: vendor.id },
    data: { referralCode: code1 },
  });
  const codeCollision = await generateReferralCode("Quincaillerie Akwa");
  assert.notStrictEqual(codeCollision, code1, "La collision doit générer un code suffixé différent");
  console.log(`✅ Test 1 validé (${code1} vs ${codeCollision})`);

  // -------------------------------------------------------------
  // Test 2 : Token d'invitation unique (32 hex)
  // -------------------------------------------------------------
  console.log("👉 Test 2: Token d'invitation unique (32 hex)");
  const token1 = generateInvitationToken();
  const token2 = generateInvitationToken();
  assert.strictEqual(token1.length, 32, "Le token doit comporter 32 caractères hexadécimaux");
  assert.notStrictEqual(token1, token2, "Deux tokens générés consécutivement doivent être différents");
  console.log(`✅ Test 2 validé (${token1})`);

  // -------------------------------------------------------------
  // Test 3 : Validation du format de numéro camerounais (+237 6XXXXXXXX)
  // -------------------------------------------------------------
  console.log("👉 Test 3: Validation numéro camerounais");
  assert.strictEqual(isValidCameroonPhone(normalizePhone("+237670123456")), true);
  assert.strictEqual(isValidCameroonPhone(normalizePhone("+237 690 12 34 56")), true);
  assert.strictEqual(isValidCameroonPhone(normalizePhone("690123456")), true);
  assert.strictEqual(isValidCameroonPhone(normalizePhone("+33612345678")), false);
  assert.strictEqual(isValidCameroonPhone(normalizePhone("12345")), false);
  console.log("✅ Test 3 validé");

  // -------------------------------------------------------------
  // Test 4 : Rejet si vendeur non abonné (403)
  // -------------------------------------------------------------
  console.log("👉 Test 4: Rejet 403 si vendeur non abonné");
  const unSubVendor = await prisma.user.create({
    data: {
      phone: `+23769949${ts.toString().slice(-4)}`,
      role: "VENDOR",
      name: "Vendeur Sans Abonnement",
      subscriptionStatus: "NONE",
    },
  });

  (global as any).__mockSession = { userId: unSubVendor.id, role: "VENDOR" };
  const reqNoSub = new Request("http://localhost:3000/api/vendors/invite-driver", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      driverPhone: driverPhone1,
      driverName: "Paul Livreur",
      channel: "whatsapp",
    }),
  });
  const resNoSub = await inviteDriverRoute(reqNoSub);
  assert.strictEqual(resNoSub.status, 403, "Un vendeur sans abonnement doit être rejeté 403");
  console.log("✅ Test 4 validé (403)");

  // -------------------------------------------------------------
  // Test 5 : Rejet si livreur déjà inscrit (409)
  // -------------------------------------------------------------
  console.log("👉 Test 5: Rejet 409 si le livreur est déjà inscrit sur la plateforme");
  const existingDriver = await prisma.user.create({
    data: {
      phone: driverPhone2,
      role: "DRIVER",
      name: "Livreur Deja Existant",
      subscriptionStatus: "ACTIVE",
    },
  });

  (global as any).__mockSession = { userId: vendor.id, role: "VENDOR" };
  const reqAlreadyRegistered = new Request("http://localhost:3000/api/vendors/invite-driver", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      driverPhone: driverPhone2,
      driverName: "Paul Deja La",
      channel: "whatsapp",
    }),
  });
  const resAlreadyRegistered = await inviteDriverRoute(reqAlreadyRegistered);
  assert.strictEqual(resAlreadyRegistered.status, 409, "Un livreur déjà inscrit doit retourner 409");
  console.log("✅ Test 5 validé (409)");

  // -------------------------------------------------------------
  // Test 6 : Rejet si invitation en attente existe déjà (409)
  // -------------------------------------------------------------
  console.log("👉 Test 6: Rejet 409 si invitation en attente existe déjà pour ce numéro");
  const validInvitePhone = `+23767755${ts.toString().slice(-4)}`;

  const reqFirstInvite = new Request("http://localhost:3000/api/vendors/invite-driver", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      driverPhone: validInvitePhone,
      driverName: "Livreur A Inviter",
      channel: "whatsapp",
    }),
  });
  const resFirstInvite = await inviteDriverRoute(reqFirstInvite);
  assert.strictEqual(resFirstInvite.status, 201, "La première invitation doit réussir avec 201");
  const firstInviteData = await resFirstInvite.json();
  const createdToken = firstInviteData.token;

  const reqDuplicateInvite = new Request("http://localhost:3000/api/vendors/invite-driver", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      driverPhone: validInvitePhone,
      driverName: "Livreur Doublon",
      channel: "sms",
    }),
  });
  const resDuplicateInvite = await inviteDriverRoute(reqDuplicateInvite);
  assert.strictEqual(resDuplicateInvite.status, 409, "Une invitation déjà en cours doit être rejetée 409");
  console.log("✅ Test 6 validé (409 doublon)");

  // -------------------------------------------------------------
  // Test 7 : Rate limiting de 10 invitations par jour par vendeur (429)
  // -------------------------------------------------------------
  console.log("👉 Test 7: Rate limit 10 invitations/jour/vendeur");
  // On a déjà créé 1 invitation pour ce vendeur. Créons-en 9 autres pour atteindre la limite de 10.
  for (let i = 2; i <= 10; i++) {
    const dummyPhone = `+23767760${String(i).padStart(2, "0")}${ts.toString().slice(-2)}`;
    const req = new Request("http://localhost:3000/api/vendors/invite-driver", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        driverPhone: dummyPhone,
        driverName: `Livreur ${i}`,
        channel: "whatsapp",
      }),
    });
    const res = await inviteDriverRoute(req);
    assert.strictEqual(res.status, 201, `L'invitation #${i} devrait réussir`);
  }

  // 11ème invitation -> 429
  const overflowPhone = `+2376776099${ts.toString().slice(-2)}`;
  const reqOverflow = new Request("http://localhost:3000/api/vendors/invite-driver", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      driverPhone: overflowPhone,
      driverName: "Livreur Trop De Trop",
      channel: "whatsapp",
    }),
  });
  const resOverflow = await inviteDriverRoute(reqOverflow);
  assert.strictEqual(resOverflow.status, 429, "La 11ème invitation dans les 24h doit être bloquée avec 429");
  console.log("✅ Test 7 validé (429 rate limit)");

  // -------------------------------------------------------------
  // Test 8 : Acceptation d'invitation : création/liaison + abonnement offert + ajout flotte
  // -------------------------------------------------------------
  console.log("👉 Test 8: Acceptation d'invitation transactionnelle");
  // Créons le compte utilisateur associé à validInvitePhone (simulant l'onboarding rapide sur /invite/[token])
  const invitedUser = await prisma.user.create({
    data: {
      phone: validInvitePhone,
      role: "DRIVER",
      name: "Paul Nouveauté",
      kycStatus: "VERIFIED",
    },
  });

  (global as any).__mockSession = { userId: invitedUser.id, role: "DRIVER" };
  const reqAccept = new Request(`http://localhost:3000/api/invitations/${createdToken}/accept`, {
    method: "POST",
  });
  const resAccept = await acceptInvitationRoute(reqAccept, { params: { token: createdToken } });
  assert.strictEqual(resAccept.status, 200, "L'acceptation d'invitation doit retourner 200");

  const acceptedUser = await prisma.user.findUnique({
    where: { id: invitedUser.id },
  });
  assert.strictEqual(acceptedUser?.sponsorVendorId, vendor.id, "Le livreur doit être lié à son parrain");
  assert.strictEqual(acceptedUser?.subscriptionPaidBy, "vendor", "L'abonnement doit être marqué payé par le vendeur");

  const sponsoredSub = await prisma.subscription.findFirst({
    where: { userId: invitedUser.id, status: "ACTIVE" },
  });
  assert(sponsoredSub?.pspRef.startsWith("sponsored_"), "L'abonnement doit avoir un pspRef 'sponsored_'");

  const fleetRecord = await prisma.favoriteDriver.findFirst({
    where: { buyerId: vendor.id, driverId: invitedUser.id },
  });
  assert(fleetRecord, "Le livreur doit être dans la flotte du vendeur");
  assert.strictEqual(fleetRecord.source, "sponsored");
  assert.strictEqual(fleetRecord.priorityMissionsRemaining, 3);
  console.log("✅ Test 8 validé (Abonnement offert + Flotte source='sponsored' + 3 priorités)");

  // -------------------------------------------------------------
  // Test 9 : Disclaimer 'pas employeur' présent dans l'invitation
  // -------------------------------------------------------------
  console.log("👉 Test 9: Disclaimer 'pas employeur' dans les messages et notifications");
  const msgText = renderNotificationTemplate("vendor_invite", {
    driverName: "Paul",
    shopName: "Quincaillerie Akwa",
    link: "https://motolink.cm/invite/test",
  });
  assert(msgText.includes("n'est pas votre employeur"), "Le message doit stipuler explicitement l'absence de lien d'employeur");
  assert(msgText.includes("indépendant"), "Le message doit rappeler le statut de travailleur indépendant");
  console.log("✅ Test 9 validé");

  // -------------------------------------------------------------
  // Test 10 : Priorité 3 missions décrémentée à chaque mission avec ce vendeur
  // -------------------------------------------------------------
  console.log("👉 Test 10: Décrémentation de la priorité pour les missions du vendeur parrain");
  const mission1 = await prisma.mission.create({
    data: {
      vendorId: vendor.id,
      driverId: invitedUser.id,
      description: "Livraison matériaux Akwa",
      address: "Akwa Nord",
      buyerPhone: "+237699990001",
      price: 1500,
      status: "ACCEPTED",
    },
  });

  const usedSuccess = await usePriorityMission(invitedUser.id, mission1.id, vendor.id);
  assert.strictEqual(usedSuccess, true, "usePriorityMission doit renvoyer true");

  const referralAfterM1 = await prisma.referral.findFirst({
    where: { refereeId: invitedUser.id, referrerId: vendor.id },
  });
  assert.strictEqual(referralAfterM1?.priorityMissionsRemaining, 2, "Doit rester 2 missions prioritaires");
  assert.strictEqual(referralAfterM1?.priorityMissionsUsed, 1, "Doit avoir 1 mission prioritaire utilisée");

  const fleetAfterM1 = await prisma.favoriteDriver.findFirst({
    where: { buyerId: vendor.id, driverId: invitedUser.id },
  });
  assert.strictEqual(fleetAfterM1?.priorityMissionsRemaining, 2, "La flotte doit refléter 2 missions restantes");
  console.log("✅ Test 10 validé (Priorité 3 -> 2)");

  // -------------------------------------------------------------
  // Test 11 : Priorité non décrémentée pour les missions d'autres vendeurs
  // -------------------------------------------------------------
  console.log("👉 Test 11: Non-décrémentation pour mission avec un autre vendeur");
  const otherMission = await prisma.mission.create({
    data: {
      vendorId: otherVendor.id,
      driverId: invitedUser.id,
      description: "Livraison Bonanjo",
      address: "Bonanjo Centre",
      buyerPhone: "+237699990002",
      price: 2000,
      status: "ACCEPTED",
    },
  });

  const usedOther = await usePriorityMission(invitedUser.id, otherMission.id, otherVendor.id);
  assert.strictEqual(usedOther, false, "Une mission d'un autre vendeur ne doit pas consommer la priorité du parrain");

  const referralAfterOther = await prisma.referral.findFirst({
    where: { refereeId: invitedUser.id, referrerId: vendor.id },
  });
  assert.strictEqual(referralAfterOther?.priorityMissionsRemaining, 2, "Le compteur doit rester intact à 2");
  console.log("✅ Test 11 validé (Compteur intact)");

  // -------------------------------------------------------------
  // Test 12 : Après 3 missions, le livreur reste dans la flotte mais sans priorité
  // -------------------------------------------------------------
  console.log("👉 Test 12: Après 3 missions, reste dans la flotte avec priorité 0");
  await usePriorityMission(invitedUser.id, "mission_dummy_2", vendor.id);
  await usePriorityMission(invitedUser.id, "mission_dummy_3", vendor.id);

  const referralFinished = await prisma.referral.findFirst({
    where: { refereeId: invitedUser.id, referrerId: vendor.id },
  });
  assert.strictEqual(referralFinished?.priorityMissionsRemaining, 0);

  const fleetFinished = await prisma.favoriteDriver.findFirst({
    where: { buyerId: vendor.id, driverId: invitedUser.id },
  });
  assert(fleetFinished, "Le livreur doit toujours appartenir à la flotte");
  assert.strictEqual(fleetFinished.priorityMissionsRemaining, 0);
  console.log("✅ Test 12 validé (Flotte conservée, priorité 0)");

  // -------------------------------------------------------------
  // Test 13 : Désolidarisation livreur (unsponsor)
  // -------------------------------------------------------------
  console.log("👉 Test 13: Désolidarisation livreur (unsponsor)");
  (global as any).__mockSession = { userId: invitedUser.id, role: "DRIVER" };
  const reqUnsponsor = new Request("http://localhost:3000/api/drivers/unsponsor", {
    method: "POST",
  });
  const resUnsponsor = await unsponsorRoute();
  assert.strictEqual(resUnsponsor.status, 200, "La désolidarisation doit réussir 200");

  const unsponsoredDriver = await prisma.user.findUnique({
    where: { id: invitedUser.id },
  });
  assert.strictEqual(unsponsoredDriver?.sponsorVendorId, null, "sponsorVendorId doit être réinitialisé");
  assert.strictEqual(unsponsoredDriver?.subscriptionPaidBy, "self", "subscriptionPaidBy doit être 'self'");

  const cancelledFleet = await prisma.favoriteDriver.findFirst({
    where: { buyerId: vendor.id, driverId: invitedUser.id },
  });
  assert.strictEqual(cancelledFleet, null, "Le livreur doit être retiré de la flotte du vendeur");
  console.log("✅ Test 13 validé (Désolidarisation propre)");

  // -------------------------------------------------------------
  // Test 14 : Réductions vendeur cumulatives (1=10%, 3=20%, 5=30%, 10=50%)
  // -------------------------------------------------------------
  console.log("👉 Test 14: Barème de récompenses vendeur (10%, 20%, 30%, 50%)");
  const testVendorId = otherVendor.id;

  // 0 referral
  const r0 = await calculateReward(testVendorId, "VENDOR_TO_DRIVER");
  assert.strictEqual(r0.discountPercent, 0);
  assert.strictEqual(r0.nextTarget, 1);
  assert.strictEqual(r0.nextDiscount, 10);

  // 1 referral
  const ref1 = await prisma.user.create({ data: { phone: `+23767781${ts.toString().slice(-4)}`, role: "DRIVER" } });
  await prisma.referral.create({
    data: { referrerId: testVendorId, refereeId: ref1.id, type: "VENDOR_TO_DRIVER", status: "ACTIVE" },
  });
  const r1 = await calculateReward(testVendorId, "VENDOR_TO_DRIVER");
  assert.strictEqual(r1.discountPercent, 10);
  assert.strictEqual(r1.nextTarget, 3);
  assert.strictEqual(r1.nextDiscount, 20);

  // 3 referrals (ajouter 2)
  for (let i = 2; i <= 3; i++) {
    const u = await prisma.user.create({ data: { phone: `+2376778${i}${ts.toString().slice(-4)}`, role: "DRIVER" } });
    await prisma.referral.create({
      data: { referrerId: testVendorId, refereeId: u.id, type: "VENDOR_TO_DRIVER", status: "ACTIVE" },
    });
  }
  const r3 = await calculateReward(testVendorId, "VENDOR_TO_DRIVER");
  assert.strictEqual(r3.discountPercent, 20);
  assert.strictEqual(r3.nextTarget, 5);

  // 5 referrals (ajouter 2)
  for (let i = 4; i <= 5; i++) {
    const u = await prisma.user.create({ data: { phone: `+2376778${i}${ts.toString().slice(-4)}`, role: "DRIVER" } });
    await prisma.referral.create({
      data: { referrerId: testVendorId, refereeId: u.id, type: "VENDOR_TO_DRIVER", status: "ACTIVE" },
    });
  }
  const r5 = await calculateReward(testVendorId, "VENDOR_TO_DRIVER");
  assert.strictEqual(r5.discountPercent, 30);
  assert.strictEqual(r5.nextTarget, 10);

  // 10 referrals (ajouter 5)
  for (let i = 6; i <= 10; i++) {
    const u = await prisma.user.create({ data: { phone: `+2376778${i}${ts.toString().slice(-4)}`, role: "DRIVER" } });
    await prisma.referral.create({
      data: { referrerId: testVendorId, refereeId: u.id, type: "VENDOR_TO_DRIVER", status: "ACTIVE" },
    });
  }
  const r10 = await calculateReward(testVendorId, "VENDOR_TO_DRIVER");
  assert.strictEqual(r10.discountPercent, 50);
  assert.strictEqual(r10.nextTarget, 10);
  console.log("✅ Test 14 validé (0% -> 10% -> 20% -> 30% -> 50%)");

  // -------------------------------------------------------------
  // Test 15 : Réduction appliquée lors du paiement d'abonnement puis marquée used
  // -------------------------------------------------------------
  console.log("👉 Test 15: Réduction appliquée lors de l'abonnement Notch Pay");
  await applyDiscount(vendor.id, 20);

  const vendorBeforePayment = await prisma.user.findUnique({ where: { id: vendor.id } });
  assert.strictEqual(vendorBeforePayment?.referralDiscount, 20);
  assert.strictEqual(vendorBeforePayment?.referralDiscountUsed, false);

  (global as any).__mockSession = { userId: vendor.id, role: "VENDOR" };
  const reqSubCreate = new Request("http://localhost:3000/api/subscriptions/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan: "WEEKLY" }),
  });
  const resSubCreate = await createSubscriptionRoute(reqSubCreate);
  assert.strictEqual(resSubCreate.status, 201);
  const subCreatedData = await resSubCreate.json();

  // 1000 FCFA avec -20% = 800 FCFA
  assert.strictEqual(subCreatedData.subscription.priceFCFA, 800);

  const vendorAfterPayment = await prisma.user.findUnique({ where: { id: vendor.id } });
  assert.strictEqual(vendorAfterPayment?.referralDiscountUsed, true);
  console.log("✅ Test 15 validé (Prix réduit à 800 FCFA et referralDiscountUsed: true)");

  // -------------------------------------------------------------
  // Test 16 : Expiration des invitations à 7 jours + audit log
  // -------------------------------------------------------------
  console.log("👉 Test 16: Expiration automatique des invitations et log INVITATION_EXPIRED");
  const staleInvite = await prisma.invitation.create({
    data: {
      vendorId: vendor.id,
      driverPhone: `+23767701${ts.toString().slice(-4)}`,
      driverName: "Livreur En Retard",
      token: generateInvitationToken(),
      channel: "whatsapp",
      status: "pending",
      expiresAt: new Date(Date.now() - 3600 * 1000), // Expiré il y a 1h
    },
  });

  const expiredCount = await expireStaleInvitations();
  assert(expiredCount >= 1, "Au moins une invitation doit être expirée");

  const updatedStaleInvite = await prisma.invitation.findUnique({
    where: { id: staleInvite.id },
  });
  assert.strictEqual(updatedStaleInvite?.status, "expired");

  const expireAuditLog = await prisma.auditLog.findFirst({
    where: {
      eventType: "INVITATION_EXPIRED",
      entityId: staleInvite.vendorId,
    },
    orderBy: { createdAt: "desc" },
  });
  assert(expireAuditLog, "Un log INVITATION_EXPIRED doit avoir été créé");
  console.log("✅ Test 16 validé (Statut 'expired' + log INVITATION_EXPIRED)");

  // -------------------------------------------------------------
  // Test 17 : Audit logs créés pour chaque action + intégrité SHA-256
  // -------------------------------------------------------------
  console.log("👉 Test 17: Vérification des 7 types d'audit logs et de la chaîne SHA-256");
  const requiredEventTypes = [
    "INVITATION_SENT",
    "INVITATION_ACCEPTED",
    "REFERRAL_CREATED",
    "PRIORITY_MISSION_USED",
    "UNSPONSORED",
    "REFERRAL_REWARD_APPLIED",
    "INVITATION_EXPIRED",
  ];

  for (const eventType of requiredEventTypes) {
    const count = await prisma.auditLog.count({
      where: { eventType: eventType as any },
    });
    assert(count > 0, `Audit log attendu pour le type d'événement: ${eventType}`);
  }

  const isChainValid = await verifyChain();
  assert.strictEqual(isChainValid.valid, true, "La chaîne cryptographique d'audit doit être intègre");
  console.log("✅ Test 17 validé (7 types d'audit logs présents et chaîne SHA-256 intègre)");

  console.log("\n🎉 TOUS LES 17 TESTS DU PARRAINAGE VENDEUR -> LIVREUR SONT VALIDÉS AVEC SUCCÈS !");
}

runTests()
  .catch((err) => {
    console.error("❌ Échec de la suite de tests parrainage:", err);
    process.exit(1);
  })
  .finally(async () => {
    delete (global as any).__mockSession;
    await prisma.$disconnect();
  });
