import prisma from "../../lib/prisma";
import { generateReferralCode } from "../../lib/referral";

/**
 * Script réutilisable pour générer automatiquement les codes de parrainage
 * pour tous les livreurs (role = DRIVER) n'ayant pas encore de code unique.
 */
export async function generateDriverReferralCodes(): Promise<{ totalDrivers: number; codesGenerated: number }> {
  console.log("🔄 Recherche des livreurs sans code de parrainage...");

  const drivers = await prisma.user.findMany({
    where: {
      role: "DRIVER",
      referralCode: null,
    },
    select: {
      id: true,
      name: true,
      phone: true,
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`📋 ${drivers.length} livreur(s) éligible(s) sans code.`);
  let count = 0;

  for (const driver of drivers) {
    const displayName = driver.name || "LIVREUR";
    const code = await generateReferralCode(displayName);

    await prisma.user.update({
      where: { id: driver.id },
      data: {
        referralCode: code,
        referralCodeGeneratedAt: new Date(),
      },
    });

    count++;
    console.log(`✅ [${count}/${drivers.length}] ${displayName} (${driver.phone}) -> ${code}`);
  }

  console.log(`🎉 Terminé : ${count} code(s) de parrainage attribué(s).`);
  return {
    totalDrivers: drivers.length,
    codesGenerated: count,
  };
}

if (require.main === module) {
  generateDriverReferralCodes()
    .then(() => prisma.$disconnect())
    .catch((err) => {
      console.error("❌ Erreur lors de la génération des codes:", err);
      prisma.$disconnect().then(() => process.exit(1));
    });
}

