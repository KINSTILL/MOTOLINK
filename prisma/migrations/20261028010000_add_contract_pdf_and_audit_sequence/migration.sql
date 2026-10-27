-- Carnet de bord public (N6) + Contrat PDF de livraison (N7)
-- (additif, idempotent, PostgreSQL 9.5+)

-- ── N6 : Carnet de bord public ─────────────────────────────────────────
ALTER TABLE "User" ADD COLUMN "driverSlug" TEXT;
ALTER TABLE "User" ADD COLUMN "carnetVisible" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "carnetZones" TEXT;
CREATE UNIQUE INDEX "User_driverSlug_key" ON "User"("driverSlug");

-- ── Enums AuditEventType (N6 + N7) ─────────────────────────────────────
DO $$
DECLARE
  lbl TEXT;
BEGIN
  FOREACH lbl IN ARRAY ARRAY[
    'CARNET_VISIBILITY_TOGGLED',
    'CARNET_VIEWED',
    'CONTRACT_PDF_GENERATED',
    'CONTRACT_PDF_FAILED',
    'CONTRACT_PDF_DOWNLOADED'
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

-- ── N7 : Contrat PDF de livraison ──────────────────────────────────────
ALTER TABLE "User" ADD COLUMN "generateContractPdf" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Mission" ADD COLUMN "contractPdfUrl" TEXT;
ALTER TABLE "Mission" ADD COLUMN "contractGeneratedAt" TIMESTAMP(3);
ALTER TABLE "Mission" ADD COLUMN "contractHash" TEXT;

-- ── AuditLog : séquence d'append strictement monotone ──────────────────
-- Le chaînage utilisait auparavant (createdAt DESC, id DESC) comme « dernier maillon ».
-- Deux logs écrits dans la même milliseconde pouvaient alors chaîner sur le même
-- previousHash (fourche de chaîne). La séquence rend l'ordre d'append canonique.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'AuditLog' AND column_name = 'sequence'
  ) THEN
    CREATE SEQUENCE "AuditLog_sequence_seq";
    ALTER TABLE "AuditLog" ADD COLUMN "sequence" INTEGER;
    UPDATE "AuditLog" a
      SET "sequence" = sub.rn
      FROM (
        SELECT id, row_number() OVER (ORDER BY "createdAt" ASC, id ASC) AS rn
        FROM "AuditLog"
      ) sub
      WHERE a.id = sub.id;
    ALTER TABLE "AuditLog" ALTER COLUMN "sequence" SET DEFAULT nextval('"AuditLog_sequence_seq"');
    ALTER TABLE "AuditLog" ALTER COLUMN "sequence" SET NOT NULL;
    PERFORM setval('"AuditLog_sequence_seq"', COALESCE((SELECT MAX("sequence") FROM "AuditLog"), 0) + 1, false);
    CREATE UNIQUE INDEX "AuditLog_sequence_key" ON "AuditLog"("sequence");
  END IF;
END $$;
