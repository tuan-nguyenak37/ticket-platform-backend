import { MigrationInterface, QueryRunner } from 'typeorm';

export class CheckoutSessions1792454400000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE checkout_sessions (
      session_id varchar(40) PRIMARY KEY,
      user_id varchar(40) NOT NULL REFERENCES users(user_id),
      order_id varchar(40) NOT NULL,
      kind varchar(10) NOT NULL CHECK (kind IN ('orders','resale')),
      method varchar(24) NOT NULL CHECK (method IN ('CARD','WALLET','BANK_TRANSFER')),
      status varchar(24) NOT NULL CHECK (status IN ('AWAITING_AUTH','VERIFIED','SUCCEEDED','FAILED','CANCELLED','EXPIRED')),
      amount bigint NOT NULL CHECK (amount >= 0),
      recipient jsonb NOT NULL, instrument jsonb NOT NULL, item jsonb NOT NULL,
      otp_digest varchar(64) NOT NULL, attempts integer NOT NULL DEFAULT 0,
      expires_at timestamptz NOT NULL, processed_at timestamptz,
      payment_id varchar(40), failure_code varchar(40), created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(
      'CREATE INDEX "IDX_checkout_order" ON checkout_sessions(user_id, kind, order_id, created_at)',
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE checkout_sessions');
  }
}
