-- Livraisons programmées (additif, idempotent, PostgreSQL 9.5+)
DO $$
DECLARE
  lbl TEXT;
BEGIN
  FOREACH lbl IN ARRAY ARRAY[
    'MISSION_SCHEDULED',
    'MISSION_RESCHEDULED',
    'SCHEDULED_MISSION_CANCELLED',
    'SCHEDULED_MISSION_REMINDER_SENT'
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

ALTER TABLE "Mission" ADD COLUMN "scheduledAt" TIMESTAMP(3);
ALTER TABLE "Mission" ADD COLUMN "scheduledStatus" TEXT;
ALTER TABLE "Mission" ADD COLUMN "scheduledReminderDayBeforeSent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Mission" ADD COLUMN "scheduledReminderOneHourSent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Mission" ADD COLUMN "scheduledReminderDueSent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Mission" ADD COLUMN "scheduledCancelledReason" TEXT;

CREATE INDEX "Mission_scheduledAt_idx" ON "Mission"("scheduledAt");
