import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTenantMemberships1700000000006 implements MigrationInterface {
  name = 'CreateTenantMemberships1700000000006';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tenant_memberships (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id),
        user_id uuid NOT NULL REFERENCES users(id),
        status varchar(30) NOT NULL DEFAULT 'active',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz NULL,
        CONSTRAINT uq_tenant_memberships_tenant_user UNIQUE (tenant_id, user_id),
        CONSTRAINT chk_tenant_memberships_status CHECK (status IN ('active', 'inactive', 'deleted'))
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_tenant_memberships_tenant_id ON tenant_memberships(tenant_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_tenant_memberships_user_id ON tenant_memberships(user_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_tenant_memberships_status ON tenant_memberships(status)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_memberships_active_lookup ON tenant_memberships(tenant_id, user_id) WHERE status = 'active'`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS tenant_memberships`);
  }
}
