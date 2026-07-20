import { MigrationInterface, QueryRunner } from 'typeorm';

export class RoomSecurityHotfix1784050500000 implements MigrationInterface {
  name = 'RoomSecurityHotfix1784050500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE rooms DROP CONSTRAINT IF EXISTS fk_rooms_branch_same_tenant`);
    await queryRunner.query(`
      ALTER TABLE rooms
      ADD CONSTRAINT fk_rooms_branch_same_tenant
      FOREIGN KEY (tenant_id, branch_id)
      REFERENCES branches (tenant_id, id)
      ON DELETE RESTRICT
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_rooms_tenant_branch_code`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_rooms_tenant_branch_code_active ON rooms (tenant_id, branch_id, lower(code)) WHERE code IS NOT NULL AND status = 'active'`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_rooms_tenant_branch_name_active ON rooms (tenant_id, branch_id, lower(name)) WHERE status = 'active'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_rooms_tenant_branch_name_active`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_rooms_tenant_branch_code_active`);
    await queryRunner.query(`ALTER TABLE rooms DROP CONSTRAINT IF EXISTS fk_rooms_branch_same_tenant`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_rooms_tenant_branch_code ON rooms (tenant_id, branch_id, lower(code)) WHERE code IS NOT NULL`);
  }
}
