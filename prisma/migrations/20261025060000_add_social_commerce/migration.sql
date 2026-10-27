-- AlterEnum
ALTER TYPE "MissionStatus" ADD VALUE IF NOT EXISTS 'DRAFT';

-- AlterEnum AuditEventType
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'DRAFT_CREATED_VIA_LINK';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'DRAFT_CREATED_VIA_PASTE';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'SMART_PASTE_SUCCESS';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'SMART_PASTE_FAILED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'PUBLIC_SLUG_CREATED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'DRAFT_EXPIRED';

-- AlterTable User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "publicSlug" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "publicSlugCreatedAt" TIMESTAMP(3);

-- AlterTable Mission
ALTER TABLE "Mission" ADD COLUMN IF NOT EXISTS "source" TEXT;
ALTER TABLE "Mission" ADD COLUMN IF NOT EXISTS "draftToken" TEXT;
ALTER TABLE "Mission" ADD COLUMN IF NOT EXISTS "submittedByBuyer" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable SmartPasteLog
CREATE TABLE IF NOT EXISTS "SmartPasteLog" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "jevResponse" JSONB,
    "status" TEXT NOT NULL,
    "missionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmartPasteLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_publicSlug_key" ON "User"("publicSlug");
CREATE UNIQUE INDEX IF NOT EXISTS "Mission_draftToken_key" ON "Mission"("draftToken");
CREATE INDEX IF NOT EXISTS "SmartPasteLog_vendorId_createdAt_idx" ON "SmartPasteLog"("vendorId", "createdAt");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'SmartPasteLog_vendorId_fkey'
    ) THEN
        ALTER TABLE "SmartPasteLog" ADD CONSTRAINT "SmartPasteLog_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

