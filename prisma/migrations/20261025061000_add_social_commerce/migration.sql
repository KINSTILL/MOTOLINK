-- Social commerce : favoris, propositions directes, priorités, paste intelligent
-- (additif, idempotent, PostgreSQL 9.5+)
DO $$
DECLARE
  lbl TEXT;
BEGIN
  FOREACH lbl IN ARRAY ARRAY[
    'PRIORITY_MISSION_USED',
    'UNSPONSORED',
    'DRAFT_CREATED_VIA_LINK',
    'DRAFT_CREATED_VIA_PASTE',
    'SMART_PASTE_SUCCESS',
    'SMART_PASTE_FAILED',
    'PUBLIC_SLUG_CREATED',
    'DRAFT_EXPIRED'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'AuditEventType' AND e.enumlabel = lbl
    ) THEN
      EXECUTE format('ALTER TYPE "AuditEventType" ADD VALUE %L', lbl);
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DirectProposalStatus') THEN
    CREATE TYPE "DirectProposalStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REFUSED', 'EXPIRED');
  END IF;
END $$;

-- ── User ────────────────────────────────────────────────────────────────
ALTER TABLE "User" ADD COLUMN "publicSlug" TEXT;
ALTER TABLE "User" ADD COLUMN "publicSlugCreatedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "subscriptionPaidBy" TEXT;
ALTER TABLE "User" ADD COLUMN "referralDiscount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "referralDiscountUsed" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "User_publicSlug_key" ON "User"("publicSlug");

-- ── Mission ─────────────────────────────────────────────────────────────
ALTER TABLE "Mission" ADD COLUMN "source" TEXT;
ALTER TABLE "Mission" ADD COLUMN "draftToken" TEXT;
ALTER TABLE "Mission" ADD COLUMN "submittedByBuyer" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "Mission_draftToken_key" ON "Mission"("draftToken");

-- ── FavoriteDriver ──────────────────────────────────────────────────────
CREATE TABLE "FavoriteDriver" (
  "id" TEXT NOT NULL,
  "buyerId" TEXT NOT NULL,
  "driverId" TEXT NOT NULL,
  "note" TEXT,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "priorityMissionsRemaining" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FavoriteDriver_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FavoriteDriver_buyerId_driverId_key" ON "FavoriteDriver"("buyerId", "driverId");
CREATE INDEX "FavoriteDriver_buyerId_idx" ON "FavoriteDriver"("buyerId");
CREATE INDEX "FavoriteDriver_driverId_idx" ON "FavoriteDriver"("driverId");
ALTER TABLE "FavoriteDriver"
  ADD CONSTRAINT "FavoriteDriver_buyerId_fkey"
  FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FavoriteDriver"
  ADD CONSTRAINT "FavoriteDriver_driverId_fkey"
  FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── DirectProposal ──────────────────────────────────────────────────────
CREATE TABLE "DirectProposal" (
  "id" TEXT NOT NULL,
  "missionId" TEXT NOT NULL,
  "buyerId" TEXT NOT NULL,
  "driverId" TEXT NOT NULL,
  "status" "DirectProposalStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "respondedAt" TIMESTAMP(3),
  CONSTRAINT "DirectProposal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DirectProposal_driverId_status_idx" ON "DirectProposal"("driverId", "status");
CREATE INDEX "DirectProposal_missionId_idx" ON "DirectProposal"("missionId");
ALTER TABLE "DirectProposal"
  ADD CONSTRAINT "DirectProposal_missionId_fkey"
  FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectProposal"
  ADD CONSTRAINT "DirectProposal_buyerId_fkey"
  FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectProposal"
  ADD CONSTRAINT "DirectProposal_driverId_fkey"
  FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── SmartPasteLog ───────────────────────────────────────────────────────
CREATE TABLE "SmartPasteLog" (
  "id" TEXT NOT NULL,
  "vendorId" TEXT NOT NULL,
  "rawText" TEXT NOT NULL,
  "jevResponse" JSONB,
  "status" TEXT NOT NULL,
  "missionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SmartPasteLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SmartPasteLog_vendorId_createdAt_idx" ON "SmartPasteLog"("vendorId", "createdAt");
ALTER TABLE "SmartPasteLog"
  ADD CONSTRAINT "SmartPasteLog_vendorId_fkey"
  FOREIGN KEY ("vendorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
