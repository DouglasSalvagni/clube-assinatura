import { MigrationInterface, QueryRunner } from 'typeorm';

export class CommercialContractsPrecheckout1723000000000 implements MigrationInterface {
  name = 'CommercialContractsPrecheckout1723000000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "negotiation_policies" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(), "unit_id" uuid NOT NULL, "name" varchar(160) NOT NULL,
      "target_role" varchar(40), "target_user_id" uuid, "max_discount_percent" numeric(6,2) NOT NULL DEFAULT 0,
      "max_discount_amount" numeric(14,2), "min_unit_price" numeric(14,2),
      "allowed_billing_types" jsonb NOT NULL DEFAULT '[]'::jsonb, "active" boolean NOT NULL DEFAULT true,
      "rules" jsonb NOT NULL DEFAULT '{}'::jsonb, CONSTRAINT "PK_negotiation_policies" PRIMARY KEY ("id"))`);
    await q.query(`CREATE INDEX "IDX_negotiation_policies_unit" ON "negotiation_policies" ("unit_id","name")`);

    await q.query(`CREATE TABLE "approval_requests" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(), "unit_id" uuid NOT NULL, "opportunity_id" uuid NOT NULL,
      "requested_by" uuid NOT NULL, "decided_by" uuid, "status" varchar(30) NOT NULL DEFAULT 'PENDING',
      "reason" text NOT NULL, "requested_conditions" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "policy_evaluation" jsonb NOT NULL DEFAULT '{}'::jsonb, "decision_notes" text,
      "decided_at" timestamptz, CONSTRAINT "PK_approval_requests" PRIMARY KEY ("id"))`);
    await q.query(`CREATE INDEX "IDX_approval_requests_lookup" ON "approval_requests" ("unit_id","opportunity_id","status")`);

    await q.query(`CREATE TABLE "contracts" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(), "unit_id" uuid NOT NULL, "opportunity_id" uuid NOT NULL,
      "version" integer NOT NULL DEFAULT 1, "status" varchar(30) NOT NULL DEFAULT 'DRAFT',
      "template_code" varchar(120) NOT NULL DEFAULT 'DEFAULT', "snapshot" jsonb NOT NULL,
      "rendered_content" text NOT NULL, "content_hash" varchar(64) NOT NULL, "accepted_at" timestamptz,
      CONSTRAINT "PK_contracts" PRIMARY KEY ("id"))`);
    await q.query(`CREATE INDEX "IDX_contracts_opportunity" ON "contracts" ("unit_id","opportunity_id")`);

    await q.query(`CREATE TABLE "contract_acceptances" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(), "unit_id" uuid NOT NULL, "contract_id" uuid NOT NULL,
      "accepted_by_name" varchar(200) NOT NULL, "accepted_by_tax_id" varchar(20) NOT NULL,
      "ip_address" varchar(80), "user_agent" varchar(500), "content_hash" varchar(64) NOT NULL,
      "accepted_at" timestamptz NOT NULL, "evidence" jsonb NOT NULL DEFAULT '{}'::jsonb,
      CONSTRAINT "PK_contract_acceptances" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_contract_acceptances_contract" UNIQUE ("unit_id","contract_id"))`);

    await q.query(`CREATE TABLE "precheckout_sessions" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(), "unit_id" uuid NOT NULL, "opportunity_id" uuid NOT NULL,
      "contract_id" uuid, "checkout_session_id" uuid, "token_hash" varchar(64) NOT NULL,
      "status" varchar(40) NOT NULL DEFAULT 'CREATED', "expires_at" timestamptz NOT NULL,
      "revoked_at" timestamptz, "customer_data" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "pricing_snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb, CONSTRAINT "PK_precheckout_sessions" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_precheckout_token" UNIQUE ("token_hash"))`);
    await q.query(`CREATE INDEX "IDX_precheckout_opportunity" ON "precheckout_sessions" ("unit_id","opportunity_id")`);

    await q.query(`CREATE TABLE "precheckout_participants" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(), "unit_id" uuid NOT NULL,
      "precheckout_session_id" uuid NOT NULL, "role" varchar(30) NOT NULL DEFAULT 'DEPENDENT',
      "name" varchar(200) NOT NULL, "tax_id" varchar(20) NOT NULL, "birth_date" date,
      "relationship" varchar(80), CONSTRAINT "PK_precheckout_participants" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_precheckout_participant_tax" UNIQUE ("unit_id","precheckout_session_id","tax_id"))`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "precheckout_participants"`);
    await q.query(`DROP TABLE IF EXISTS "precheckout_sessions"`);
    await q.query(`DROP TABLE IF EXISTS "contract_acceptances"`);
    await q.query(`DROP TABLE IF EXISTS "contracts"`);
    await q.query(`DROP TABLE IF EXISTS "approval_requests"`);
    await q.query(`DROP TABLE IF EXISTS "negotiation_policies"`);
  }
}
