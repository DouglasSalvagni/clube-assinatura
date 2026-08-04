import { MigrationInterface, QueryRunner } from 'typeorm';

export class CommercialOffersPipelinesTemplates1730000000000 implements MigrationInterface {
  name = 'CommercialOffersPipelinesTemplates1730000000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS "contract_templates" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(), "unit_id" uuid NOT NULL,
      "code" varchar(120) NOT NULL, "name" varchar(180) NOT NULL, "customer_type" varchar(20) NOT NULL,
      "active" boolean NOT NULL DEFAULT true, "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
      CONSTRAINT "PK_contract_templates" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_contract_templates_unit_code" UNIQUE ("unit_id","code"))`);

    await q.query(`CREATE TABLE IF NOT EXISTS "contract_template_versions" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(), "unit_id" uuid NOT NULL,
      "template_id" uuid NOT NULL, "version" integer NOT NULL, "status" varchar(30) NOT NULL DEFAULT 'DRAFT',
      "content" text NOT NULL, "variables" jsonb NOT NULL DEFAULT '[]'::jsonb, "published_at" timestamptz,
      CONSTRAINT "PK_contract_template_versions" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_contract_template_versions" UNIQUE ("unit_id","template_id","version"))`);

    await q.query(`CREATE TABLE IF NOT EXISTS "commercial_offers" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(), "unit_id" uuid NOT NULL,
      "code" varchar(120) NOT NULL, "name" varchar(180) NOT NULL, "description" text,
      "customer_type" varchar(20) NOT NULL, "status" varchar(30) NOT NULL DEFAULT 'DRAFT',
      "public_slug" varchar(160), "assignment_team_id" uuid, "assignment_user_id" uuid,
      "active" boolean NOT NULL DEFAULT true, "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
      CONSTRAINT "PK_commercial_offers" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_commercial_offers_unit_code" UNIQUE ("unit_id","code"),
      CONSTRAINT "UQ_commercial_offers_public_slug" UNIQUE ("public_slug"))`);

    await q.query(`CREATE TABLE IF NOT EXISTS "commercial_offer_versions" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(), "unit_id" uuid NOT NULL,
      "offer_id" uuid NOT NULL, "version" integer NOT NULL, "status" varchar(30) NOT NULL DEFAULT 'DRAFT',
      "billing_cycle" varchar(30) NOT NULL, "holder_amount" numeric(14,2), "dependent_amount" numeric(14,2),
      "unit_price" numeric(14,2), "included_lives" integer NOT NULL DEFAULT 1,
      "max_dependents" integer NOT NULL DEFAULT 0, "min_lives" integer NOT NULL DEFAULT 1,
      "max_lives" integer, "allowed_billing_types" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "pricing_rules" jsonb NOT NULL DEFAULT '{}'::jsonb, "contract_template_version_id" uuid,
      "effective_from" date, "effective_to" date, "published_at" timestamptz,
      "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
      CONSTRAINT "PK_commercial_offer_versions" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_commercial_offer_versions" UNIQUE ("unit_id","offer_id","version"))`);

    await q.query(`CREATE TABLE IF NOT EXISTS "commercial_pipelines" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(), "unit_id" uuid NOT NULL,
      "name" varchar(160) NOT NULL, "is_default" boolean NOT NULL DEFAULT false,
      "active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_commercial_pipelines" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_commercial_pipelines_unit_name" UNIQUE ("unit_id","name"))`);

    await q.query(`CREATE TABLE IF NOT EXISTS "commercial_pipeline_stages" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(), "unit_id" uuid NOT NULL,
      "pipeline_id" uuid NOT NULL, "code" varchar(100) NOT NULL, "name" varchar(160) NOT NULL,
      "position" integer NOT NULL DEFAULT 0, "commercial_status" varchar(30), "active" boolean NOT NULL DEFAULT true,
      CONSTRAINT "PK_commercial_pipeline_stages" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_commercial_pipeline_stages" UNIQUE ("unit_id","pipeline_id","code"))`);

