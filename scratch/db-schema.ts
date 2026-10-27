import prisma from "../lib/prisma";

async function main() {
  const labels = await prisma.$queryRawUnsafe<any[]>(
    `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'AuditEventType'`
  );
  console.log("AuditEventType labels:", labels.map((l) => l.enumlabel));

  const userCols = await prisma.$queryRawUnsafe<any[]>(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'User'`
  );
  console.log(
    "User has cols:",
    ["driverSlug", "carnetVisible", "carnetZones", "generateContractPdf", "referrerBadge", "referrerCount"].map(
      (c) => `${c}=${userCols.some((x) => x.column_name === c)}`
    )
  );

  const missionCols = await prisma.$queryRawUnsafe<any[]>(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'Mission'`
  );
  console.log(
    "Mission has cols:",
    ["contractPdfUrl", "contractGeneratedAt", "contractHash", "driverCallBeforeDepartureAt", "buyerUnreachableNote"].map(
      (c) => `${c}=${missionCols.some((x) => x.column_name === c)}`
    )
  );

  const auditCols = await prisma.$queryRawUnsafe<any[]>(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'AuditLog'`
  );
  console.log(
    "AuditLog has cols:",
    ["sequence"].map((c) => `${c}=${auditCols.some((x) => x.column_name === c)}`)
  );

  const tables = await prisma.$queryRawUnsafe<any[]>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`
  );
  console.log("tables:", tables.map((t) => t.table_name));
  process.exit(0);
}

main();
