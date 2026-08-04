import { MigrationInterface, QueryRunner } from 'typeorm';

export class NegotiationPolicyScopeAndArchive1735000000000 implements MigrationInterface {
  name = 'NegotiationPolicyScopeAndArchive1735000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "negotiation_policies"
      ADD COLUMN IF NOT EXISTS "customer_type" varchar(30)
    `);
    await queryRunner.query(`
      ALTER TABLE "negotiation_policies"
      ADD COLUMN IF NOT EXISTS "archived_at" timestamptz
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_negotiation_policies_scope"
      ON "negotiation_policies" ("unit_id", "customer_type", "active")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_negotiation_policies_scope"`);
    await queryRunner.query(`ALTER TABLE "negotiation_policies" DROP COLUMN IF EXISTS "archived_at"`);
    await queryRunner.query(`ALTER TABLE "negotiation_policies" DROP COLUMN IF EXISTS "customer_type"`);
  }
}
