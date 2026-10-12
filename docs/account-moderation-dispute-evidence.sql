-- Apply after orders-schema.sql when DB_SYNCHRONIZE=false.
BEGIN;
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "statusReason" varchar(1000);
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "statusChangedBy" varchar(40);
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "statusChangedAt" timestamptz;
ALTER TABLE order_disputes ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;
COMMIT;
