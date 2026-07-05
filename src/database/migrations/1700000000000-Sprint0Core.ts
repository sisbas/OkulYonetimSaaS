import { MigrationInterface, QueryRunner } from 'typeorm';

export class Sprint0Core1700000000000 implements MigrationInterface {
  name = 'Sprint0Core1700000000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`CREATE TABLE tenants (id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), name varchar(160) NOT NULL, status varchar(32) NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now())`);
    await queryRunner.query(`CREATE TABLE users (id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id uuid NOT NULL REFERENCES tenants(id), email varchar(320) NOT NULL, password_hash text NOT NULL, status varchar(32) NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id, email))`);
    await queryRunner.query(`CREATE TABLE roles (id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id uuid REFERENCES tenants(id), code varchar(80) NOT NULL, name varchar(120) NOT NULL, UNIQUE(tenant_id, code))`);
    await queryRunner.query(`CREATE TABLE permissions (code varchar(120) PRIMARY KEY, description varchar(240))`);
    await queryRunner.query(`CREATE TABLE role_permissions (role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE, permission_code varchar(120) NOT NULL REFERENCES permissions(code), PRIMARY KEY(role_id, permission_code))`);
    await queryRunner.query(`CREATE TABLE user_roles (user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE, PRIMARY KEY(user_id, role_id))`);
    await queryRunner.query(`CREATE TABLE refresh_tokens (id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id uuid NOT NULL REFERENCES tenants(id), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, token_hash text NOT NULL, replaced_by_token_id uuid, revoked_at timestamptz, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);
    await queryRunner.query(`CREATE TABLE audit_logs (id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id uuid REFERENCES tenants(id), user_id uuid REFERENCES users(id), action varchar(120) NOT NULL, resource varchar(120) NOT NULL, metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now())`);
    await queryRunner.query(`CREATE INDEX idx_users_tenant ON users(tenant_id)`);
    await queryRunner.query(`CREATE INDEX idx_refresh_tokens_tenant_user ON refresh_tokens(tenant_id, user_id)`);
    await queryRunner.query(`CREATE INDEX idx_audit_logs_tenant_created ON audit_logs(tenant_id, created_at)`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE audit_logs`);
    await queryRunner.query(`DROP TABLE refresh_tokens`);
    await queryRunner.query(`DROP TABLE user_roles`);
    await queryRunner.query(`DROP TABLE role_permissions`);
    await queryRunner.query(`DROP TABLE permissions`);
    await queryRunner.query(`DROP TABLE roles`);
    await queryRunner.query(`DROP TABLE users`);
    await queryRunner.query(`DROP TABLE tenants`);
  }
}
