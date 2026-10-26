import { MigrationInterface, QueryRunner } from 'typeorm';

export class ResaleSellerSettlement1792454405000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE resale_listings
      ADD COLUMN bank_name varchar(100), ADD COLUMN account_holder varchar(100),
      ADD COLUMN account_number varchar(30), ADD COLUMN fee_basis_points integer,
      ADD COLUMN fee_amount bigint, ADD COLUMN net_amount bigint,
      ADD CONSTRAINT "CK_resale_listing_settlement" CHECK (
        (bank_name IS NULL AND account_holder IS NULL AND account_number IS NULL
          AND fee_basis_points IS NULL AND fee_amount IS NULL AND net_amount IS NULL)
        OR (bank_name IS NOT NULL AND account_holder IS NOT NULL AND account_number IS NOT NULL
          AND fee_basis_points IS NOT NULL AND fee_amount IS NOT NULL AND net_amount IS NOT NULL
          AND length(btrim(bank_name)) BETWEEN 2 AND 100
          AND length(btrim(account_holder)) BETWEEN 2 AND 100
          AND account_number ~ '^[0-9]{6,30}$' AND fee_basis_points = 500
          AND fee_amount = floor(price::numeric * fee_basis_points / 10000)
          AND net_amount > 0 AND net_amount = price - fee_amount))`);
    await runner.query(`CREATE TABLE resale_payouts (
      payout_id varchar(40) PRIMARY KEY,
      resale_order_id varchar(40) NOT NULL REFERENCES resale_orders(resale_order_id) ON DELETE RESTRICT,
      listing_id varchar(40) NOT NULL REFERENCES resale_listings(listing_id) ON DELETE RESTRICT,
      gross_amount bigint NOT NULL CHECK (gross_amount > 0),
      fee_basis_points integer NOT NULL CHECK (fee_basis_points = 500),
      fee_amount bigint NOT NULL CHECK (fee_amount >= 0),
      net_amount bigint NOT NULL CHECK (net_amount > 0),
      bank_name varchar(100) NOT NULL, account_holder varchar(100) NOT NULL,
      account_number varchar(30) NOT NULL CHECK (account_number ~ '^[0-9]{6,30}$'),
      status varchar(24) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SUCCEEDED','FAILED')),
      provider varchar(24) NOT NULL DEFAULT 'MOCK' CHECK (provider = 'MOCK'),
      provider_reference varchar(80), error_code varchar(40), processed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_resale_payout_order" UNIQUE (resale_order_id),
      CONSTRAINT "UQ_resale_payout_listing" UNIQUE (listing_id),
      CHECK (fee_amount = floor(gross_amount::numeric * fee_basis_points / 10000)),
      CHECK (gross_amount::numeric = fee_amount::numeric + net_amount::numeric),
      CHECK (status <> 'SUCCEEDED' OR (provider_reference IS NOT NULL AND processed_at IS NOT NULL))
    )`);
    await runner.query(
      `CREATE INDEX "IDX_resale_payout_pending" ON resale_payouts(created_at, payout_id) WHERE status = 'PENDING'`,
    );
    await runner.query(`CREATE TABLE resale_emails (
      email_id varchar(40) PRIMARY KEY,
      resale_order_id varchar(40) NOT NULL REFERENCES resale_orders(resale_order_id) ON DELETE RESTRICT,
      kind varchar(24) NOT NULL CHECK (kind IN ('SOLD','PAYOUT_PROCESSED')),
      recipient varchar(255) NOT NULL, details jsonb NOT NULL,
      status varchar(24) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENDING','SENT','FAILED')),
      attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
      next_attempt_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz, lease_token varchar(40),
      last_error varchar(40), sent_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_resale_email_order_kind" UNIQUE (resale_order_id, kind)
    )`);
    await runner.query(
      `CREATE INDEX "IDX_resale_email_pending" ON resale_emails(next_attempt_at, created_at, email_id) WHERE status IN ('PENDING','SENDING')`,
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE resale_emails');
    await runner.query('DROP TABLE resale_payouts');
    await runner.query(`ALTER TABLE resale_listings DROP CONSTRAINT "CK_resale_listing_settlement",
      DROP COLUMN bank_name, DROP COLUMN account_holder, DROP COLUMN account_number,
      DROP COLUMN fee_basis_points, DROP COLUMN fee_amount, DROP COLUMN net_amount`);
  }
}
