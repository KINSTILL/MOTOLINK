-- N5 — Fiabilité client (additif, idempotent)
-- Compatible PostgreSQL 9.5+ (pas de ADD COLUMN IF NOT EXISTS)
ALTER TABLE "Mission" ADD COLUMN "buyerPhoneHash" TEXT;
ALTER TABLE "User" ADD COLUMN "showBuyerReliability" BOOLEAN NOT NULL DEFAULT false;

-- Enums (PostgreSQL < 12 ne supporte pas ADD VALUE IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'AuditEventType' AND e.enumlabel = 'RATING_SUBMITTED'
  ) THEN
    ALTER TYPE "AuditEventType" ADD VALUE 'RATING_SUBMITTED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'AuditEventType' AND e.enumlabel = 'SCORE_UPDATED'
  ) THEN
    ALTER TYPE "AuditEventType" ADD VALUE 'SCORE_UPDATED';
  END IF;
END $$;

-- Colonnes de notation mutuelle + scores
ALTER TABLE "Mission" ADD COLUMN "vendorRatedDriver" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Mission" ADD COLUMN "driverRatedVendor" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "city" TEXT;
ALTER TABLE "User" ADD COLUMN "driverScore" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "vendorScore" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "driverRatingCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "vendorRatingCount" INTEGER NOT NULL DEFAULT 0;
