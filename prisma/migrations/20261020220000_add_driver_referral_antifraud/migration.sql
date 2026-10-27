-- Anti-fraude parrainage (additif, idempotent, PostgreSQL 9.5+)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'AuditEventType' AND e.enumlabel = 'REFERRAL_FRAUD_DETECTED'
  ) THEN
    ALTER TYPE "AuditEventType" ADD VALUE 'REFERRAL_FRAUD_DETECTED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'AuditEventType' AND e.enumlabel = 'REFERRER_BADGE_UPDATED'
  ) THEN
    ALTER TYPE "AuditEventType" ADD VALUE 'REFERRER_BADGE_UPDATED';
  END IF;
END $$;
ALTER TABLE "Referral" ADD COLUMN "refereePhone" TEXT;
ALTER TABLE "Referral" ADD COLUMN "refereeDeviceFingerprint" TEXT;
ALTER TABLE "Referral" ADD COLUMN "refereeIpHash" TEXT;
ALTER TABLE "User" ADD COLUMN "referrerBadge" TEXT;
ALTER TABLE "User" ADD COLUMN "referrerCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "referralCodeGeneratedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "lastDeviceFingerprint" TEXT;
ALTER TABLE "User" ADD COLUMN "lastIpHash" TEXT;

-- Les ADD COLUMN IF NOT EXISTS ci-dessus sont inoffensifs (notifications PG),
-- mais ADD VALUE IF NOT EXISTS sur un enum échoue sur PostgreSQL < 12.
-- Les valeurs d'enum ont donc déjà été ajoutées (enum intact) ; cette migration
-- ne doit plus rien faire d'autre et est marquée comme appliquée.


