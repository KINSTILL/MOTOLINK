-- N8 v2 — Délai négocié (acheteur ↔ vendeur) + acceptation explicite (livreur) + ponctualité
-- (additif, idempotent, PostgreSQL 9.5+)

-- ── Enums AuditEventType (additif, compatible PG < 12) ─────────────────
DO $$
DECLARE
  lbl TEXT;
BEGIN
  FOREACH lbl IN ARRAY ARRAY[
    'BUYER_DURATION_AGREED',
    'DRIVER_ACCEPTED_DURATION',
    'DRIVER_REFUSED_DURATION',
    'DELIVERY_ON_TIME',
    'DELIVERY_LATE'
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

-- ── Mission : délai estimé / réel (tous nullables) ─────────────────────
ALTER TABLE "Mission" ADD COLUMN "distanceKm" FLOAT;
ALTER TABLE "Mission" ADD COLUMN "estimatedDurationMinutes" INTEGER;
ALTER TABLE "Mission" ADD COLUMN "actualDurationMinutes" INTEGER;
ALTER TABLE "Mission" ADD COLUMN "deliveryOnTime" BOOLEAN;
ALTER TABLE "Mission" ADD COLUMN "pickedUpAt" TIMESTAMP(3);
ALTER TABLE "Mission" ADD COLUMN "buyerAgreedDurationAt" TIMESTAMP(3);
ALTER TABLE "Mission" ADD COLUMN "driverAcceptedDuration" BOOLEAN;
ALTER TABLE "Mission" ADD COLUMN "driverAcceptedDurationAt" TIMESTAMP(3);

-- ── User : compteurs de ponctualité ────────────────────────────────────
ALTER TABLE "User" ADD COLUMN "onTimeCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "lateCount" INTEGER NOT NULL DEFAULT 0;
