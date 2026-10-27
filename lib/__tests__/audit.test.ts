import assert from "assert";
import prisma from "../prisma";
import { computeAuditHash, GENESIS_HASH, logEvent, verifyChain } from "../audit";

async function runAuditChainTests() {
  console.log(
    "🚀 Exécution des tests : Journal d'audit append-only avec chaînage cryptographique SHA-256...\n"
  );

  // Nettoyage initial des logs de test précédents pour tester une chaîne propre de 5 logs
  await prisma.auditLog.deleteMany({});

  // 1. Insertion de 5 logs via logEvent
  await logEvent("KYC_SUBMITTED", "KYC", "kyc-doc-001", "driver-001", {
    actorIp: "197.159.22.10",
    actorRole: "DRIVER",
  });
  await logEvent("KYC_VALIDATED", "KYC", "kyc-doc-001", "admin-001", {
    actorIp: "197.159.22.11",
    actorRole: "ADMIN",
  });
  await logEvent("MISSION_STATUS_CHANGED", "MISSION", "mission-001", "driver-001", {
    previousStatus: "CREATED",
    newStatus: "ACCEPTED",
    actorIp: "197.159.22.10",
  });
  await logEvent("PROOF_CREATED", "PROOF", "proof-001", "driver-001", {
    missionId: "mission-001",
    actorIp: "197.159.22.10",
  });
  await logEvent("PROOF_VERIFIED", "PROOF", "proof-001", null, {
    public: true,
    actorIp: "41.202.207.55",
  });

  const logs = await prisma.auditLog.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  assert.strictEqual(logs.length, 5, "La chaîne doit contenir exactement 5 logs");
  assert.strictEqual(
    logs[0].previousHash,
    GENESIS_HASH,
    "Le 1er log doit pointer sur GENESIS"
  );

  for (let i = 1; i < logs.length; i++) {
    assert.strictEqual(
      logs[i].previousHash,
      logs[i - 1].currentHash,
      `Le maillon #${i + 1} doit référencer currentHash du maillon #${i}`
    );
  }

  // 2. Vérification de la chaîne de 5 logs -> valid = true
  const checkValid = await verifyChain();
  assert.strictEqual(checkValid.valid, true, "La chaîne de 5 logs doit être valide");
  assert.strictEqual(checkValid.brokenAt, undefined);
  assert.strictEqual(checkValid.totalLogs, 5);
  console.log(
    `✅ CHAÎNE DE 5 LOGS VALIDE : valid=${checkValid.valid}, totalLogs=${checkValid.totalLogs}`
  );

  // 3. Altération manuelle du maillon #3 en base -> verifyChain doit retourner valid=false, brokenAt=targetLog.id
  const targetLog = logs[2]; // 3e log (MISSION_STATUS_CHANGED)
  await prisma.auditLog.update({
    where: { id: targetLog.id },
    data: {
      entityId: "mission-tampered-999",
    },
  });

  const checkBroken = await verifyChain();
  assert.strictEqual(
    checkBroken.valid,
    false,
    "verifyChain doit détecter la modification manuelle d'un log"
  );
  assert.strictEqual(
    checkBroken.brokenAt,
    targetLog.id,
    `brokenAt doit pointer exactement sur le log altéré (${targetLog.id})`
  );
  console.log(
    `✅ DÉTECTION D'ALTÉRATION MANUELLE : valid=${checkBroken.valid}, brokenAt=${checkBroken.brokenAt}`
  );

  // 4. Restauration du maillon #3 et vérification que la chaîne redevient valide
  await prisma.auditLog.update({
    where: { id: targetLog.id },
    data: {
      entityId: "mission-001",
      currentHash: computeAuditHash({
        previousHash: targetLog.previousHash,
        id: targetLog.id,
        eventType: targetLog.eventType,
        entityId: "mission-001",
        actorId: targetLog.actorId,
        createdAt: targetLog.createdAt,
      }),
    },
  });

  const checkRestored = await verifyChain();
  assert.strictEqual(
    checkRestored.valid,
    true,
    "La chaîne restaurée doit être de nouveau valide"
  );
  console.log(
    `✅ CHAÎNE RESTAURÉE & INTÈGRE : valid=${checkRestored.valid}, totalLogs=${checkRestored.totalLogs}\n`
  );

  console.log("🎉 Tous les tests du journal d'audit chaîné SHA-256 sont passés avec succès !");
}

runAuditChainTests()
  .catch((err) => {
    console.error("❌ Échec des tests d'audit :", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

