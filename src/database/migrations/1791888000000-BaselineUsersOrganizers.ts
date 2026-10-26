import { MigrationInterface, QueryRunner } from 'typeorm';

export class BaselineUsersOrganizers1791888000000 implements MigrationInterface {
  name = 'BaselineUsersOrganizers1791888000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('Users')) {
      throw new Error(
        'Legacy Users table found; use a fresh database for the baseline',
      );
    }
    await queryRunner.query(
      `CREATE TYPE "user_role_enum" AS ENUM ('USER', 'MODERATOR', 'ADMIN')`,
    );
    await queryRunner.query(
      `CREATE TYPE "user_status_enum" AS ENUM ('ACTIVE', 'SUSPENDED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "organizer_status_enum" AS ENUM ('ACTIVE', 'SUSPENDED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "organizer_member_role_enum" AS ENUM ('OWNER', 'MANAGER', 'STAFF')`,
    );
    await queryRunner.query(`
      CREATE TABLE "users" (
        "user_id" varchar(40) PRIMARY KEY,
        "email" varchar(255) NOT NULL UNIQUE,
        "full_name" varchar(150) NOT NULL,
        "password_hash" varchar(255) NOT NULL,
        "phone_number" varchar(20),
        "avatar_url" text,
        "role" "user_role_enum" NOT NULL DEFAULT 'USER',
        "status" "user_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "email_verified_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "organizers" (
        "organizer_id" varchar(40) PRIMARY KEY,
        "name" varchar(255) NOT NULL,
        "slug" varchar(255) NOT NULL,
        "description" text,
        "logo_url" text,
        "cover_url" text,
        "contact_email" varchar(255) NOT NULL,
        "contact_phone" varchar(20),
        "status" "organizer_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_organizers_slug" ON "organizers" ("slug")`,
    );
    await queryRunner.query(`
      CREATE TABLE "organizer_members" (
        "member_id" varchar(40) PRIMARY KEY,
        "organizer_id" varchar(40) NOT NULL,
        "user_id" varchar(40) NOT NULL,
        "role" "organizer_member_role_enum" NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_organizer_member" UNIQUE ("organizer_id", "user_id"),
        CONSTRAINT "FK_organizer_member_organizer" FOREIGN KEY ("organizer_id") REFERENCES "organizers" ("organizer_id") ON DELETE RESTRICT,
        CONSTRAINT "FK_organizer_member_user" FOREIGN KEY ("user_id") REFERENCES "users" ("user_id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_organizer_members_user_id" ON "organizer_members" ("user_id")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "organizer_members"`);
    await queryRunner.query(`DROP TABLE "organizers"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "organizer_member_role_enum"`);
    await queryRunner.query(`DROP TYPE "organizer_status_enum"`);
    await queryRunner.query(`DROP TYPE "user_status_enum"`);
    await queryRunner.query(`DROP TYPE "user_role_enum"`);
  }
}
