import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnableExtensions1700000000001 implements MigrationInterface {
  name = 'EnableExtensions1700000000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
  }

  async down(): Promise<void> {
    // Extensions are intentionally not dropped because other database objects may depend on them.
  }
}
