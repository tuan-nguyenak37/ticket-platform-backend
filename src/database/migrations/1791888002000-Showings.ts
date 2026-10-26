import { MigrationInterface, QueryRunner } from 'typeorm';

export class Showings1791888002000 implements MigrationInterface {
  name = 'Showings1791888002000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "showings" (
        "showing_id" varchar(40) PRIMARY KEY,
        "event_id" varchar(40) NOT NULL,
        "name" varchar(255) NOT NULL,
        "start_time" timestamptz NOT NULL,
        "end_time" timestamptz NOT NULL,
        "venue_name" varchar(255) NOT NULL,
        "address" text NOT NULL,
        "city" varchar(150) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_showings_event" FOREIGN KEY ("event_id") REFERENCES "events" ("event_id") ON DELETE RESTRICT,
        CONSTRAINT "CK_showings_time_range" CHECK ("end_time" > "start_time")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_showings_event_start_id" ON "showings" ("event_id", "start_time", "showing_id")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "showings"`);
  }
}
