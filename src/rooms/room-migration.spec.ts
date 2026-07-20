import { QueryRunner } from 'typeorm';

import { CreateRoomsTable1784022680000 } from '../database/migrations/1784022680000-CreateRoomsTable';
import { RoomSecurityHotfix1784050500000 } from '../database/migrations/1784050500000-RoomSecurityHotfix';

describe('CreateRoomsTable migration', () => {
  it('creates rooms table and deterministic indexes', async () => {
    const queries: string[] = [];
    const queryRunner = { query: jest.fn(async (query: string) => queries.push(query)) } as unknown as QueryRunner;
    const migration = new CreateRoomsTable1784022680000();

    await migration.up(queryRunner);

    expect(queries.join('\n')).toContain('CREATE TABLE IF NOT EXISTS rooms');
    expect(queries.join('\n')).toContain('tenant_id uuid NOT NULL');
    expect(queries.join('\n')).toContain('branch_id uuid NOT NULL');
    expect(queries.join('\n')).toContain('uq_rooms_tenant_branch_code');
    expect(queries.join('\n')).toContain('idx_rooms_tenant_branch_status');
    expect(queries.join('\n')).toContain('idx_rooms_tenant_branch_name');
  });

  it('drops indexes and rooms table on revert', async () => {
    const queries: string[] = [];
    const queryRunner = { query: jest.fn(async (query: string) => queries.push(query)) } as unknown as QueryRunner;
    const migration = new CreateRoomsTable1784022680000();

    await migration.down(queryRunner);

    expect(queries).toEqual([
      'DROP INDEX IF EXISTS idx_rooms_tenant_branch_name',
      'DROP INDEX IF EXISTS idx_rooms_tenant_branch_status',
      'DROP INDEX IF EXISTS uq_rooms_tenant_branch_code',
      'DROP TABLE IF EXISTS rooms',
    ]);
  });
});

describe('RoomSecurityHotfix migration', () => {
  it('adds same-tenant branch FK and active room uniqueness without owning Branch indexes', async () => {
    const queries: string[] = [];
    const queryRunner = { query: jest.fn(async (query: string) => queries.push(query)) } as unknown as QueryRunner;
    const migration = new RoomSecurityHotfix1784050500000();

    await migration.up(queryRunner);

    const sql = queries.join('\n');
    expect(sql).toContain('fk_rooms_branch_same_tenant');
    expect(sql).toContain('FOREIGN KEY (tenant_id, branch_id)');
    expect(sql).toContain('uq_rooms_tenant_branch_code_active');
    expect(sql).toContain('uq_rooms_tenant_branch_name_active');
    expect(sql).toContain("status = 'active'");
    expect(sql).not.toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_branches_tenant_id');
    expect(sql).not.toContain('DROP INDEX IF EXISTS uq_branches_tenant_id');
  });

  it('reverts only Room-owned security constraints in deterministic order', async () => {
    const queries: string[] = [];
    const queryRunner = { query: jest.fn(async (query: string) => queries.push(query)) } as unknown as QueryRunner;
    const migration = new RoomSecurityHotfix1784050500000();

    await migration.down(queryRunner);

    expect(queries).toEqual([
      'DROP INDEX IF EXISTS uq_rooms_tenant_branch_name_active',
      'DROP INDEX IF EXISTS uq_rooms_tenant_branch_code_active',
      'ALTER TABLE rooms DROP CONSTRAINT IF EXISTS fk_rooms_branch_same_tenant',
      'CREATE UNIQUE INDEX IF NOT EXISTS uq_rooms_tenant_branch_code ON rooms (tenant_id, branch_id, lower(code)) WHERE code IS NOT NULL',
    ]);
  });
});
