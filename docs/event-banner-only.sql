-- Apply when DB_SYNCHRONIZE is disabled, after stopping the old application.
-- Removes the retired event columns; existing banner and description are kept.
-- This SQL does not delete any files from local storage.
BEGIN;

ALTER TABLE "events"
  DROP COLUMN IF EXISTS "thumbnailUrl",
  DROP COLUMN IF EXISTS "shortDescription";

COMMIT;
