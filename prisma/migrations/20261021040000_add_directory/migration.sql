-- AlterEnum
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'DIRECTORY_VISIBILITY_TOGGLED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'DIRECTORY_CONTACT_REQUESTED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'DIRECTORY_CONTACT_ACCEPTED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'DIRECTORY_CONTACT_REFUSED';

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "directoryVisible" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "directoryVisibleAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "workZones" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE IF NOT EXISTS "DirectoryContactRequest" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "driverNotifStatus" TEXT,
    "vendorNotifStatus" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DirectoryContactRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DirectoryContactRequest_driverId_status_idx" ON "DirectoryContactRequest"("driverId", "status");
CREATE INDEX IF NOT EXISTS "DirectoryContactRequest_vendorId_driverId_createdAt_idx" ON "DirectoryContactRequest"("vendorId", "driverId", "createdAt");

-- AddForeignKey
ALTER TABLE "DirectoryContactRequest" ADD CONSTRAINT "DirectoryContactRequest_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectoryContactRequest" ADD CONSTRAINT "DirectoryContactRequest_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

