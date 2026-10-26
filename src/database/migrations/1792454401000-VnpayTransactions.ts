import { MigrationInterface, QueryRunner } from 'typeorm';

export class VnpayTransactions1792454401000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE vnpay_transactions (
      txn_ref varchar(40) PRIMARY KEY,
      user_id varchar(40) NOT NULL REFERENCES users(user_id),
      order_id varchar(40) NOT NULL,
      kind varchar(10) NOT NULL CHECK (kind IN ('orders', 'resale')),
      amount bigint NOT NULL CHECK (amount > 0), recipient jsonb NOT NULL,
      status varchar(24) NOT NULL CHECK (status IN ('PENDING', 'SUCCEEDED', 'FAILED', 'REVIEW')),
      payment_url text NOT NULL, provider_result jsonb,
      payment_id varchar(40), failure_code varchar(40),
      created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL
    )`);
    await runner.query(
      'CREATE INDEX "IDX_vnpay_order" ON vnpay_transactions(user_id, kind, order_id, created_at)',
    );
    await runner.query(
      "CREATE UNIQUE INDEX \"IDX_vnpay_active\" ON vnpay_transactions(kind, order_id) WHERE status IN ('PENDING', 'SUCCEEDED', 'REVIEW')",
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE vnpay_transactions');
  }
}
