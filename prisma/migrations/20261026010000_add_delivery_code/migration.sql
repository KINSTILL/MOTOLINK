-- AlterTable
ALTER TABLE "Mission" ADD COLUMN "deliveryCode" TEXT;
ALTER TABLE "Mission" ADD COLUMN "deliveryCodeSentAt" TIMESTAMP(3);
ALTER TABLE "Mission" ADD COLUMN "deliveryCodeVerifiedAt" TIMESTAMP(3);
ALTER TABLE "Mission" ADD COLUMN "deliveryCodeAttempts" INTEGER NOT NULL DEFAULT 0;
