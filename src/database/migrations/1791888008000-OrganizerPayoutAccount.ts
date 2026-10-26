import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrganizerPayoutAccount1791888008000 implements MigrationInterface {
  name = 'OrganizerPayoutAccount1791888008000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "organizer_payout_accounts" (
      "organizer_id" varchar(40) PRIMARY KEY REFERENCES "organizers"("organizer_id") ON DELETE CASCADE,
      "bank_name" varchar(100) NOT NULL,
      "account_holder" varchar(100) NOT NULL,
      "account_number" varchar(30) NOT NULL,
      "updated_at" timestamptz NOT NULL DEFAULT now()
    )`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "organizer_payout_accounts"');
  }
}
