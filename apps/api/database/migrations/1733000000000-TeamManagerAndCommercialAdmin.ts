import { MigrationInterface, QueryRunner } from 'typeorm';

export class TeamManagerAndCommercialAdmin1733000000000 implements MigrationInterface {
  name = 'TeamManagerAndCommercialAdmin1733000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "manager_id" uuid`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_teams_manager_id" ON "teams" ("manager_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_teams_manager_id"`);
    await queryRunner.query(`ALTER TABLE "teams" DROP COLUMN IF EXISTS "manager_id"`);
  }
}
