import { execSync } from "child_process";
import prisma from "../lib/prisma";

async function tableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = '${name}'`
  );
  return rows.length > 0;
}

async function main() {
  const steps: { name: string; check: () => Promise<boolean>; resolve?: boolean }[] = [
    { name: "20261020220000_add_driver_referral_antifraud", check: async () => tableExists("AuditLog") },
    { name: "20261021030000_add_mutual_rating", check: async () => tableExists("Rating") },
    { name: "20261021031000_add_buyer_reliability", check: async () => tableExists("Mission") },
    { name: "20261021040000_add_directory", check: async () => tableExists("DirectoryContactRequest") },
    { name: "20261021041000_add_directory", check: async () => tableExists("DirectoryContactRequest") },
    { name: "20261021050000_add_scheduled_missions", check: async () => tableExists("Mission") },
    { name: "20261021051000_add_scheduled_missions", check: async () => tableExists("Mission") },
    { name: "20261025060000_add_social_commerce", check: async () => tableExists("FavoriteDriver") },
    { name: "20261025061000_add_social_commerce", check: async () => tableExists("FavoriteDriver") },
    { name: "20261025120000_add_vendor_call_confirmation", check: async () => tableExists("Mission") },
    { name: "20261026010000_add_delivery_code", check: async () => tableExists("Mission") },
    { name: "20261026011000_add_delivery_code", check: async () => tableExists("Mission") },
    { name: "20261027010000_add_driver_calls", check: async () => tableExists("Mission") },
    { name: "20261027011000_add_driver_calls", check: async () => tableExists("Mission") },
    { name: "20261028010000_add_contract_pdf_and_audit_sequence", check: async () => tableExists("Mission"), resolve: false },
  ];

  for (const step of steps) {
    if (step.resolve === false) {
      continue;
    }
    const exists = await step.check();
    if (!exists) {
      console.log("MISSING PRE-REQ for", step.name);
      continue;
    }
    try {
      const out = execSync(
        `npx prisma migrate resolve --applied ${step.name}`,
        { encoding: "utf8" }
      );
      console.log("resolved:", step.name, "→", out.trim().split("\n").pop());
    } catch (e: any) {
      console.log("resolve failed:", step.name, e?.stdout ?? e?.message);
    }
  }

  process.exit(0);
}

main();

