import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsers1700000000005 implements MigrationInterface {
  name = 'CreateUsers1700000000005';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email varchar(255) NOT NULL UNIQUE,
        credential_hash text NOT NULL,
        full_name varchar(255) NOT NULL,
        status varchar(30) NOT NULL DEFAULT 'active',
        last_login_at timestamptz NULL,
        token_version int NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz NULL,
        CONSTRAINT chk_users_status CHECK (status IN ('active', 'inactive', 'deleted'))
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_users_active_email ON users(email) WHERE status = 'active'`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS users`);
  }
}
