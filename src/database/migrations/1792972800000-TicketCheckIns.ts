import { MigrationInterface, QueryRunner } from 'typeorm';

export class TicketCheckIns1792972800000 implements MigrationInterface {
  name = 'TicketCheckIns1792972800000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE tickets
      ADD COLUMN IF NOT EXISTS checked_in_at timestamptz,
      ADD COLUMN IF NOT EXISTS checked_in_by varchar(40)`);
    await runner.query(`DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'tickets'::regclass AND conname = 'tickets_check_in_pair'
      ) THEN
        ALTER TABLE tickets ADD CONSTRAINT tickets_check_in_pair
          CHECK ((checked_in_at IS NULL) = (checked_in_by IS NULL));
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'tickets'::regclass AND conname = 'tickets_checked_in_by_fkey'
      ) THEN
        ALTER TABLE tickets ADD CONSTRAINT tickets_checked_in_by_fkey
          FOREIGN KEY (checked_in_by) REFERENCES users(user_id) ON DELETE RESTRICT;
      END IF;
    END; $$`);
    await runner.query(`CREATE INDEX IF NOT EXISTS "IDX_tickets_check_in_type"
      ON tickets(ticket_type_id, checked_in_at, ticket_id)
      WHERE checked_in_at IS NOT NULL`);
  }

  down(): Promise<void> {
    return Promise.reject(
      new Error('Forward-only check-in migration; preserve admission history'),
    );
  }
}
