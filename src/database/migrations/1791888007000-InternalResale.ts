import { MigrationInterface, QueryRunner } from 'typeorm';

export class InternalResale1791888007000 implements MigrationInterface {
  name = 'InternalResale1791888007000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "resale_listing_status_enum" AS ENUM ('AVAILABLE', 'RESERVED', 'SOLD', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "resale_order_status_enum" AS ENUM ('PENDING_PAYMENT', 'PAID', 'CANCELLED', 'EXPIRED', 'PAYMENT_FAILED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "resale_payment_status_enum" AS ENUM ('SUCCEEDED', 'FAILED')`,
    );
    await queryRunner.query(`CREATE TABLE "resale_listings" (
      "listing_id" varchar(40) PRIMARY KEY,
      "ticket_id" varchar(40) NOT NULL REFERENCES "tickets"("ticket_id") ON DELETE RESTRICT,
      "seller_user_id" varchar(40) NOT NULL REFERENCES "users"("user_id") ON DELETE RESTRICT,
      "price" bigint NOT NULL,
      "status" "resale_listing_status_enum" NOT NULL DEFAULT 'AVAILABLE',
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "CK_resale_listings_price" CHECK ("price" > 0)
    )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_resale_listings_active_ticket" ON "resale_listings"("ticket_id") WHERE "status" IN ('AVAILABLE', 'RESERVED')`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_resale_listings_status_created" ON "resale_listings"("status", "created_at" DESC, "listing_id" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_resale_listings_seller" ON "resale_listings"("seller_user_id", "created_at" DESC, "listing_id" DESC)`,
    );
    await queryRunner.query(`CREATE TABLE "resale_orders" (
      "resale_order_id" varchar(40) PRIMARY KEY,
      "listing_id" varchar(40) NOT NULL REFERENCES "resale_listings"("listing_id") ON DELETE RESTRICT,
      "buyer_user_id" varchar(40) NOT NULL REFERENCES "users"("user_id") ON DELETE RESTRICT,
      "seller_user_id" varchar(40) NOT NULL REFERENCES "users"("user_id") ON DELETE RESTRICT,
      "price" bigint NOT NULL,
      "status" "resale_order_status_enum" NOT NULL DEFAULT 'PENDING_PAYMENT',
      "expires_at" timestamptz NOT NULL,
      "cancel_reason" varchar(40),
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "CK_resale_orders_price" CHECK ("price" > 0),
      CONSTRAINT "CK_resale_orders_distinct_users" CHECK ("buyer_user_id" <> "seller_user_id")
    )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_resale_orders_pending_listing" ON "resale_orders"("listing_id") WHERE "status" = 'PENDING_PAYMENT'`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_resale_orders_buyer" ON "resale_orders"("buyer_user_id", "created_at" DESC, "resale_order_id" DESC)`,
    );
    await queryRunner.query(`CREATE TABLE "resale_payments" (
      "payment_id" varchar(40) PRIMARY KEY,
      "resale_order_id" varchar(40) NOT NULL UNIQUE REFERENCES "resale_orders"("resale_order_id") ON DELETE RESTRICT,
      "amount" bigint NOT NULL,
      "status" "resale_payment_status_enum" NOT NULL,
      "processed_at" timestamptz NOT NULL,
      CONSTRAINT "CK_resale_payments_amount" CHECK ("amount" > 0)
    )`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "resale_payments"`);
    await queryRunner.query(`DROP TABLE "resale_orders"`);
    await queryRunner.query(`DROP TABLE "resale_listings"`);
    await queryRunner.query(`DROP TYPE "resale_payment_status_enum"`);
    await queryRunner.query(`DROP TYPE "resale_order_status_enum"`);
    await queryRunner.query(`DROP TYPE "resale_listing_status_enum"`);
  }
}
