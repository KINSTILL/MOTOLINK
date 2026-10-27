import prisma from "../lib/prisma";

async function main() {
  const labels = await prisma.$queryRawUnsafe<any[]>(
    `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'AuditEventType'`
  );
  console.log("count:", labels.length);
  console.log(labels.map((l) => l.enumlabel).join(","));
  process.exit(0);
}

main();
