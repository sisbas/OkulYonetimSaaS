import { QueryRunner } from 'typeorm';

import { CreateBranches1700000000003 } from '../database/migrations/1700000000003-CreateBranches';

describe('CreateBranches migration ownership', () => {
  it('creates the shared tenant and id composite unique index', async () => {
    const queries: string[] = [];
    const queryRunner = { query: jest.fn(async (query: string) => queries.push(query)) } as unknown as QueryRunner;

    await new CreateBranches1700000000003().up(queryRunner);

    const sql = queries.join('\n');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS branches');
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_branches_tenant_id ON branches(tenant_id, id)');
  });

  it('owns the index through the Branch table lifecycle', async () => {
    const queries: string[] = [];
    const queryRunner = { query: jest.fn(async (query: string) => queries.push(query)) } as unknown as QueryRunner;

    await new CreateBranches1700000000003().down(queryRunner);

    expect(queries).toEqual(['DROP TABLE IF EXISTS branches']);
    expect(queries.join('\n')).not.toContain('DROP INDEX IF EXISTS uq_branches_tenant_id');
  });
});
