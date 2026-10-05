-- Apply before deploying event pinning when DB_SYNCHRONIZE is disabled.
-- Additive migration: existing events remain unpinned.
BEGIN;

ALTER TABLE "events"
  ADD COLUMN IF NOT EXISTS "isPinned" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "pinnedAt" timestamptz NULL;

CREATE INDEX IF NOT EXISTS "IDX_events_pinned"
  ON "events" ("isPinned", "status", "endTime");

COMMIT;
