import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuditLogs1700000000009 implements MigrationInterface {
  name = 'CreateAuditLogs1700000000009';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NULL REFERENCES tenants(id),
        actor_user_id uuid NULL REFERENCES users(id),
        actor_session_id uuid NULL REFERENCES user_sessions(id),
        action varchar(150) NOT NULL,
        entity_type varchar(100) NULL,
        entity_id uuid NULL,
        request_id varchar(120) NOT NULL,
        ip_address varchar(80) NULL,
        user_agent text NULL,
        before_json jsonb NULL,
        after_json jsonb NULL,
        metadata_json jsonb NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`COMMENT ON TABLE audit_logs IS 'Audit log must not store raw credentials, raw refresh secrets, unmasked parent contact data, or sensitive counseling notes. tenant_id is nullable only for platform-level/system events that cannot be attributed to a tenant.'`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON audit_logs(tenant_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_user_id ON audit_logs(actor_user_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id ON audit_logs(request_id)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS audit_logs`);
  }
}
