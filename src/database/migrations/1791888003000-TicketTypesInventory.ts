import { MigrationInterface, QueryRunner } from 'typeorm';

export class TicketTypesInventory1791888003000 implements MigrationInterface {
  name = 'TicketTypesInventory1791888003000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "ticket_type_status_enum" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE')`,
    );
    await queryRunner.query(`
      CREATE TABLE "ticket_types" (
        "ticket_type_id" varchar(40) PRIMARY KEY,
        "showing_id" varchar(40) NOT NULL,
        "name" varchar(255) NOT NULL,
        "description" text,
        "price" bigint NOT NULL,
        "sale_start_at" timestamptz,
        "sale_end_at" timestamptz,
        "max_per_order" integer NOT NULL DEFAULT 4,
        "resale_allowed" boolean NOT NULL DEFAULT false,
        "status" "ticket_type_status_enum" NOT NULL DEFAULT 'DRAFT',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_ticket_types_showing" FOREIGN KEY ("showing_id") REFERENCES "showings" ("showing_id") ON DELETE RESTRICT,
        CONSTRAINT "CK_ticket_types_price" CHECK ("price" >= 0 AND "price" <= 9007199254740991),
        CONSTRAINT "CK_ticket_types_max_per_order" CHECK ("max_per_order" >= 1),
        CONSTRAINT "CK_ticket_types_sale_window" CHECK (
          "sale_start_at" IS NULL OR "sale_end_at" IS NULL OR "sale_start_at" < "sale_end_at"
        ),
        CONSTRAINT "CK_ticket_types_active" CHECK (
          "status" <> 'ACTIVE' OR ("sale_start_at" IS NOT NULL AND "sale_end_at" IS NOT NULL)
        )
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_ticket_types_showing_lower_name" ON "ticket_types" ("showing_id", lower("name"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ticket_types_showing_id" ON "ticket_types" ("showing_id", "ticket_type_id")`,
    );
    await queryRunner.query(`
      CREATE TABLE "ticket_inventories" (
        "ticket_type_id" varchar(40) PRIMARY KEY,
        "total_quantity" integer NOT NULL,
        "reserved_quantity" integer NOT NULL DEFAULT 0,
        "sold_quantity" integer NOT NULL DEFAULT 0,
        CONSTRAINT "FK_ticket_inventories_type" FOREIGN KEY ("ticket_type_id") REFERENCES "ticket_types" ("ticket_type_id") ON DELETE RESTRICT,
        CONSTRAINT "CK_ticket_inventories_quantities" CHECK (
          "total_quantity" > 0 AND "reserved_quantity" >= 0 AND "sold_quantity" >= 0
          AND "total_quantity"::bigint >= "reserved_quantity"::bigint + "sold_quantity"::bigint
        )
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "ticket_inventories"`);
    await queryRunner.query(`DROP TABLE "ticket_types"`);
    await queryRunner.query(`DROP TYPE "ticket_type_status_enum"`);
  }
}
