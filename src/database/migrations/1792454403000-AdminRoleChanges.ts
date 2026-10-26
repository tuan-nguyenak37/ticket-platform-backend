import { MigrationInterface, QueryRunner } from 'typeorm';

export class AdminRoleChanges1792454403000 implements MigrationInterface {
  name = 'AdminRoleChanges1792454403000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE user_role_changes (
      change_id varchar(40) PRIMARY KEY,
      actor_id varchar(40) NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
      target_id varchar(40) NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
      previous_role user_role_enum NOT NULL,
      new_role user_role_enum NOT NULL,
      reason varchar(1000) NOT NULL CHECK (length(btrim(reason)) > 0),
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK (actor_id <> target_id),
      CHECK (previous_role IN ('USER', 'MODERATOR') AND new_role IN ('USER', 'MODERATOR') AND previous_role <> new_role)
    )`);
    await queryRunner.query(
      'CREATE INDEX "IDX_user_role_changes_target_created" ON user_role_changes(target_id, created_at)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE user_role_changes');
  }
}
