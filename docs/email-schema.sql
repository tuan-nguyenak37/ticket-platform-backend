-- Apply before enabling EMAIL_ENABLED. No messages are sent by this migration.
BEGIN;
CREATE TABLE IF NOT EXISTS email_outbox (
  id varchar(64) PRIMARY KEY,
  "recipientId" varchar(40) NOT NULL,
  recipient varchar(254) NOT NULL,
  kind varchar(40) NOT NULL,
  "referenceId" varchar(40) NOT NULL,
  reason text,
  "isMock" boolean NOT NULL DEFAULT false,
  status varchar(16) NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  "nextDispatchAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" timestamptz,
  "lastErrorCode" varchar(40),
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT email_outbox_status CHECK (status IN ('pending', 'sent', 'failed')),
  CONSTRAINT email_outbox_attempts CHECK (attempts >= 0 AND attempts <= 5)
);
CREATE INDEX IF NOT EXISTS "IDX_email_outbox_dispatch" ON email_outbox(status, "nextDispatchAt");
COMMIT;
