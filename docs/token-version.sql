-- Apply before deploying the updated application when synchronize is disabled.
-- Additive migration: preserves existing users.
ALTER TABLE "Users"
  ADD COLUMN IF NOT EXISTS "tokenVersion" integer NOT NULL DEFAULT 0;

