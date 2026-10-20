-- AlterTable
ALTER TABLE "Direction" ADD COLUMN "evidenceFileName" TEXT;
ALTER TABLE "Direction" ADD COLUMN "evidenceContentType" TEXT;
ALTER TABLE "Direction" ADD COLUMN "evidenceSizeBytes" INTEGER;
ALTER TABLE "Direction" ADD COLUMN "evidenceStorageKey" TEXT;
ALTER TABLE "Direction" ADD COLUMN "evidenceSha256" TEXT;
