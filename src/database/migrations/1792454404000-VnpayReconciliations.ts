import { MigrationInterface, QueryRunner } from 'typeorm';

export class VnpayReconciliations1792454404000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE vnpay_reconciliations (
      reconciliation_id varchar(40) PRIMARY KEY,
      txn_ref varchar(40) NOT NULL REFERENCES vnpay_transactions(txn_ref) ON DELETE RESTRICT,
      actor_id varchar(40) NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
      reason varchar(1000) NOT NULL CHECK (length(btrim(reason)) > 0),
      previous_status varchar(24) NOT NULL,
      new_status varchar(24) NOT NULL,
      outcome varchar(24) NOT NULL CHECK (outcome IN ('UPDATED','UNCHANGED','ERROR')),
      response_code varchar(2), provider_status varchar(2), error_code varchar(40),
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await runner.query(
      'CREATE INDEX "IDX_vnpay_reconciliations_txn" ON vnpay_reconciliations(txn_ref, created_at DESC)',
    );
    await runner.query(
      'CREATE INDEX "IDX_vnpay_status_created" ON vnpay_transactions(status, created_at DESC, txn_ref)',
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE vnpay_reconciliations');
    await runner.query('DROP INDEX "IDX_vnpay_status_created"');
  }
}
