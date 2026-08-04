import { MigrationInterface, QueryRunner } from 'typeorm';

export class AsaasConnectionObservability1732000000000 implements MigrationInterface {
  name = 'AsaasConnectionObservability1732000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "billing_connections" ADD COLUMN IF NOT EXISTS "webhook_email" varchar(255)`);
    await queryRunner.query(`ALTER TABLE "billing_connections" ADD COLUMN IF NOT EXISTS "webhook_url" text`);
    await queryRunner.query(`ALTER TABLE "billing_connections" ADD COLUMN IF NOT EXISTS "remote_account_number" varchar(120)`);
    await queryRunner.query(`ALTER TABLE "billing_connections" ADD COLUMN IF NOT EXISTS "last_webhook_sync_at" timestamptz`);
    await queryRunner.query(`ALTER TABLE "billing_connections" ADD COLUMN IF NOT EXISTS "last_webhook_error" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "billing_connections" DROP COLUMN IF EXISTS "last_webhook_error"`);
    await queryRunner.query(`ALTER TABLE "billing_connections" DROP COLUMN IF EXISTS "last_webhook_sync_at"`);
    await queryRunner.query(`ALTER TABLE "billing_connections" DROP COLUMN IF EXISTS "remote_account_number"`);
    await queryRunner.query(`ALTER TABLE "billing_connections" DROP COLUMN IF EXISTS "webhook_url"`);
    await queryRunner.query(`ALTER TABLE "billing_connections" DROP COLUMN IF EXISTS "webhook_email"`);
  }
}
