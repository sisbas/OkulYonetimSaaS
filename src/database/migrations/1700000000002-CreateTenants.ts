import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTenants1700000000002 implements MigrationInterface {
  name = 'CreateTenants1700000000002';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar(255) NOT NULL,
        slug varchar(120) NOT NULL UNIQUE,
        status varchar(30) NOT NULL DEFAULT 'active',
        timezone varchar(80) NOT NULL DEFAULT 'Europe/Istanbul',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz NULL,
        CONSTRAINT chk_tenants_status CHECK (status IN ('active', 'suspended', 'deleted'))
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_tenants_active_slug ON tenants(slug) WHERE status = 'active'`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS tenants`);
  }
}
