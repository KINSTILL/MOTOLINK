-- Confirmation de commande par le vendeur (appel / WhatsApp) + confirmation acheteur
-- Migration additive : aucune donnée existante n'est modifiée.
-- Chaque instruction est séparée par une ligne vide (utilisé par scripts/apply-sql-migration.ts).
-- Compatible PostgreSQL 9.5+ (pas de ADD COLUMN IF NOT EXISTS).

-- AlterEnum AuditEventType
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'VENDOR_CALL_INITIATED';

ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'VENDOR_ORDER_CONFIRMED';

ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'BUYER_CONFIRMED';

-- AlterTable Mission
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Mission' AND column_name = 'callInitiatedAt') THEN ALTER TABLE "Mission" ADD COLUMN "callInitiatedAt" TIMESTAMP(3); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Mission' AND column_name = 'callTarget') THEN ALTER TABLE "Mission" ADD COLUMN "callTarget" TEXT; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Mission' AND column_name = 'callMethod') THEN ALTER TABLE "Mission" ADD COLUMN "callMethod" TEXT; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Mission' AND column_name = 'buyerConfirmedAt') THEN ALTER TABLE "Mission" ADD COLUMN "buyerConfirmedAt" TIMESTAMP(3); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Mission' AND column_name = 'buyerConfirmedVia') THEN ALTER TABLE "Mission" ADD COLUMN "buyerConfirmedVia" TEXT; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Mission' AND column_name = 'buyerConfirmToken') THEN ALTER TABLE "Mission" ADD COLUMN "buyerConfirmToken" TEXT; END IF; END $$;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Mission_buyerConfirmToken_key" ON "Mission"("buyerConfirmToken");

