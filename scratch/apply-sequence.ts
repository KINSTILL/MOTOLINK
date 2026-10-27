import { readFileSync } from "fs";
import prisma from "../lib/prisma";

async function main() {
  const sql = readFileSync(
    "prisma/migrations/20261028010000_add_contract_pdf_and_audit_sequence/migration.sql",
    "utf8"
  );

  // 1. Marque la migration comme non appliquée (suppression de la ligne)
  await prisma.$executeRawUnsafe(
    `DELETE FROM _prisma_migrations WHERE migration_name = '20261028010000_add_contract_pdf_and_audit_sequence'`
  );

  // 2. Exécute uniquement le bloc AuditLog sequence (le reste est déjà présent en base)
  const start = sql.indexOf("DO $$");
  const block = sql.slice(start);

  const statements = [
    `CREATE SEQUENCE "AuditLog_sequence_seq"`,
    `ALTER TABLE "AuditLog" ADD COLUMN "sequence" INTEGER`,
    `UPDATE "AuditLog" a SET "sequence" = sub.rn FROM (SELECT id, row_number() OVER (ORDER BY "createdAt" ASC, id ASC) AS rn FROM "AuditLog") sub WHERE a.id = sub.id`,
    `ALTER TABLE "AuditLog" ALTER COLUMN "sequence" SET DEFAULT nextval('"AuditLog_sequence_seq"')`,
    `ALTER TABLE "AuditLog" ALTER COLUMN "sequence" SET NOT NULL`,
    `SELECT setval('"AuditLog_sequence_seq"', COALESCE((SELECT MAX("sequence") FROM "AuditLog"), 0) + 1, false)`,
    `CREATE UNIQUE INDEX "AuditLog_sequence_key" ON "AuditLog"("sequence")`,
  ];

  for (const s of statements) {
    try {
      await prisma.$executeRawUnsafe(s);
      console.log("OK:", s.slice(0, 70));
    } catch (e: any) {
      console.log("SKIP:", s.slice(0, 70), "→", e?.message?.split("\n").pop());
    }
  }

  console.log("Block length:", block.length);
  process.exit(0);
}

main();
