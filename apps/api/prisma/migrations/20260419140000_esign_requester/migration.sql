-- AlterTable
ALTER TABLE "EsignRecord" ADD COLUMN IF NOT EXISTS "requestedById" TEXT;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "EsignRecord" ADD CONSTRAINT "EsignRecord_requestedById_fkey"
    FOREIGN KEY ("requestedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
