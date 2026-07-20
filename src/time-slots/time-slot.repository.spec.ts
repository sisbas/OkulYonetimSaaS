import { RequestContext } from '../common/context/request-context';
import { TenantScopeRequiredError } from '../common/tenant/tenant-scope.error';
import { TimeSlotRepository } from './time-slot.repository';

function queryBuilder() {
  const qb: any = {
    select: jest.fn(() => qb),
    from: jest.fn(() => qb),
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    addOrderBy: jest.fn(() => qb),
    skip: jest.fn(() => qb),
    take: jest.fn(() => qb),
    setLock: jest.fn(() => qb),
    getMany: jest.fn(async () => []),
    getManyAndCount: jest.fn(async () => [[], 0]),
    getOne: jest.fn(async () => null),
    getRawOne: jest.fn(async () => ({ exists: '1' })),
  };
  return qb;
}

function repositoryWith(qb: any, query = jest.fn(async () => [])): TimeSlotRepository {
  return new TimeSlotRepository({
    createQueryBuilder: jest.fn(() => qb),
    manager: { createQueryBuilder: jest.fn(() => qb), query },
  } as any);
}

describe('TimeSlotRepository tenant isolation and conflicts', () => {
  const ctx: RequestContext = { requestId: 'req-1', tenantId: 'tenant-a' };

  it('rejects missing tenant context before repository access', async () => {
    const createQueryBuilder = jest.fn();
    const repository = new TimeSlotRepository({ createQueryBuilder } as any);
    await expect(repository.list({ requestId: 'missing' }, { branchId: 'branch-a' })).rejects.toThrow(TenantScopeRequiredError);
    expect(createQueryBuilder).not.toHaveBeenCalled();
  });

  it('scopes list and detail reads by tenant, branch and active status', async () => {
    const qb = queryBuilder();
    const repository = repositoryWith(qb);
    await repository.list(ctx, { branchId: 'branch-a', dayOfWeek: '2' });
    expect(qb.where).toHaveBeenCalledWith('slot.tenant_id = :tenantId', { tenantId: 'tenant-a' });
    expect(qb.andWhere).toHaveBeenCalledWith('slot.branch_id = :branchId', { branchId: 'branch-a' });
    expect(qb.andWhere).toHaveBeenCalledWith('slot.status = :status', { status: 'active' });

    await repository.findById(ctx, 'slot-from-tenant-b', true, true);
    expect(qb.where).toHaveBeenCalledWith('slot.id = :id AND slot.tenant_id = :tenantId', {
      id: 'slot-from-tenant-b',
      tenantId: 'tenant-a',
    });
    expect(qb.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(Object.prototype.hasOwnProperty.call(repository, 'existsByIdAnyTenant')).toBe(false);
  });

  it('uses the strict adjacent-safe overlap predicate and excludes current id', async () => {
    const qb = queryBuilder();
    const repository = repositoryWith(qb);
    await repository.findOverlap(ctx, 'branch-a', 1, '09:40', '10:20', 'slot-1');
    expect(qb.andWhere).toHaveBeenCalledWith('slot.start_time < :endTime', { endTime: '10:20' });
    expect(qb.andWhere).toHaveBeenCalledWith('slot.end_time > :startTime', { startTime: '09:40' });
    expect(qb.andWhere).toHaveBeenCalledWith('slot.id != :excludeId', { excludeId: 'slot-1' });
  });

  it('validates only active same-tenant branches', async () => {
    const qb = queryBuilder();
    const repository = repositoryWith(qb);
    await expect(repository.branchExistsInTenant(ctx, 'branch-a')).resolves.toBe(true);
    expect(qb.where).toHaveBeenCalledWith('branch.id = :branchId AND branch.tenant_id = :tenantId', {
      branchId: 'branch-a',
      tenantId: 'tenant-a',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('branch.status = :status', { status: 'active' });
    expect(qb.andWhere).toHaveBeenCalledWith('branch.deleted_at IS NULL');
  });

  it('deduplicates and sorts tenant, branch and day advisory transaction locks', async () => {
    const qb = queryBuilder();
    const query = jest.fn(async () => []);
    const repository = repositoryWith(qb, query);

    await repository.lockMutationScopes(ctx, [
      { branchId: 'branch-a', dayOfWeek: 2 },
      { branchId: 'branch-a', dayOfWeek: 1 },
      { branchId: 'branch-a', dayOfWeek: 2 },
    ]);

    expect(query.mock.calls).toEqual([
      [
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        ['time_slots:tenant-a:branch-a:1'],
      ],
      [
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        ['time_slots:tenant-a:branch-a:2'],
      ],
    ]);
  });
});
