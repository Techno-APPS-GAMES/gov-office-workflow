-- Consultation gap closures: direction reminders + meeting actions → directions
ALTER TABLE "Direction" ADD COLUMN IF NOT EXISTS "reminderSentAt" TIMESTAMP(3);

ALTER TABLE "MeetingAction" ADD COLUMN IF NOT EXISTS "ownerId" TEXT;
ALTER TABLE "MeetingAction" ADD COLUMN IF NOT EXISTS "directionId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "MeetingAction_directionId_key" ON "MeetingAction"("directionId");

DO $$ BEGIN
  ALTER TABLE "MeetingAction" ADD CONSTRAINT "MeetingAction_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "MeetingAction" ADD CONSTRAINT "MeetingAction_directionId_fkey"
    FOREIGN KEY ("directionId") REFERENCES "Direction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
