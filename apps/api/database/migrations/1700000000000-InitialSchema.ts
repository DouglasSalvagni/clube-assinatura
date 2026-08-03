import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "email" varchar(255) NOT NULL,
        "password_hash" varchar(255) NOT NULL,
        "name" varchar(160) NOT NULL,
        "global_role" varchar(40) NOT NULL DEFAULT 'STANDARD',
        "active" boolean NOT NULL DEFAULT true,
        "phone" varchar(30),
        "asaas_wallet_id" varchar(100),
        "last_login_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_users_email" UNIQUE ("email")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "units" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "slug" varchar(80) NOT NULL,
        "name" varchar(180) NOT NULL,
        "legal_name" varchar(220),
        "tax_id" varchar(20),
        "active" boolean NOT NULL DEFAULT true,
        "timezone" varchar(80) NOT NULL DEFAULT 'America/Sao_Paulo',
        "settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "branding" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_units_slug" UNIQUE ("slug")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "memberships" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "unit_id" uuid NOT NULL REFERENCES "units"("id") ON DELETE CASCADE,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "role" varchar(40) NOT NULL DEFAULT 'VIEWER',
        "active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_memberships_user_unit" UNIQUE ("user_id", "unit_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "token_hash" varchar(128) NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "revoked_at" timestamptz,
        "user_agent" varchar(500),
        "ip_address" varchar(80),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_refresh_tokens_hash" UNIQUE ("token_hash")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "billing_connections" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "unit_id" uuid NOT NULL REFERENCES "units"("id") ON DELETE CASCADE,
        "provider" varchar(40) NOT NULL DEFAULT 'ASAAS',
        "environment" varchar(30) NOT NULL DEFAULT 'SANDBOX',
        "api_key_encrypted" text,
        "webhook_secret_encrypted" text,
        "webhook_secret_hash" varchar(128),
        "external_webhook_id" varchar(120),
        "enabled" boolean NOT NULL DEFAULT false,
        "last_validated_at" timestamptz,
        "last_error" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_billing_connections_unit_provider" UNIQUE ("unit_id", "provider")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "people" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "unit_id" uuid NOT NULL REFERENCES "units"("id") ON DELETE CASCADE,
        "kind" varchar(20) NOT NULL DEFAULT 'PERSON',
        "name" varchar(200) NOT NULL,
        "tax_id" varchar(20),
        "email" varchar(255),
        "phone" varchar(30),
        "whatsapp" varchar(30),
        "birth_date" date,
        "address" varchar(160),
        "address_number" varchar(30),
        "complement" varchar(120),
        "district" varchar(120),
        "city" varchar(120),
        "state" varchar(2),
        "postal_code" varchar(12),
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "plans" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "unit_id" uuid NOT NULL REFERENCES "units"("id") ON DELETE CASCADE,
        "code" varchar(120) NOT NULL,
        "name" varchar(180) NOT NULL,
        "description" text,
        "active" boolean NOT NULL DEFAULT true,
        "max_dependents" integer NOT NULL DEFAULT 0,
        "benefits" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_plans_unit_code" UNIQUE ("unit_id", "code")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "plan_prices" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "unit_id" uuid NOT NULL REFERENCES "units"("id") ON DELETE CASCADE,
        "plan_id" uuid NOT NULL REFERENCES "plans"("id") ON DELETE CASCADE,
        "version" integer NOT NULL DEFAULT 1,
        "amount" numeric(14,2) NOT NULL,
        "billing_cycle" varchar(30) NOT NULL DEFAULT 'MONTHLY',
        "billing_type" varchar(30) NOT NULL DEFAULT 'UNDEFINED',
        "effective_from" date NOT NULL,
        "effective_to" date,
        "active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_plan_prices_unit_plan_version" UNIQUE ("unit_id", "plan_id", "version")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "teams" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "unit_id" uuid NOT NULL REFERENCES "units"("id") ON DELETE CASCADE,
        "name" varchar(160) NOT NULL,
        "description" text,
        "active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_teams_unit_name" UNIQUE ("unit_id", "name")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "team_members" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "unit_id" uuid NOT NULL REFERENCES "units"("id") ON DELETE CASCADE,
        "team_id" uuid NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_team_members_unit_team_user" UNIQUE ("unit_id", "team_id", "user_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "opportunities" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "unit_id" uuid NOT NULL REFERENCES "units"("id") ON DELETE CASCADE,
        "primary_person_id" uuid NOT NULL REFERENCES "people"("id") ON DELETE RESTRICT,
        "owner_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "plan_price_id" uuid REFERENCES "plan_prices"("id") ON DELETE SET NULL,
        "status" varchar(30) NOT NULL DEFAULT 'OPEN',
        "expected_value" numeric(14,2),
        "billing_cycle" varchar(30),
        "billing_type" varchar(30),
        "acquisition_source" varchar(120),
        "notes" text,
        "loss_reason" text,
        "asaas_customer_id" varchar(120),
        "won_at" timestamptz,
        "cancelled_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "opportunity_members" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "unit_id" uuid NOT NULL REFERENCES "units"("id") ON DELETE CASCADE,
        "opportunity_id" uuid NOT NULL REFERENCES "opportunities"("id") ON DELETE CASCADE,
        "person_id" uuid NOT NULL REFERENCES "people"("id") ON DELETE RESTRICT,
        "role" varchar(30) NOT NULL DEFAULT 'DEPENDENT',
        "relationship" varchar(80),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_opportunity_members_unit_opportunity_person" UNIQUE ("unit_id", "opportunity_id", "person_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "billing_customers" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "unit_id" uuid NOT NULL REFERENCES "units"("id") ON DELETE CASCADE,
        "person_id" uuid NOT NULL REFERENCES "people"("id") ON DELETE RESTRICT,
        "provider" varchar(40) NOT NULL DEFAULT 'ASAAS',
        "external_id" varchar(120) NOT NULL,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_billing_customers_unit_provider_external" UNIQUE ("unit_id", "provider", "external_id"),
        CONSTRAINT "uq_billing_customers_unit_person_provider" UNIQUE ("unit_id", "person_id", "provider")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "checkout_sessions" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "unit_id" uuid NOT NULL REFERENCES "units"("id") ON DELETE CASCADE,
        "opportunity_id" uuid NOT NULL REFERENCES "opportunities"("id") ON DELETE CASCADE,
        "billing_customer_id" uuid REFERENCES "billing_customers"("id") ON DELETE SET NULL,
        "provider" varchar(40) NOT NULL DEFAULT 'ASAAS',
        "external_id" varchar(120),
        "status" varchar(30) NOT NULL DEFAULT 'CREATED',
        "url" text,
        "expires_at" timestamptz,
        "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "subscriptions" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "unit_id" uuid NOT NULL REFERENCES "units"("id") ON DELETE CASCADE,
        "primary_person_id" uuid NOT NULL REFERENCES "people"("id") ON DELETE RESTRICT,
        "plan_price_id" uuid REFERENCES "plan_prices"("id") ON DELETE SET NULL,
        "source_opportunity_id" uuid REFERENCES "opportunities"("id") ON DELETE SET NULL,
        "billing_connection_id" uuid REFERENCES "billing_connections"("id") ON DELETE SET NULL,
        "external_subscription_id" varchar(120),
        "status" varchar(40) NOT NULL DEFAULT 'DRAFT',
        "financial_status" varchar(40) NOT NULL DEFAULT 'UNKNOWN',
        "access_status" varchar(40) NOT NULL DEFAULT 'DISABLED',
        "started_at" timestamptz,
        "first_active_at" timestamptz,
        "current_period_start" timestamptz,
        "current_period_end" timestamptz,
        "cancellation_scheduled_at" timestamptz,
        "cancelled_at" timestamptz,
        "last_reactivated_at" timestamptz,
        "cancellation_reason_code" varchar(80),
        "cancellation_reason_text" text,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "subscription_members" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "unit_id" uuid NOT NULL REFERENCES "units"("id") ON DELETE CASCADE,
        "subscription_id" uuid NOT NULL REFERENCES "subscriptions"("id") ON DELETE CASCADE,
        "person_id" uuid NOT NULL REFERENCES "people"("id") ON DELETE RESTRICT,
        "role" varchar(30) NOT NULL DEFAULT 'DEPENDENT',
        "status" varchar(30) NOT NULL DEFAULT 'ACTIVE',
        "joined_at" timestamptz NOT NULL,
        "left_at" timestamptz,
        "relationship" varchar(80),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_subscription_members_unit_subscription_person" UNIQUE ("unit_id", "subscription_id", "person_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "invoices" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "unit_id" uuid NOT NULL REFERENCES "units"("id") ON DELETE CASCADE,
        "subscription_id" uuid REFERENCES "subscriptions"("id") ON DELETE SET NULL,
        "billing_customer_id" uuid REFERENCES "billing_customers"("id") ON DELETE SET NULL,
        "external_id" varchar(120),
        "status" varchar(30) NOT NULL DEFAULT 'PENDING',
        "due_date" date,
        "amount" numeric(14,2) NOT NULL,
        "paid_amount" numeric(14,2) NOT NULL DEFAULT 0,
        "paid_at" timestamptz,
        "invoice_url" text,
        "bank_slip_url" text,
        "pix_payload" text,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "payments" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "unit_id" uuid NOT NULL REFERENCES "units"("id") ON DELETE CASCADE,
        "invoice_id" uuid REFERENCES "invoices"("id") ON DELETE SET NULL,
        "external_id" varchar(120) NOT NULL,
        "status" varchar(30) NOT NULL DEFAULT 'PENDING',
        "amount" numeric(14,2) NOT NULL,
        "confirmed_at" timestamptz,
        "received_at" timestamptz,
        "raw_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_payments_unit_external" UNIQUE ("unit_id", "external_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "sales" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "unit_id" uuid NOT NULL REFERENCES "units"("id") ON DELETE CASCADE,
        "opportunity_id" uuid REFERENCES "opportunities"("id") ON DELETE SET NULL,
        "subscription_id" uuid NOT NULL REFERENCES "subscriptions"("id") ON DELETE RESTRICT,
        "salesperson_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "gross_amount" numeric(14,2) NOT NULL,
        "commission_amount" numeric(14,2) NOT NULL DEFAULT 0,
        "commission_paid" boolean NOT NULL DEFAULT false,
        "sold_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "webhook_events" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "unit_id" uuid NOT NULL REFERENCES "units"("id") ON DELETE CASCADE,
        "provider" varchar(40) NOT NULL DEFAULT 'ASAAS',
        "provider_event_id" varchar(180),
        "deduplication_key" varchar(128) NOT NULL,
        "event_type" varchar(120) NOT NULL,
        "status" varchar(30) NOT NULL DEFAULT 'RECEIVED',
        "payload" jsonb NOT NULL,
        "headers" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "attempts" integer NOT NULL DEFAULT 0,
        "next_retry_at" timestamptz,
        "processed_at" timestamptz,
        "error" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_webhook_events_unit_dedup" UNIQUE ("unit_id", "deduplication_key")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "lifecycle_events" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "unit_id" uuid NOT NULL REFERENCES "units"("id") ON DELETE CASCADE,
        "person_id" uuid REFERENCES "people"("id") ON DELETE SET NULL,
        "subscription_id" uuid REFERENCES "subscriptions"("id") ON DELETE SET NULL,
        "type" varchar(100) NOT NULL,
        "from_status" varchar(50),
        "to_status" varchar(50),
        "reason_code" varchar(100),
        "effective_at" timestamptz NOT NULL,
        "actor_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "source" varchar(40) NOT NULL DEFAULT 'SYSTEM',
        "correlation_id" varchar(160),
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "unit_id" uuid NOT NULL REFERENCES "units"("id") ON DELETE CASCADE,
        "actor_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "action" varchar(120) NOT NULL,
        "resource_type" varchar(100) NOT NULL,
        "resource_id" varchar(160),
        "before_data" jsonb,
        "after_data" jsonb,
        "ip_address" varchar(80),
        "user_agent" varchar(500),
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`CREATE INDEX "idx_memberships_unit" ON "memberships" ("unit_id")`);
    await queryRunner.query(`CREATE INDEX "idx_memberships_user" ON "memberships" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "idx_refresh_tokens_user" ON "refresh_tokens" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "idx_people_unit_name" ON "people" ("unit_id", "name")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_people_unit_tax_id" ON "people" ("unit_id", "tax_id") WHERE "tax_id" IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX "idx_plan_prices_plan" ON "plan_prices" ("plan_id")`);
    await queryRunner.query(`CREATE INDEX "idx_opportunities_unit_status" ON "opportunities" ("unit_id", "status")`);
    await queryRunner.query(`CREATE INDEX "idx_opportunities_primary_person" ON "opportunities" ("primary_person_id")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_checkout_sessions_unit_external" ON "checkout_sessions" ("unit_id", "external_id") WHERE "external_id" IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX "idx_subscriptions_unit_status" ON "subscriptions" ("unit_id", "status")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_subscriptions_unit_external" ON "subscriptions" ("unit_id", "external_subscription_id") WHERE "external_subscription_id" IS NOT NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_invoices_unit_external" ON "invoices" ("unit_id", "external_id") WHERE "external_id" IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX "idx_sales_unit_sold_at" ON "sales" ("unit_id", "sold_at")`);
    await queryRunner.query(`CREATE INDEX "idx_webhook_events_status_retry" ON "webhook_events" ("status", "next_retry_at")`);
    await queryRunner.query(`CREATE INDEX "idx_lifecycle_events_unit_effective" ON "lifecycle_events" ("unit_id", "effective_at")`);
    await queryRunner.query(`CREATE INDEX "idx_lifecycle_events_subscription_effective" ON "lifecycle_events" ("unit_id", "subscription_id", "effective_at")`);
    await queryRunner.query(`CREATE INDEX "idx_audit_logs_unit_created" ON "audit_logs" ("unit_id", "created_at")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = [
      'audit_logs', 'lifecycle_events', 'webhook_events', 'sales', 'payments', 'invoices',
      'subscription_members', 'subscriptions', 'checkout_sessions', 'billing_customers',
      'opportunity_members', 'opportunities', 'team_members', 'teams', 'plan_prices', 'plans',
      'people', 'billing_connections', 'refresh_tokens', 'memberships', 'units', 'users',
    ];
    for (const table of tables) await queryRunner.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
  }
}
