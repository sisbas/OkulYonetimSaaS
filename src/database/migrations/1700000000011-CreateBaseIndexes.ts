import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBaseIndexes1700000000011 implements MigrationInterface {
  name = 'CreateBaseIndexes1700000000011';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`COMMENT ON SCHEMA public IS 'RLS is not mandatory at Phase 1 start. Tenant isolation will be enforced in the application repository/query-builder guard layer. RLS will be added to the security hardening backlog after a pilot.'`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_tenants_active_slug_lookup ON tenants(slug) WHERE status = 'active' AND deleted_at IS NULL`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_users_active_email_lookup ON users(email) WHERE status = 'active' AND deleted_at IS NULL`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_memberships_active_tenant_user_lookup ON tenant_memberships(tenant_id, user_id) WHERE status = 'active' AND deleted_at IS NULL`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_sessions_active_user_tenant_lookup ON user_sessions(user_id, tenant_id) WHERE status = 'active' AND revoked_at IS NULL`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_tenants_status_deleted_at ON tenants(status, deleted_at)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_branches_tenant_status_deleted_at ON branches(tenant_id, status, deleted_at)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_tenant_memberships_tenant_status_deleted_at ON tenant_memberships(tenant_id, status, deleted_at)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_roles_tenant_deleted_at ON roles(tenant_id, deleted_at)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_user_sessions_tenant_status ON user_sessions(tenant_id, status)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_kvkk_subjects_tenant_status ON kvkk_consent_subjects(tenant_id, status)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_kvkk_consents_tenant_status ON kvkk_consents(tenant_id, status)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_kvkk_consents_tenant_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_kvkk_subjects_tenant_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_user_sessions_tenant_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_roles_tenant_deleted_at`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_tenant_memberships_tenant_status_deleted_at`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_branches_tenant_status_deleted_at`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_tenants_status_deleted_at`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sessions_active_user_tenant_lookup`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_memberships_active_tenant_user_lookup`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_active_email_lookup`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_tenants_active_slug_lookup`);
  }
}
