import { MigrationInterface, QueryRunner } from 'typeorm';

export class EventRegistrationDiscounts1792454402100 implements MigrationInterface {
  name = 'EventRegistrationDiscounts1792454402100';

  async up(runner: QueryRunner): Promise<void> {
    if (!(await runner.hasColumn('events', 'registration_questions'))) {
      await runner.query(
        `ALTER TABLE events ADD COLUMN registration_questions jsonb NOT NULL DEFAULT '[]'::jsonb`,
      );
    }
    if (!(await runner.hasTable('event_discounts'))) {
      await runner.query(`CREATE TABLE event_discounts (
        discount_id varchar(40) PRIMARY KEY,
        event_id varchar(40) NOT NULL REFERENCES events(event_id) ON DELETE RESTRICT,
        code varchar(32) NOT NULL CHECK (code ~ '^[A-Z0-9_-]{3,32}$'),
        kind varchar(10) NOT NULL CHECK (kind IN ('PERCENT','FIXED')),
        value integer NOT NULL CHECK (value > 0 AND (kind <> 'PERCENT' OR value <= 100)),
        usage_limit integer NOT NULL CHECK (usage_limit > 0),
        starts_at timestamptz NOT NULL,
        ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(event_id, code)
      )`);
    }
  }

  down(): Promise<void> {
    return Promise.reject(
      new Error(
        'Forward-only compatibility migration; restore a verified database backup instead',
      ),
    );
  }
}
