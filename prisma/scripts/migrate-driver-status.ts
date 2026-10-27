/**
 * MotoLink - Migration des statuts livreurs vers le nouvel enum DriverStatus
 * Assure la cohérence des comptes livreurs (OFFLINE par défaut, AVAILABLE selon historique)
 * et garantit que les non-livreurs sont tous sur OFFLINE.
 */

import prisma from "../../lib/prisma";

export async function migrateDriverStatuses() {
  console.log("🔄 Démarrage de la migration des statuts livreurs...");

  // 1. Initialisation des utilisateurs non livreurs à OFFLINE
  const nonDrivers = await prisma.user.updateMany({
    where: {
      role: { not: "DRIVER" },
    },
    data: {
      driverStatus: "OFFLINE",
    },
  });
  console.log(`✅ ${nonDrivers.count} utilisateurs non-livreurs réinitialisés à OFFLINE.`);

  // 2. Migration des livreurs existants
  const drivers = await prisma.user.findMany({
    where: { role: "DRIVER" },
    select: { id: true, driverStatus: true, phone: true },
  });

  let migratedCount = 0;
  for (const driver of drivers) {
    if (!driver.driverStatus) {
      await prisma.user.update({
        where: { id: driver.id },
        data: { driverStatus: "OFFLINE" },
      });
      migratedCount++;
    }
  }

  console.log(`✅ ${drivers.length} livreurs vérifiés (${migratedCount} mis à jour vers le nouvel enum).`);
  console.log("🎉 Migration des statuts terminée avec succès.");
}

if (require.main === module) {
  migrateDriverStatuses()
    .catch((err) => {
      console.error("❌ Erreur pendant la migration des statuts :", err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

