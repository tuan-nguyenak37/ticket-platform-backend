import { MigrationInterface, QueryRunner } from 'typeorm';

export class IssuedTickets1791888006000 implements MigrationInterface {
  name = 'IssuedTickets1791888006000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "issued_ticket_status_enum" AS ENUM ('ACTIVE', 'CANCELLED')`,
    );
    await queryRunner.query(`CREATE TABLE "tickets" (
      "ticket_id" varchar(40) PRIMARY KEY,
      "order_item_id" varchar(40) NOT NULL REFERENCES "order_items"("order_item_id") ON DELETE RESTRICT,
      "ticket_type_id" varchar(40) NOT NULL REFERENCES "ticket_types"("ticket_type_id") ON DELETE RESTRICT,
      "owner_user_id" varchar(40) NOT NULL REFERENCES "users"("user_id") ON DELETE RESTRICT,
      "ticket_number" integer NOT NULL,
      "status" "issued_ticket_status_enum" NOT NULL DEFAULT 'ACTIVE',
      "issued_at" timestamptz NOT NULL,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "CK_tickets_number" CHECK ("ticket_number" > 0),
      CONSTRAINT "UQ_tickets_item_number" UNIQUE ("order_item_id", "ticket_number")
    )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_tickets_owner_issued" ON "tickets"("owner_user_id", "issued_at", "ticket_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tickets_type" ON "tickets"("ticket_type_id")`,
    );
    await queryRunner.query(`CREATE TABLE "ticket_credentials" (
      "credential_id" varchar(40) PRIMARY KEY,
      "ticket_id" varchar(40) NOT NULL REFERENCES "tickets"("ticket_id") ON DELETE RESTRICT,
      "revoked_at" timestamptz,
      "created_at" timestamptz NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_ticket_credentials_current" ON "ticket_credentials"("ticket_id") WHERE "revoked_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ticket_credentials_ticket" ON "ticket_credentials"("ticket_id")`,
    );
    await queryRunner.query(`CREATE TABLE "ticket_ownerships" (
      "ownership_id" varchar(40) PRIMARY KEY,
      "ticket_id" varchar(40) NOT NULL REFERENCES "tickets"("ticket_id") ON DELETE RESTRICT,
      "from_user_id" varchar(40) REFERENCES "users"("user_id") ON DELETE RESTRICT,
      "to_user_id" varchar(40) NOT NULL REFERENCES "users"("user_id") ON DELETE RESTRICT,
      "created_at" timestamptz NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_ticket_ownerships_history" ON "ticket_ownerships"("ticket_id", "created_at")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "ticket_ownerships"`);
    await queryRunner.query(`DROP TABLE "ticket_credentials"`);
    await queryRunner.query(`DROP TABLE "tickets"`);
    await queryRunner.query(`DROP TYPE "issued_ticket_status_enum"`);
  }
}
