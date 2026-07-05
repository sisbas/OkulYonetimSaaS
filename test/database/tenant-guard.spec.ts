import { RequestContext } from '../../src/common/context/request-context';
import { TenantScopeRequiredError } from '../../src/common/tenant/tenant-scope.error';
import { tenantData, tenantWhere } from '../../src/common/tenant/tenant-query.helper';
import { BaseTenantRepository } from '../../src/database/repositories/base-tenant.repository';

describe('tenant repository guard', () => {
  const tenantA: RequestContext = { requestId: 'req-a', tenantId: 'tenant_a' };
  const tenantB: RequestContext = { requestId: 'req-b', tenantId: 'tenant_b' };

  function createManager() {
    const rows: Array<Record<string, unknown>> = [];
    const matches = (row: Record<string, unknown>, where: Record<string, unknown>) =>
      Object.entries(where).every(([key, value]) => row[key] === value);

    return {
      rows,
      find: jest.fn(async (_table: string, options: { where: Record<string, unknown> }) => rows.filter((row) => matches(row, options.where))),
      findOne: jest.fn(async (_table: string, options: { where: Record<string, unknown> }) => rows.find((row) => matches(row, options.where)) ?? null),
      insert: jest.fn(async (_table: string, values: Record<string, unknown>) => {
        const row = { id: values.id ?? `row_${rows.length + 1}`, ...values };
        rows.push(row);
        return { generatedMaps: [row] };
      }),
      update: jest.fn(async (_table: string, where: Record<string, unknown>, values: Record<string, unknown>) => {
        rows.forEach((row) => {
          if (matches(row, where)) Object.assign(row, values);
        });
        return { affected: rows.filter((row) => matches(row, where)).length };
      }),
    };
  }

  it('tenant-scoped repository method called without tenantId throws TenantScopeRequiredError', async () => {
    const repo = new BaseTenantRepository(createManager(), { tableName: 'branches' });

    await expect(repo.findMany({ requestId: 'test' })).rejects.toThrow(TenantScopeRequiredError);
  });

  it('filters cannot override ctx tenantId', () => {
    expect(tenantWhere(tenantA, { tenant_id: 'tenant_b', status: 'active' }, 'branches')).toEqual({
      status: 'active',
      tenant_id: 'tenant_a',
    });
  });

  it('client tenantId is ignored on create data', () => {
    expect(tenantData(tenantA, { tenant_id: 'tenant_b', name: 'Main' }, 'branches')).toEqual({
      name: 'Main',
      tenant_id: 'tenant_a',
    });
  });

  it('findMany returns only records in ctx tenant scope', async () => {
    const manager = createManager();
    const repo = new BaseTenantRepository(manager, { tableName: 'branches' });
    await repo.create(tenantA, { id: 'branch_a', name: 'A' });
    await repo.create(tenantB, { id: 'branch_b', name: 'B' });

    await expect(repo.findMany(tenantA)).resolves.toEqual([{ id: 'branch_a', name: 'A', tenant_id: 'tenant_a' }]);
  });

  it('findById returns null for cross-tenant records', async () => {
    const manager = createManager();
    const repo = new BaseTenantRepository(manager, { tableName: 'branches' });
    await repo.create(tenantB, { id: 'branch_b', name: 'B' });

    await expect(repo.findById(tenantA, 'branch_b')).resolves.toBeNull();
  });

  it('update and softDelete include tenant scope in where clause', async () => {
    const manager = createManager();
    const repo = new BaseTenantRepository(manager, { tableName: 'branches' });
    await repo.update(tenantA, 'branch_a', { name: 'Updated', tenant_id: 'tenant_b' });
    await repo.softDelete(tenantA, 'branch_a');

    expect(manager.update).toHaveBeenNthCalledWith(1, 'branches', { id: 'branch_a', tenant_id: 'tenant_a' }, { name: 'Updated' });
    expect(manager.update.mock.calls[1][1]).toEqual({ id: 'branch_a', tenant_id: 'tenant_a' });
    expect(manager.update.mock.calls[1][2].deleted_at).toBeInstanceOf(Date);
  });
});
