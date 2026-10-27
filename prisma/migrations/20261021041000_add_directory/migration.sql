-- Directory — annuaire des livreurs (additif, idempotent, PostgreSQL 9.5+)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'AuditEventType' AND e.enumlabel = 'DIRECTORY_VISIBILITY_TOGGLED'
  ) THEN
    ALTER TYPE "AuditEventType" ADD VALUE 'DIRECTORY_VISIBILITY_TOGGLED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'AuditEventType' AND e.enumlabel = 'DIRECTORY_CONTACT_REQUESTED'
  ) THEN
    ALTER TYPE "AuditEventType" ADD VALUE 'DIRECTORY_CONTACT_REQUESTED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'AuditEventType' AND e.enumlabel = 'DIRECTORY_CONTACT_ACCEPTED'
  ) THEN
    ALTER TYPE "AuditEventType" ADD VALUE 'DIRECTORY_CONTACT_ACCEPTED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'AuditEventType' AND e.enumlabel = 'DIRECTORY_CONTACT_REFUSED'
  ) THEN
    ALTER TYPE "AuditEventType" ADD VALUE 'DIRECTORY_CONTACT_REFUSED';
  END IF;
END $$;

ALTER TABLE "User" ADD COLUMN "directoryVisible" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "directoryVisibleAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "workZones" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "DirectoryContactRequest" (
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

CREATE INDEX "DirectoryContactRequest_driverId_status_idx" ON "DirectoryContactRequest"("driverId", "status");
CREATE INDEX "DirectoryContactRequest_vendorId_driverId_createdAt_idx" ON "DirectoryContactRequest"("vendorId", "driverId", "createdAt");

ALTER TABLE "DirectoryContactRequest"
  ADD CONSTRAINT "DirectoryContactRequest_vendorId_fkey"
  FOREIGN KEY ("vendorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectoryContactRequest"
  ADD CONSTRAINT "DirectoryContactRequest_driverId_fkey"
  FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
