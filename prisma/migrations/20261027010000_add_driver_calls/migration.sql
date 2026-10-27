-- AlterEnum AuditEventType (additive)
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'DRIVER_CALL_INITIATED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'DRIVER_CALL_INITIATED_BEFORE_DEPARTURE';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'DRIVER_CALL_INITIATED_AT_ARRIVAL';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'BUYER_UNREACHABLE_REPORTED';

-- AlterTable Mission (additive, tous optionnels / nullable)
ALTER TABLE "Mission" ADD COLUMN "driverCallBeforeDepartureAt" TIMESTAMP(3);
ALTER TABLE "Mission" ADD COLUMN "driverCallBeforeDepartureMethod" TEXT;
ALTER TABLE "Mission" ADD COLUMN "driverCallAtArrivalAt" TIMESTAMP(3);
ALTER TABLE "Mission" ADD COLUMN "driverCallAtArrivalMethod" TEXT;
ALTER TABLE "Mission" ADD COLUMN "buyerUnreachableAt" TIMESTAMP(3);
ALTER TABLE "Mission" ADD COLUMN "buyerUnreachablePhoto" TEXT;
ALTER TABLE "Mission" ADD COLUMN "buyerUnreachableNote" TEXT;
