import fs from "fs";
const files = [
  "prisma/migrations/20261020220000_add_driver_referral_antifraud/migration.sql",
];
for (const f of files) {
  const s = fs.readFileSync(f, "utf8");
  const i = s.indexOf("NOT");
  console.log(f, "NOT at", i);
  console.log(JSON.stringify(s.slice(Math.max(0, i - 100), i + 120)));
}
