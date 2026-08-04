import { MigrationInterface, QueryRunner } from 'typeorm';

export class CommercialNegotiationFoundation1710000000000 implements MigrationInterface {
  name = 'CommercialNegotiationFoundation1710000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "team_id" uuid`);
    await queryRunner.query(`ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "customer_type" varchar(20) NOT NULL DEFAULT 'PERSON'`);
    await queryRunner.query(`ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "commercial_status" varchar(30) NOT NULL DEFAULT 'DRAFT'`);
    await queryRunner.query(`ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "negotiation_snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_opportunities_owner" ON "opportunities" ("unit_id", "owner_user_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_opportunities_commercial_status" ON "opportunities" ("unit_id", "commercial_status")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_opportunities_commercial_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_opportunities_owner"`);
    await queryRunner.query(`ALTER TABLE "opportunities" DROP COLUMN IF EXISTS "negotiation_snapshot"`);
    await queryRunner.query(`ALTER TABLE "opportunities" DROP COLUMN IF EXISTS "commercial_status"`);
    await queryRunner.query(`ALTER TABLE "opportunities" DROP COLUMN IF EXISTS "customer_type"`);
    await queryRunner.query(`ALTER TABLE "opportunities" DROP COLUMN IF EXISTS "team_id"`);
  }
}
