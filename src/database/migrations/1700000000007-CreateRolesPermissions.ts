import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRolesPermissions1700000000007 implements MigrationInterface {
  name = 'CreateRolesPermissions1700000000007';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id),
        name varchar(100) NOT NULL,
        description text NULL,
        is_system_role boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz NULL,
        CONSTRAINT uq_roles_tenant_name UNIQUE (tenant_id, name),
        CONSTRAINT uq_roles_tenant_id_id UNIQUE (tenant_id, id)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS permissions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code varchar(150) NOT NULL UNIQUE,
        description text NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS role_permissions (
        role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_role_permissions PRIMARY KEY (role_id, permission_id)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS user_roles (
        tenant_id uuid NOT NULL REFERENCES tenants(id),
        user_id uuid NOT NULL REFERENCES users(id),
        role_id uuid NOT NULL REFERENCES roles(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_user_roles PRIMARY KEY (tenant_id, user_id, role_id),
        CONSTRAINT fk_user_roles_role_same_tenant FOREIGN KEY (tenant_id, role_id) REFERENCES roles(tenant_id, id)
      )
    `);
    await queryRunner.query(`COMMENT ON CONSTRAINT fk_user_roles_role_same_tenant ON user_roles IS 'Guards tenant consistency: user_roles.tenant_id must match roles.tenant_id.'`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_roles_tenant_id ON roles(tenant_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_roles_tenant_name ON roles(tenant_id, name)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_permissions_code ON permissions(code)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_user_roles_tenant_user ON user_roles(tenant_id, user_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS user_roles`);
    await queryRunner.query(`DROP TABLE IF EXISTS role_permissions`);
    await queryRunner.query(`DROP TABLE IF EXISTS permissions`);
    await queryRunner.query(`DROP TABLE IF EXISTS roles`);
  }
}
