import { MigrationInterface, QueryRunner } from 'typeorm';

export class ContractRevisions1731000000000 implements MigrationInterface {
  name = 'ContractRevisions1731000000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "parent_contract_id" uuid`);
    await q.query(`ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "relation_type" varchar(30) NOT NULL DEFAULT 'ORIGINAL'`);
    await q.query(`ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "change_reason" text`);
    await q.query(`ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "requires_payment" boolean NOT NULL DEFAULT true`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_contracts_parent_contract_id" ON "contracts" ("parent_contract_id")`);
    await q.query(`DO $$ BEGIN
      ALTER TABLE "contracts"
        ADD CONSTRAINT "FK_contracts_parent_contract"
        FOREIGN KEY ("parent_contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "contracts" DROP CONSTRAINT IF EXISTS "FK_contracts_parent_contract"`);
    await q.query(`DROP INDEX IF EXISTS "IDX_contracts_parent_contract_id"`);
    await q.query(`ALTER TABLE "contracts" DROP COLUMN IF EXISTS "requires_payment"`);
    await q.query(`ALTER TABLE "contracts" DROP COLUMN IF EXISTS "change_reason"`);
    await q.query(`ALTER TABLE "contracts" DROP COLUMN IF EXISTS "relation_type"`);
    await q.query(`ALTER TABLE "contracts" DROP COLUMN IF EXISTS "parent_contract_id"`);
  }
}
