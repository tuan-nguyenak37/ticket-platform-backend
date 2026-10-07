-- Apply before starting the new API/worker when DB_SYNCHRONIZE is disabled.
-- Does not scan old files, enable automatic approval, or seed data.
BEGIN;
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS "fileHash" varchar(64),
  ADD COLUMN IF NOT EXISTS "approvedCodeFingerprint" varchar(64),
  ADD COLUMN IF NOT EXISTS "reviewMethod" varchar(10);
CREATE INDEX IF NOT EXISTS "IDX_tickets_file_hash" ON tickets ("fileHash");
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_tickets_active_code"
  ON tickets (event_id, "approvedCodeFingerprint")
  WHERE "approvedCodeFingerprint" IS NOT NULL AND status IN ('available', 'holding', 'sold');
CREATE TABLE IF NOT EXISTS ticket_checks (
  ticket_id varchar(40) PRIMARY KEY REFERENCES tickets(ticket_id) ON DELETE CASCADE,
  status varchar(20) NOT NULL DEFAULT 'queued', outcome varchar(20),
  version integer NOT NULL DEFAULT 1, attempts integer NOT NULL DEFAULT 0,
  "leaseToken" uuid, "leaseUntil" timestamptz,
  "nextAttemptAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" timestamptz, "completedAt" timestamptz, "errorCode" varchar(64), scan jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "IDX_ticket_checks_queue" ON ticket_checks (status, "nextAttemptAt");
CREATE TABLE IF NOT EXISTS ticket_reviews (
  ticket_id varchar(40) PRIMARY KEY REFERENCES tickets(ticket_id) ON DELETE RESTRICT,
  decision varchar(10) NOT NULL, method varchar(10) NOT NULL,
  "actorId" varchar(40) REFERENCES "Users"(user_id) ON DELETE SET NULL,
  "checkVersion" integer, "selectedCodeId" uuid, note text, report jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Inspect historical coverage before enabling automatic approval:
-- SELECT ticket_id, status FROM tickets
-- WHERE status IN ('available', 'holding', 'sold') AND "approvedCodeFingerprint" IS NULL;
COMMIT;
