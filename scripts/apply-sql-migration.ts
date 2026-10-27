/**
 * Applique un fichier migration.sql (instructions séparées par une ligne vide)
 * via Prisma, instruction par instruction.
 *
 * Utile quand `prisma migrate dev` n'est pas utilisable (ex : PostgreSQL 9.5 local,
 * ALTER TYPE ... ADD VALUE hors transaction).
 *
 * Usage : npx tsx scripts/apply-sql-migration.ts <nom_du_dossier_de_migration>
 */
import fs from "fs";
import path from "path";
import prisma from "../lib/prisma";

async function main() {
  const folder = process.argv[2];
  if (!folder) {
    console.error("Usage : tsx scripts/apply-sql-migration.ts <dossier_de_migration>");
    process.exit(1);
  }

  const file = path.join(process.cwd(), "prisma", "migrations", folder, "migration.sql");
  const sql = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");

  const statements = sql
    .split(/\n\s*\n/)
    .map((chunk) =>
      chunk
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim()
    )
    .filter((stmt) => stmt.length > 0);

  for (const stmt of statements) {
    await prisma.$executeRawUnsafe(stmt);
    console.log("✅", stmt.slice(0, 90).replace(/\s+/g, " "));
  }

  console.log(`\n🎉 ${statements.length} instruction(s) appliquée(s) depuis ${folder}`);
}

main()
  .catch((err) => {
    console.error("❌ Échec de la migration :", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

