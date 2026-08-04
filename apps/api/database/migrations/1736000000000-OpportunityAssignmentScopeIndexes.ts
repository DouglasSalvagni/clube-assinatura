import { MigrationInterface, QueryRunner } from 'typeorm';

export class OpportunityAssignmentScopeIndexes1736000000000 implements MigrationInterface {
  name = 'OpportunityAssignmentScopeIndexes1736000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "opportunities" opportunity
      SET "team_id" = NULL, "updated_at" = NOW()
      WHERE opportunity."owner_user_id" IS NOT NULL
        AND opportunity."team_id" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM "team_members" member
          WHERE member."unit_id" = opportunity."unit_id"
            AND member."team_id" = opportunity."team_id"
            AND member."user_id" = opportunity."owner_user_id"
        )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_opportunities_unit_owner" ON "opportunities" ("unit_id", "owner_user_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_opportunities_unit_team" ON "opportunities" ("unit_id", "team_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_team_members_unit_user" ON "team_members" ("unit_id", "user_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_team_members_unit_user"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_opportunities_unit_team"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_opportunities_unit_owner"`);
  }
}
