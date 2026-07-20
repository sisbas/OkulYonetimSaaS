import { QueryRunner } from 'typeorm';

import { CreateTimeSlotsTable1784520000000 } from '../database/migrations/1784520000000-CreateTimeSlotsTable';

describe('CreateTimeSlotsTable migration', () => {
  it('requires the shared Branch composite index without creating or owning it', async () => {
    const queries: string[] = [];
    const runner = { query: jest.fn(async (query: string) => queries.push(query)) } as unknown as QueryRunner;
    await new CreateTimeSlotsTable1784520000000().up(runner);
    const sql = queries.join('\n');
    expect(sql).toContain("index_relation.relname = 'uq_branches_tenant_id'");
    expect(sql).toContain("pg_get_indexdef(index_relation.oid) LIKE '%(tenant_id, id)%'");
    expect(sql).toContain('Required shared Branch index uq_branches_tenant_id');
    expect(sql).not.toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_branches_tenant_id');
    expect(sql).not.toContain('DROP INDEX IF EXISTS uq_branches_tenant_id');
  });

  it('creates constraints, same-tenant FK and TimeSlot-owned indexes', async () => {
    const queries: string[] = [];
    const runner = { query: jest.fn(async (query: string) => queries.push(query)) } as unknown as QueryRunner;
    await new CreateTimeSlotsTable1784520000000().up(runner);
    const sql = queries.join('\n');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS time_slots');
    expect(sql).toContain('CHECK (day_of_week BETWEEN 1 AND 7)');
    expect(sql).toContain('CHECK (end_time > start_time)');
    expect(sql).toContain('FOREIGN KEY (tenant_id, branch_id)');
    expect(sql).toContain('uq_time_slots_active_interval');
    expect(sql).toContain("WHERE status = 'active'");
    expect(sql).toContain('idx_time_slots_tenant_branch_day_status_order');
    expect(sql).not.toContain('EXCLUDE USING gist');
    expect(sql).not.toContain('btree_gist');
  });

  it('drops only TimeSlot-owned indexes and table on revert', async () => {
    const queries: string[] = [];
    const runner = { query: jest.fn(async (query: string) => queries.push(query)) } as unknown as QueryRunner;
    await new CreateTimeSlotsTable1784520000000().down(runner);
    expect(queries).toEqual([
      'DROP INDEX IF EXISTS idx_time_slots_tenant_branch_day_status_order',
      'DROP INDEX IF EXISTS uq_time_slots_active_interval',
      'DROP TABLE IF EXISTS time_slots',
    ]);
  });
});
