import { PrismaClient, Role, MissionStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.warn("⚠️ Le script de seed est désactivé en environnement de production.");
    return;
  }

  console.log("🌱 Démarrage du seeding de développement MotoLink...");

  // 1. Vendeur de test
  const vendor = await prisma.user.upsert({
    where: { phone: "+237600000001" },
    update: {
      shopName: "Chic Cosmetics Douala",
      name: "Chic Cosmetics",
      role: Role.VENDOR,
      verified: true,
      brandingColorHex: "#2563eb",
    },
    create: {
      phone: "+237600000001",
      name: "Chic Cosmetics",
      shopName: "Chic Cosmetics Douala",
      role: Role.VENDOR,
      verified: true,
      brandingColorHex: "#2563eb",
    },
  });
  console.log(`✅ Vendeur prêt : ${vendor.shopName} (${vendor.phone})`);

  // 2. Livreur de test
  const driver = await prisma.user.upsert({
    where: { phone: "+237600000002" },
    update: {
      name: "Samuel N. (Livreur Moto)",
      role: Role.DRIVER,
      verified: true,
    },
    create: {
      phone: "+237600000002",
      name: "Samuel N. (Livreur Moto)",
      role: Role.DRIVER,
      verified: true,
    },
  });
  console.log(`✅ Livreur prêt : ${driver.name} (${driver.phone})`);

  // 3. Acheteur de test
  const buyer = await prisma.user.upsert({
    where: { phone: "+237600000003" },
    update: {
      name: "Amina K.",
      role: Role.BUYER,
    },
    create: {
      phone: "+237600000003",
      name: "Amina K.",
      role: Role.BUYER,
    },
  });
  console.log(`✅ Acheteur prêt : ${buyer.name} (${buyer.phone})`);

  // 4. Mission de test idempotente (ne crée pas de doublon si déjà présente)
  const existingMission = await prisma.mission.findFirst({
    where: {
      vendorId: vendor.id,
      buyerPhone: buyer.phone,
    },
  });

  if (!existingMission) {
    const mission = await prisma.mission.create({
      data: {
        vendorId: vendor.id,
        buyerPhone: buyer.phone,
        buyerName: buyer.name,
        address: "Rue Joffre, Akwa, Douala (Face Pharmacie)",
        description: "Coffret soin visage & parfum - Fragile",
        price: 2500.0,
        status: MissionStatus.CREATED,
      },
    });
    console.log(`✅ Mission de test créée : ID ${mission.id} (Status: ${mission.status})`);
  } else {
    console.log(`ℹ️ Mission de test déjà existante : ID ${existingMission.id}`);
  }

  // 5. Pack de 20 tickets idempotent (ne recrédite pas si déjà attribué)
  const existingTickets = await prisma.ticket.findFirst({
    where: { vendorId: vendor.id },
  });

  if (!existingTickets) {
    const ticket = await prisma.ticket.create({
      data: {
        vendorId: vendor.id,
        quantity: 20,
        used: 0,
      },
    });
    console.log(`✅ Pack de ${ticket.quantity} tickets attribué au vendeur (${vendor.shopName})`);
  } else {
    console.log(`ℹ️ Pack de tickets déjà présent (${existingTickets.quantity} tickets, ${existingTickets.used} utilisés)`);
  }

  console.log("🎉 Seeding terminé avec succès !");
}

main()
  .catch((e) => {
    console.error("❌ Erreur lors du seeding :", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
