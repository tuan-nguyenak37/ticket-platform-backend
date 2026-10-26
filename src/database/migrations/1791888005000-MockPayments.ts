import { MigrationInterface, QueryRunner } from 'typeorm';

export class MockPayments1791888005000 implements MigrationInterface {
  name = 'MockPayments1791888005000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "payment_status_enum" AS ENUM ('SUCCEEDED', 'FAILED')`,
    );
    await queryRunner.query(`
      CREATE TABLE "payments" (
        "payment_id" varchar(40) PRIMARY KEY, "order_id" varchar(40) NOT NULL UNIQUE,
        "status" "payment_status_enum" NOT NULL, "amount" bigint NOT NULL,
        "processed_at" timestamptz NOT NULL,
        CONSTRAINT "FK_payments_order" FOREIGN KEY ("order_id") REFERENCES "orders" ("order_id") ON DELETE RESTRICT,
        CONSTRAINT "CK_payments_amount" CHECK ("amount" >= 0)
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "payments"`);
    await queryRunner.query(`DROP TYPE "payment_status_enum"`);
  }
}
