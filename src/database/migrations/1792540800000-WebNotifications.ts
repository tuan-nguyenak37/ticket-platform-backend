import { MigrationInterface, QueryRunner } from 'typeorm';

export class WebNotifications1792540800000 implements MigrationInterface {
  name = 'WebNotifications1792540800000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE web_notifications (
      notification_id varchar(40) PRIMARY KEY,
      user_id varchar(40) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      kind varchar(32) NOT NULL CHECK (kind IN ('ORDER_PAID','RESALE_BOUGHT','RESALE_SOLD','EVENT_APPROVED','EVENT_REJECTED')),
      source_id varchar(40) NOT NULL,
      title varchar(120) NOT NULL,
      body text NOT NULL,
      href varchar(300) NOT NULL CHECK (href LIKE '/%' AND href NOT LIKE '//%'),
      read_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(user_id, kind, source_id)
    )`);
    await runner.query(
      'CREATE INDEX ON web_notifications(user_id, created_at DESC, notification_id DESC)',
    );
    await runner.query(
      'CREATE INDEX ON web_notifications(user_id) WHERE read_at IS NULL',
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE web_notifications');
  }
}
