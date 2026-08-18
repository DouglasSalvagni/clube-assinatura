import { MigrationInterface, QueryRunner } from 'typeorm';

export class CommercialPricingCyclesAndTeamPolicies1737000000000 implements MigrationInterface {
  name = 'CommercialPricingCyclesAndTeamPolicies1737000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "opportunities"
      ADD COLUMN IF NOT EXISTS "price_table_version_id" uuid,
      ADD COLUMN IF NOT EXISTS "contract_template_version_id" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "negotiation_policies"
      ADD COLUMN IF NOT EXISTS "target_team_id" uuid
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "commercial_price_table_versions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "unit_id" uuid NOT NULL,
        "customer_type" varchar(20) NOT NULL,
        "version" integer NOT NULL,
        "status" varchar(30) NOT NULL DEFAULT 'DRAFT',
        "holder_amount" numeric(14,2),
        "dependent_amount" numeric(14,2),
        "unit_price" numeric(14,2),
        "annual_discount_percent" numeric(6,2) NOT NULL DEFAULT 0,
        "max_dependents" integer NOT NULL DEFAULT 0,
        "min_lives" integer NOT NULL DEFAULT 1,
        "max_lives" integer,
        "monthly_billing_types" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "yearly_billing_types" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "contract_template_version_id" uuid,
        "effective_from" date,
        "effective_to" date,
        "published_at" timestamptz,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        CONSTRAINT "PK_commercial_price_table_versions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_commercial_price_table_versions_sequence"
          UNIQUE ("unit_id", "customer_type", "version")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_commercial_price_table_versions_current"
      ON "commercial_price_table_versions" ("unit_id", "customer_type")
      WHERE "status" = 'PUBLISHED'
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_commercial_price_table_versions_lookup"
      ON "commercial_price_table_versions" ("unit_id", "customer_type", "status")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "commercial_offer_billing_options" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "unit_id" uuid NOT NULL,
        "offer_version_id" uuid NOT NULL,
        "billing_cycle" varchar(30) NOT NULL,
        "holder_amount" numeric(14,2),
        "dependent_amount" numeric(14,2),
        "unit_price" numeric(14,2),
        "annual_discount_percent" numeric(6,2) NOT NULL DEFAULT 0,
        "allowed_billing_types" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "pricing_rules" jsonb NOT NULL DEFAULT '{}'::jsonb,
        CONSTRAINT "PK_commercial_offer_billing_options" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_commercial_offer_billing_options_cycle"
          UNIQUE ("unit_id", "offer_version_id", "billing_cycle")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_commercial_offer_billing_options_version"
      ON "commercial_offer_billing_options" ("offer_version_id")
    `);

    await queryRunner.query(`
      INSERT INTO "commercial_offer_billing_options" (
        "unit_id", "offer_version_id", "billing_cycle",
        "holder_amount", "dependent_amount", "unit_price",
        "annual_discount_percent", "allowed_billing_types", "pricing_rules"
      )
      SELECT
        version."unit_id",
        version."id",
        version."billing_cycle",
        version."holder_amount",
        version."dependent_amount",
        version."unit_price",
        CASE
          WHEN version."billing_cycle" = 'YEARLY'
            THEN COALESCE((version."pricing_rules"->>'annualDiscountPercent')::numeric, 0)
          ELSE 0
        END,
        version."allowed_billing_types",
        version."pricing_rules"
      FROM "commercial_offer_versions" version
      WHERE NOT EXISTS (
        SELECT 1
        FROM "commercial_offer_billing_options" option
        WHERE option."offer_version_id" = version."id"
          AND option."billing_cycle" = version."billing_cycle"
      )
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_offer_billing_options_version') THEN
          ALTER TABLE "commercial_offer_billing_options"
          ADD CONSTRAINT "FK_offer_billing_options_version"
          FOREIGN KEY ("offer_version_id") REFERENCES "commercial_offer_versions"("id") ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_price_table_contract_template') THEN
          ALTER TABLE "commercial_price_table_versions"
          ADD CONSTRAINT "FK_price_table_contract_template"
          FOREIGN KEY ("contract_template_version_id") REFERENCES "contract_template_versions"("id") ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_opportunities_price_table_version') THEN
          ALTER TABLE "opportunities"
          ADD CONSTRAINT "FK_opportunities_price_table_version"
          FOREIGN KEY ("price_table_version_id") REFERENCES "commercial_price_table_versions"("id") ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_opportunities_contract_template_version') THEN
          ALTER TABLE "opportunities"
          ADD CONSTRAINT "FK_opportunities_contract_template_version"
          FOREIGN KEY ("contract_template_version_id") REFERENCES "contract_template_versions"("id") ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_negotiation_policies_target_team') THEN
          ALTER TABLE "negotiation_policies"
          ADD CONSTRAINT "FK_negotiation_policies_target_team"
          FOREIGN KEY ("target_team_id") REFERENCES "teams"("id") ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_opportunities_price_table_version"
      ON "opportunities" ("unit_id", "price_table_version_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_opportunities_contract_template_version"
      ON "opportunities" ("unit_id", "contract_template_version_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_negotiation_policies_team_scope"
      ON "negotiation_policies" ("unit_id", "target_team_id", "active")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "negotiation_policies" DROP CONSTRAINT IF EXISTS "FK_negotiation_policies_target_team"`);
    await queryRunner.query(`ALTER TABLE "opportunities" DROP CONSTRAINT IF EXISTS "FK_opportunities_contract_template_version"`);
    await queryRunner.query(`ALTER TABLE "opportunities" DROP CONSTRAINT IF EXISTS "FK_opportunities_price_table_version"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_negotiation_policies_team_scope"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_opportunities_contract_template_version"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_opportunities_price_table_version"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "commercial_offer_billing_options"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "commercial_price_table_versions"`);
    await queryRunner.query(`ALTER TABLE "negotiation_policies" DROP COLUMN IF EXISTS "target_team_id"`);
    await queryRunner.query(`ALTER TABLE "opportunities" DROP COLUMN IF EXISTS "contract_template_version_id"`);
    await queryRunner.query(`ALTER TABLE "opportunities" DROP COLUMN IF EXISTS "price_table_version_id"`);
  }
}
