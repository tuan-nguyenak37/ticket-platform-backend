import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrdersReservations1791888004000 implements MigrationInterface {
  name = 'OrdersReservations1791888004000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "order_status_enum" AS ENUM ('PENDING_PAYMENT', 'PAID', 'CANCELLED', 'EXPIRED', 'PAYMENT_FAILED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "reservation_status_enum" AS ENUM ('ACTIVE', 'CONSUMED', 'RELEASED', 'EXPIRED')`,
    );
    await queryRunner.query(`
      CREATE TABLE "orders" (
        "order_id" varchar(40) PRIMARY KEY, "user_id" varchar(40) NOT NULL,
        "idempotency_key" varchar(128) NOT NULL, "status" "order_status_enum" NOT NULL DEFAULT 'PENDING_PAYMENT',
        "total_amount" bigint NOT NULL, "cancel_reason" varchar(40),
        "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_orders_user" FOREIGN KEY ("user_id") REFERENCES "users" ("user_id") ON DELETE RESTRICT,
        CONSTRAINT "CK_orders_amount" CHECK ("total_amount" >= 0)
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_orders_user_idempotency" ON "orders" ("user_id", "idempotency_key")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_orders_user_created" ON "orders" ("user_id", "created_at")`,
    );
    await queryRunner.query(`
      CREATE TABLE "order_items" (
        "order_item_id" varchar(40) PRIMARY KEY, "order_id" varchar(40) NOT NULL UNIQUE,
        "ticket_type_id" varchar(40) NOT NULL, "ticket_type_name" varchar(255) NOT NULL,
        "quantity" integer NOT NULL, "unit_price" bigint NOT NULL,
        CONSTRAINT "FK_order_items_order" FOREIGN KEY ("order_id") REFERENCES "orders" ("order_id") ON DELETE RESTRICT,
        CONSTRAINT "FK_order_items_ticket_type" FOREIGN KEY ("ticket_type_id") REFERENCES "ticket_types" ("ticket_type_id") ON DELETE RESTRICT,
        CONSTRAINT "CK_order_items_amount" CHECK ("quantity" > 0 AND "unit_price" >= 0)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "ticket_reservations" (
        "reservation_id" varchar(40) PRIMARY KEY, "order_id" varchar(40) NOT NULL UNIQUE,
        "ticket_type_id" varchar(40) NOT NULL, "quantity" integer NOT NULL,
        "status" "reservation_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "expires_at" timestamptz NOT NULL, "settled_at" timestamptz,
        CONSTRAINT "FK_reservations_order" FOREIGN KEY ("order_id") REFERENCES "orders" ("order_id") ON DELETE RESTRICT,
        CONSTRAINT "FK_reservations_ticket_type" FOREIGN KEY ("ticket_type_id") REFERENCES "ticket_types" ("ticket_type_id") ON DELETE RESTRICT,
        CONSTRAINT "CK_reservations_quantity" CHECK ("quantity" > 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_reservations_type_active_expiry" ON "ticket_reservations" ("ticket_type_id", "expires_at") WHERE "status" = 'ACTIVE'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "ticket_reservations"`);
    await queryRunner.query(`DROP TABLE "order_items"`);
    await queryRunner.query(`DROP TABLE "orders"`);
    await queryRunner.query(`DROP TYPE "reservation_status_enum"`);
    await queryRunner.query(`DROP TYPE "order_status_enum"`);
  }
}
