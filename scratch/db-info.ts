import prisma from "../lib/prisma";

(async () => {
  const v = await prisma.$queryRawUnsafe("SELECT version() as v");
  console.log(v);
  const c = await prisma.$queryRawUnsafe(
    "SELECT column_name FROM information_schema.columns WHERE table_name='Referral'"
  );
  console.log("Referral cols:", c);
  const m = await prisma.$queryRawUnsafe(
    "SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at"
  );
  console.log("migrations:", m);
  process.exit(0);
})();
