import { MigrationInterface, QueryRunner } from 'typeorm';

export class SinglePublishedOfferVersion1734000000000 implements MigrationInterface {
  name = 'SinglePublishedOfferVersion1734000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      WITH ranked_versions AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY offer_id
            ORDER BY published_at DESC NULLS LAST, version DESC, created_at DESC
          ) AS position
        FROM commercial_offer_versions
        WHERE status = 'PUBLISHED'
      )
      UPDATE commercial_offer_versions AS versions
      SET
        status = 'RETIRED',
        effective_to = COALESCE(versions.effective_to, CURRENT_DATE)
      FROM ranked_versions
      WHERE versions.id = ranked_versions.id
        AND ranked_versions.position > 1
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_commercial_offer_versions_current"
      ON "commercial_offer_versions" ("offer_id")
      WHERE "status" = 'PUBLISHED'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_commercial_offer_versions_current"`);
  }
}