    await q.query(`ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "pipeline_stage_id" uuid`);
    await q.query(`ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "offer_version_id" uuid`);
    await q.query(`ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "template_version_id" uuid`);

    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_commercial_offers_unit_status" ON "commercial_offers" ("unit_id","status")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_offer_versions_lookup" ON "commercial_offer_versions" ("unit_id","offer_id","status")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_pipeline_stages_order" ON "commercial_pipeline_stages" ("unit_id","pipeline_id","position")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_opportunities_pipeline_stage" ON "opportunities" ("unit_id","pipeline_stage_id")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_opportunities_offer_version" ON "opportunities" ("unit_id","offer_version_id")`);

    await q.query(`ALTER TABLE "commercial_offer_versions" ADD CONSTRAINT "FK_offer_versions_offer"
      FOREIGN KEY ("offer_id") REFERENCES "commercial_offers"("id") ON DELETE CASCADE`);
    await q.query(`ALTER TABLE "contract_template_versions" ADD CONSTRAINT "FK_contract_versions_template"
      FOREIGN KEY ("template_id") REFERENCES "contract_templates"("id") ON DELETE CASCADE`);
    await q.query(`ALTER TABLE "commercial_pipeline_stages" ADD CONSTRAINT "FK_pipeline_stages_pipeline"
      FOREIGN KEY ("pipeline_id") REFERENCES "commercial_pipelines"("id") ON DELETE CASCADE`);
    await q.query(`ALTER TABLE "commercial_offer_versions" ADD CONSTRAINT "FK_offer_versions_contract_template"
      FOREIGN KEY ("contract_template_version_id") REFERENCES "contract_template_versions"("id") ON DELETE RESTRICT`);
    await q.query(`ALTER TABLE "commercial_offers" ADD CONSTRAINT "FK_commercial_offers_assignment_team"
      FOREIGN KEY ("assignment_team_id") REFERENCES "teams"("id") ON DELETE SET NULL`);
    await q.query(`ALTER TABLE "commercial_offers" ADD CONSTRAINT "FK_commercial_offers_assignment_user"
      FOREIGN KEY ("assignment_user_id") REFERENCES "users"("id") ON DELETE SET NULL`);
    await q.query(`ALTER TABLE "opportunities" ADD CONSTRAINT "FK_opportunities_pipeline_stage"
      FOREIGN KEY ("pipeline_stage_id") REFERENCES "commercial_pipeline_stages"("id") ON DELETE SET NULL`);
    await q.query(`ALTER TABLE "opportunities" ADD CONSTRAINT "FK_opportunities_offer_version"
      FOREIGN KEY ("offer_version_id") REFERENCES "commercial_offer_versions"("id") ON DELETE SET NULL`);
    await q.query(`ALTER TABLE "contracts" ADD CONSTRAINT "FK_contracts_template_version"
      FOREIGN KEY ("template_version_id") REFERENCES "contract_template_versions"("id") ON DELETE RESTRICT`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "contracts" DROP COLUMN IF EXISTS "template_version_id"`);
    await q.query(`ALTER TABLE "opportunities" DROP COLUMN IF EXISTS "offer_version_id"`);
    await q.query(`ALTER TABLE "opportunities" DROP COLUMN IF EXISTS "pipeline_stage_id"`);
    await q.query(`DROP TABLE IF EXISTS "commercial_pipeline_stages"`);
    await q.query(`DROP TABLE IF EXISTS "commercial_pipelines"`);
    await q.query(`DROP TABLE IF EXISTS "commercial_offer_versions"`);
    await q.query(`DROP TABLE IF EXISTS "commercial_offers"`);
    await q.query(`DROP TABLE IF EXISTS "contract_template_versions"`);
    await q.query(`DROP TABLE IF EXISTS "contract_templates"`);
  }
}
