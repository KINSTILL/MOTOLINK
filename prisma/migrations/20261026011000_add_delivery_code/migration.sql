-- Confirmation de commande par le vendeur + code de remise
-- (additif, idempotent, PostgreSQL 9.5+)
DO $$
DECLARE
  lbl TEXT;
BEGIN
  FOREACH lbl IN ARRAY ARRAY[
    'VENDOR_CALL_INITIATED',
    'VENDOR_ORDER_CONFIRMED',
    'BUYER_CONFIRMED',
    'DELIVERY_CODE_GENERATED',
    'DELIVERY_CODE_SENT',
    'DELIVERY_CODE_VERIFIED',
    'DELIVERY_CODE_FAILED'
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

-- Confirmation de commande
ALTER TABLE "Mission" ADD COLUMN "callInitiatedAt" TIMESTAMP(3);
ALTER TABLE "Mission" ADD COLUMN "callTarget" TEXT;
ALTER TABLE "Mission" ADD COLUMN "callMethod" TEXT;
ALTER TABLE "Mission" ADD COLUMN "buyerConfirmedAt" TIMESTAMP(3);
ALTER TABLE "Mission" ADD COLUMN "buyerConfirmedVia" TEXT;
ALTER TABLE "Mission" ADD COLUMN "buyerConfirmToken" TEXT;
CREATE UNIQUE INDEX "Mission_buyerConfirmToken_key" ON "Mission"("buyerConfirmToken");

-- Code de remise
ALTER TABLE "Mission" ADD COLUMN "deliveryCode" TEXT;
ALTER TABLE "Mission" ADD COLUMN "deliveryCodeSentAt" TIMESTAMP(3);
ALTER TABLE "Mission" ADD COLUMN "deliveryCodeVerifiedAt" TIMESTAMP(3);
ALTER TABLE "Mission" ADD COLUMN "deliveryCodeAttempts" INTEGER NOT NULL DEFAULT 0;
