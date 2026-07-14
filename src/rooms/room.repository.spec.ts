import { RequestContext } from '../common/context/request-context';
import { TenantScopeRequiredError } from '../common/tenant/tenant-scope.error';
import { RoomRepository } from './room.repository';

function createQueryBuilder() {
  const qb: any = {
    select: jest.fn(() => qb),
    from: jest.fn(() => qb),
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    skip: jest.fn(() => qb),
    take: jest.fn(() => qb),
    getCount: jest.fn(async () => 1),
    getManyAndCount: jest.fn(async () => [[], 0]),
    getOne: jest.fn(async () => null),
    getRawOne: jest.fn(async () => ({ exists: '1' })),
  };
  return qb;
}

function repositoryWith(qb: any): RoomRepository {
  return new RoomRepository({ createQueryBuilder: jest.fn(() => qb), manager: { createQueryBuilder: jest.fn(() => qb) } } as any);
}

describe('RoomRepository tenant isolation', () => {
  const ctx: RequestContext = { requestId: 'req-1', tenantId: 'tenant-a' };

  it('requires tenant scope for list queries', async () => {
    const repository = new RoomRepository({ createQueryBuilder: jest.fn() } as any);

    await expect(repository.list({ requestId: 'req-missing' })).rejects.toThrow(TenantScopeRequiredError);
  });

  it('scopes list queries by tenant_id, branch_id and active status', async () => {
    const qb = createQueryBuilder();
    const repository = repositoryWith(qb);

    await repository.list(ctx, { page: '2', limit: '5', branchId: 'branch-a', search: 'lab' });

    expect(qb.where).toHaveBeenCalledWith('room.tenant_id = :tenantId', { tenantId: 'tenant-a' });
    expect(qb.andWhere).toHaveBeenCalledWith('room.branch_id = :branchId', { branchId: 'branch-a' });
    expect(qb.andWhere).toHaveBeenCalledWith('room.status = :status', { status: 'active' });
    expect(qb.skip).toHaveBeenCalledWith(5);
    expect(qb.take).toHaveBeenCalledWith(5);
  });

  it('scopes findById by id and tenant_id so cross-tenant records stay hidden', async () => {
    const qb = createQueryBuilder();
    const repository = repositoryWith(qb);

    await repository.findById(ctx, 'room-b');

    expect(qb.where).toHaveBeenCalledWith('room.id = :id AND room.tenant_id = :tenantId', {
      id: 'room-b',
      tenantId: 'tenant-a',
    });
  });

  it('checks same-tenant room existence without global tenant bypass queries', async () => {
    const qb = createQueryBuilder();
    const repository = repositoryWith(qb);

    await expect(repository.existsByIdInTenant(ctx, 'room-b')).resolves.toBe(true);

    expect(qb.where).toHaveBeenCalledWith('room.id = :id AND room.tenant_id = :tenantId', {
      id: 'room-b',
      tenantId: 'tenant-a',
    });
    expect(Object.prototype.hasOwnProperty.call(repository, 'existsByIdAnyTenant')).toBe(false);
  });

  it('validates branch existence inside the current active tenant only', async () => {
    const qb = createQueryBuilder();
    const repository = repositoryWith(qb);

    await expect(repository.branchExistsInTenant(ctx, 'branch-a')).resolves.toBe(true);

    expect(qb.select).toHaveBeenCalledWith('1', 'exists');
    expect(qb.from).toHaveBeenCalledWith('branches', 'branch');
    expect(qb.where).toHaveBeenCalledWith('branch.id = :branchId AND branch.tenant_id = :tenantId', {
      branchId: 'branch-a',
      tenantId: 'tenant-a',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('branch.status = :status', { status: 'active' });
    expect(qb.andWhere).toHaveBeenCalledWith('branch.deleted_at IS NULL');
  });

  it('performs duplicate code lookup inside the same active tenant and branch', async () => {
    const qb = createQueryBuilder();
    const repository = repositoryWith(qb);

    await repository.findByCode(ctx, 'branch-a', 'LAB-1');

    expect(qb.where).toHaveBeenCalledWith('room.tenant_id = :tenantId', { tenantId: 'tenant-a' });
    expect(qb.andWhere).toHaveBeenCalledWith('room.branch_id = :branchId', { branchId: 'branch-a' });
    expect(qb.andWhere).toHaveBeenCalledWith('LOWER(room.code) = :code', { code: 'lab-1' });
    expect(qb.andWhere).toHaveBeenCalledWith('room.status = :status', { status: 'active' });
  });

  it('performs duplicate name lookup inside the same active tenant and branch', async () => {
    const qb = createQueryBuilder();
    const repository = repositoryWith(qb);

    await repository.findByName(ctx, 'branch-a', 'Derslik 1');

    expect(qb.where).toHaveBeenCalledWith('room.tenant_id = :tenantId', { tenantId: 'tenant-a' });
    expect(qb.andWhere).toHaveBeenCalledWith('room.branch_id = :branchId', { branchId: 'branch-a' });
    expect(qb.andWhere).toHaveBeenCalledWith('LOWER(room.name) = :name', { name: 'derslik 1' });
    expect(qb.andWhere).toHaveBeenCalledWith('room.status = :status', { status: 'active' });
  });
});
