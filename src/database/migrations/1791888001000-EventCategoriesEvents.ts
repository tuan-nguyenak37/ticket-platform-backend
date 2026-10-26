import { MigrationInterface, QueryRunner } from 'typeorm';

export class EventCategoriesEvents1791888001000 implements MigrationInterface {
  name = 'EventCategoriesEvents1791888001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "event_status_enum" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'REJECTED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "event_review_action_enum" AS ENUM ('APPROVED', 'REJECTED')`,
    );
    await queryRunner.query(`
      CREATE TABLE "event_categories" (
        "category_id" varchar(40) PRIMARY KEY,
        "code" varchar(40) NOT NULL UNIQUE,
        "name" varchar(150) NOT NULL
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "events" (
        "event_id" varchar(40) PRIMARY KEY,
        "organizer_id" varchar(40) NOT NULL,
        "category_id" varchar(40) NOT NULL,
        "title" varchar(255) NOT NULL,
        "slug" varchar(255) NOT NULL,
        "description" text,
        "poster_url" text,
        "status" "event_status_enum" NOT NULL DEFAULT 'DRAFT',
        "rejection_reason" text,
        "reviewed_by" varchar(40),
        "reviewed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_events_organizer" FOREIGN KEY ("organizer_id") REFERENCES "organizers" ("organizer_id") ON DELETE RESTRICT,
        CONSTRAINT "FK_events_category" FOREIGN KEY ("category_id") REFERENCES "event_categories" ("category_id") ON DELETE RESTRICT,
        CONSTRAINT "FK_events_reviewer" FOREIGN KEY ("reviewed_by") REFERENCES "users" ("user_id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_events_slug" ON "events" ("slug")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_events_status_created_at" ON "events" ("status", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_events_organizer_created_at" ON "events" ("organizer_id", "created_at")`,
    );
    await queryRunner.query(`
      CREATE TABLE "event_review_logs" (
        "review_id" varchar(40) PRIMARY KEY,
        "event_id" varchar(40) NOT NULL,
        "moderator_id" varchar(40) NOT NULL,
        "action" "event_review_action_enum" NOT NULL,
        "reason" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CK_event_review_reason" CHECK ("action" <> 'REJECTED' OR ("reason" IS NOT NULL AND length(btrim("reason")) > 0)),
        CONSTRAINT "FK_event_review_event" FOREIGN KEY ("event_id") REFERENCES "events" ("event_id") ON DELETE RESTRICT,
        CONSTRAINT "FK_event_review_moderator" FOREIGN KEY ("moderator_id") REFERENCES "users" ("user_id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_event_review_logs_event_created_at" ON "event_review_logs" ("event_id", "created_at")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "event_review_logs"`);
    await queryRunner.query(`DROP TABLE "events"`);
    await queryRunner.query(`DROP TABLE "event_categories"`);
    await queryRunner.query(`DROP TYPE "event_review_action_enum"`);
    await queryRunner.query(`DROP TYPE "event_status_enum"`);
  }
}
