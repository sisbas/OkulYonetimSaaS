import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserSessions1700000000008 implements MigrationInterface {
  name = 'CreateUserSessions1700000000008';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id),
        user_id uuid NOT NULL REFERENCES users(id),
        refresh_secret_hash text NOT NULL,
        ip_address varchar(80) NULL,
        user_agent text NULL,
        status varchar(30) NOT NULL DEFAULT 'active',
        expires_at timestamptz NOT NULL,
        revoked_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_user_sessions_status CHECK (status IN ('active', 'revoked', 'expired'))
      )
    `);
    await queryRunner.query(`COMMENT ON COLUMN user_sessions.refresh_secret_hash IS 'Hash of the refresh token secret; raw refresh tokens must never be stored.'`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_user_sessions_tenant_id ON user_sessions(tenant_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_user_sessions_status ON user_sessions(status)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_sessions_active_lookup ON user_sessions(user_id, tenant_id) WHERE status = 'active'`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS user_sessions`);
  }
}
