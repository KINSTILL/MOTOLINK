-- N3 — Appels livreur + client absent (additif, idempotent, PostgreSQL 9.5+)
DO $$
DECLARE
  lbl TEXT;
BEGIN
  FOREACH lbl IN ARRAY ARRAY[
    'DRIVER_CALL_INITIATED_BEFORE_DEPARTURE',
    'DRIVER_CALL_INITIATED_AT_ARRIVAL',
    'BUYER_UNREACHABLE_REPORTED'
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

ALTER TABLE "Mission" ADD COLUMN "driverCallBeforeDepartureAt" TIMESTAMP(3);
ALTER TABLE "Mission" ADD COLUMN "driverCallBeforeDepartureMethod" TEXT;
ALTER TABLE "Mission" ADD COLUMN "driverCallAtArrivalAt" TIMESTAMP(3);
ALTER TABLE "Mission" ADD COLUMN "driverCallAtArrivalMethod" TEXT;
ALTER TABLE "Mission" ADD COLUMN "buyerUnreachableAt" TIMESTAMP(3);
ALTER TABLE "Mission" ADD COLUMN "buyerUnreachablePhoto" TEXT;
ALTER TABLE "Mission" ADD COLUMN "buyerUnreachableNote" TEXT;
