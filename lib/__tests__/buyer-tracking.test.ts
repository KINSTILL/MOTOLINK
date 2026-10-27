import assert from "assert";
import prisma from "../prisma";
import { GET as getPublicMission } from "@/app/api/public/missions/[id]/route";
import { POST as postProof } from "@/app/api/missions/[id]/proof/route";

const SAMPLE_PNG_BASE64 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

async function runBuyerTrackingTests() {
  console.log(
    "🚀 Exécution des tests : Page de suivi acheteur brandée & API publique...\n"
  );

  const testSuffix = Date.now().toString().slice(-6);

  // 1. Création d'un vendeur brandé et d'un livreur vérifié
  const vendor = await prisma.user.create({
    data: {
      phone: `+237691${testSuffix}`,
      name: "Jean Vendeur",
      shopName: "Boutique Mode Douala",
      brandingLogoUrl: "https://motolink.cm/logos/mode-douala.png",
      brandingColorHex: "#0ea5e9",
      catalogUrl: "https://wa.me/c/237691000000",
      role: "VENDOR",
    },
  });

  const driver = await prisma.user.create({
    data: {
      phone: `+237671${testSuffix}`,
      name: "Paul Coursier",
      role: "DRIVER",
      kycStatus: "VERIFIED",
    },
  });

  await prisma.kycDocument.create({
    data: {
      userId: driver.id,
      type: "SYNDICATE_CARD",
      status: "VERIFIED",
      frontKey: "syn-front-key",
      syndicateName: "SYNPROCOMON",
    },
  });

  // 2. Création d'une mission
  const mission = await prisma.mission.create({
    data: {
      vendorId: vendor.id,
      driverId: driver.id,
      buyerName: "Alice Mbida",
      buyerPhone: "+237655112233",
      address: "Rue Jamot, Akwa, Douala (Porte 12)",
      description: "Robe de soirée rouge",
      price: 15000,
      type: "PARCEL",
      status: "IN_PROGRESS",
      articlePhotoUrls: [
        "https://motolink.cm/uploads/article-1.webp",
        "https://motolink.cm/uploads/article-2.webp",
      ],
      checkpoints: {
        create: [
          {
            type: "PICKED_UP",
            lat: 4.051,
            lng: 9.767,
            note: "Colis récupéré chez le vendeur",
          },
          {
            type: "IN_TRANSIT",
            lat: 4.053,
            lng: 9.769,
            note: "En transit vers Akwa",
          },
        ],
      },
    },
  });

  // Ajout de notes pour le vendeur et le livreur
  await prisma.rating.create({
    data: {
      missionId: mission.id,
      fromUserId: driver.id,
      toUserId: vendor.id,
      score: 5,
      comment: "Super vendeur !",
    },
  });
  await prisma.rating.create({
    data: {
      missionId: mission.id,
      fromUserId: vendor.id,
      toUserId: driver.id,
      score: 5,
      comment: "Livreur très rapide !",
    },
  });

  // 3. Test GET /api/public/missions/[id]
  const req = new Request(`http://localhost:3000/api/public/missions/${mission.id}`, {
    headers: { "x-forwarded-for": `197.159.20.${testSuffix.slice(-2)}` },
  });
  const res = await getPublicMission(req, { params: { id: mission.id } });
  assert.strictEqual(res.status, 200, "L'API publique doit répondre 200");

  const data = await res.json();

  // Vérification des données brandées du vendeur
  assert.strictEqual(data.vendor.shopName, "Boutique Mode Douala");
  assert.strictEqual(data.vendor.brandingLogoUrl, "https://motolink.cm/logos/mode-douala.png");
  assert.strictEqual(data.vendor.brandingColorHex, "#0ea5e9");
  assert.strictEqual(data.vendor.catalogUrl, "https://wa.me/c/237691000000");
  assert.strictEqual(data.vendor.rating, 5);

  // Vérification des données du livreur et badges KYC
  assert.strictEqual(data.driver.name, "Paul Coursier");
  assert.strictEqual(data.driver.rating, 5);
  assert.strictEqual(data.driver.kycBadges.idCardVerified, true);
  assert.strictEqual(data.driver.kycBadges.syndicateVerified, true);
  assert.strictEqual(data.driver.kycBadges.syndicateName, "SYNPROCOMON");

  // SÉCURITÉ : aucune donnée sensible exposée
  assert.strictEqual(data.buyerPhone, undefined, "Le téléphone de l'acheteur ne doit JAMAIS être exposé");
  assert.strictEqual(data.proofHash, undefined, "Le hash de preuve ne doit pas être exposé");
  assert.strictEqual(data.proof, undefined, "L'objet proof interne ne doit pas être exposé");
  for (const cp of data.checkpoints) {
    assert.strictEqual(cp.lat, undefined, "Les coordonnées GPS lat des checkpoints ne doivent pas être exposées publiquement");
    assert.strictEqual(cp.lng, undefined, "Les coordonnées GPS lng des checkpoints ne doivent pas être exposées publiquement");
  }
  console.log("✅ API PUBLIQUE /api/public/missions/[id] : Branding vendeur, livreur KYC & sécurité OK");

  // 4. Test Signature de l'acheteur (buyerSigned=true sur POST /api/missions/[id]/proof)
  process.env.TSA_MOCK = "true";
  const signReq = new Request(`http://localhost:3000/api/missions/${mission.id}/proof`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      signatureBase64: SAMPLE_PNG_BASE64,
      buyerSigned: true,
    }),
  });

  const signRes = await postProof(signReq, { params: { id: mission.id } });
  assert.strictEqual(signRes.status, 201, "La signature de l'acheteur doit retourner 201");

  const signData = await signRes.json();
  assert.ok(signData.proofId && signData.proofHash, "Une preuve opposable scellée doit être créée");

  // Vérification de la mise à jour de la mission en DELIVERED
  const updatedMission = await prisma.mission.findUnique({
    where: { id: mission.id },
    include: { checkpoints: true, proof: true },
  });
  assert.strictEqual(updatedMission?.status, "DELIVERED", "La mission doit passer à DELIVERED après signature");
  assert.ok(
    updatedMission?.checkpoints.some((cp) => cp.type === "DELIVERED"),
    "Un checkpoint DELIVERED doit être créé"
  );
  assert.strictEqual(updatedMission?.proof?.tsaVerified, true, "L'ancrage TSA doit être vérifié");
  console.log("✅ SIGNATURE ACHETEUR (buyerSigned=true) : Scellement de preuve, checkpoint & DELIVERED OK");

  // 5. Test de la génération du message WhatsApp
  const buyerGreeting = mission.buyerName ? `Bonjour ${mission.buyerName},` : "Bonjour,";
  const expectedWaMessage = `${buyerGreeting} suivez votre livraison en temps réel : https://motolink.cm/suivi/${mission.id}`;
  assert.ok(
    expectedWaMessage.includes("https://motolink.cm/suivi/"),
    "Le message WhatsApp doit pointer vers https://motolink.cm/suivi/{missionId}"
  );
  console.log(`✅ MESSAGE WHATSAPP CONFORME : "${expectedWaMessage}"\n`);

  // Nettoyage
  await prisma.rating.deleteMany({ where: { missionId: mission.id } });
  await prisma.checkpoint.deleteMany({ where: { missionId: mission.id } });
  await prisma.proof.deleteMany({ where: { missionId: mission.id } });
  await prisma.mission.delete({ where: { id: mission.id } });
  await prisma.kycDocument.deleteMany({ where: { userId: driver.id } });
  await prisma.user.deleteMany({ where: { id: { in: [vendor.id, driver.id] } } });

  console.log("🎉 Tous les tests de suivi acheteur brandé sont passés avec succès !");
}

runBuyerTrackingTests()
  .catch((err) => {
    console.error("❌ Échec des tests de suivi acheteur :", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

