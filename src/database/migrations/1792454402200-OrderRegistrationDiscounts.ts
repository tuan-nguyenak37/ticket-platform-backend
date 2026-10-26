import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrderRegistrationDiscounts1792454402200 implements MigrationInterface {
  name = 'OrderRegistrationDiscounts1792454402200';

  async up(runner: QueryRunner): Promise<void> {
    if (!(await runner.hasColumn('orders', 'discount_id'))) {
      await runner.query(
        'ALTER TABLE orders ADD COLUMN discount_id varchar(40) REFERENCES event_discounts(discount_id) ON DELETE RESTRICT',
      );
    }
    if (!(await runner.hasColumn('orders', 'discount_code'))) {
      await runner.query(
        'ALTER TABLE orders ADD COLUMN discount_code varchar(32)',
      );
    }
    if (!(await runner.hasColumn('orders', 'discount_amount'))) {
      await runner.query(
        'ALTER TABLE orders ADD COLUMN discount_amount bigint NOT NULL DEFAULT 0 CHECK (discount_amount >= 0)',
      );
    }
    if (!(await runner.hasColumn('orders', 'registration_answers'))) {
      await runner.query(
        `ALTER TABLE orders ADD COLUMN registration_answers jsonb NOT NULL DEFAULT '[]'::jsonb`,
      );
    }
    await runner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_orders_discount" ON orders(discount_id) WHERE discount_id IS NOT NULL',
    );
  }

  down(): Promise<void> {
    return Promise.reject(
      new Error(
        'Forward-only compatibility migration; restore a verified database backup instead',
      ),
    );
  }
}
