import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTenantSettings1700000000004 implements MigrationInterface {
  name = 'CreateTenantSettings1700000000004';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tenant_settings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id),
        timezone varchar(80) NOT NULL DEFAULT 'Europe/Istanbul',
        locale varchar(20) NOT NULL DEFAULT 'tr-TR',
        academic_year_label varchar(30) NULL,
        notification_mode varchar(30) NOT NULL DEFAULT 'manual',
        kvkk_mode varchar(30) NOT NULL DEFAULT 'strict',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_tenant_settings_tenant UNIQUE (tenant_id),
        CONSTRAINT chk_tenant_settings_notification_mode CHECK (notification_mode IN ('manual', 'provider_ready', 'provider_active')),
        CONSTRAINT chk_tenant_settings_kvkk_mode CHECK (kvkk_mode IN ('strict', 'standard'))
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_tenant_settings_tenant_id ON tenant_settings(tenant_id)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS tenant_settings`);
  }
}
