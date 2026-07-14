import { RequestContext } from '../common/context/request-context';
import { TenantScopeRequiredError } from '../common/tenant/tenant-scope.error';
import { RoomRepository } from './room.repository';

function createQueryBuilder() {
  const qb: any = {
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    skip: jest.fn(() => qb),
    take: jest.fn(() => qb),
    getCount: jest.fn(async () => 1),
    getManyAndCount: jest.fn(async () => [[], 0]),
    getOne: jest.fn(async () => null),
  };
  return qb;
}

describe('RoomRepository tenant isolation', () => {
  const ctx: RequestContext = { requestId: 'req-1', tenantId: 'tenant-a' };

  it('requires tenant scope for list queries', async () => {
    const repository = new RoomRepository({ createQueryBuilder: jest.fn() } as any);

    await expect(repository.list({ requestId: 'req-missing' })).rejects.toThrow(TenantScopeRequiredError);
  });

  it('scopes list queries by tenant_id, branch_id and active status', async () => {
    const qb = createQueryBuilder();
    const repository = new RoomRepository({ createQueryBuilder: jest.fn(() => qb) } as any);

    await repository.list(ctx, { page: '2', limit: '5', branchId: 'branch-a', search: 'lab' });

    expect(qb.where).toHaveBeenCalledWith('room.tenant_id = :tenantId', { tenantId: 'tenant-a' });
    expect(qb.andWhere).toHaveBeenCalledWith('room.branch_id = :branchId', { branchId: 'branch-a' });
    expect(qb.andWhere).toHaveBeenCalledWith('room.status = :status', { status: 'active' });
    expect(qb.skip).toHaveBeenCalledWith(5);
    expect(qb.take).toHaveBeenCalledWith(5);
  });

  it('scopes findById by id and tenant_id so cross-tenant records stay hidden', async () => {
    const qb = createQueryBuilder();
    const repository = new RoomRepository({ createQueryBuilder: jest.fn(() => qb) } as any);

    await repository.findById(ctx, 'room-b');

    expect(qb.where).toHaveBeenCalledWith('room.id = :id AND room.tenant_id = :tenantId', {
      id: 'room-b',
      tenantId: 'tenant-a',
    });
  });

  it('checks same-tenant existence before cross-tenant audit classification', async () => {
    const qb = createQueryBuilder();
    const repository = new RoomRepository({ createQueryBuilder: jest.fn(() => qb) } as any);

    await expect(repository.existsByIdInTenant(ctx, 'room-b')).resolves.toBe(true);

    expect(qb.where).toHaveBeenCalledWith('room.id = :id AND room.tenant_id = :tenantId', {
      id: 'room-b',
      tenantId: 'tenant-a',
    });
  });

  it('checks raw existence by id only for internal tenant.access_denied audit classification', async () => {
    const qb = createQueryBuilder();
    const repository = new RoomRepository({ createQueryBuilder: jest.fn(() => qb) } as any);

    await expect(repository.existsByIdAnyTenant('room-b')).resolves.toBe(true);

    expect(qb.where).toHaveBeenCalledWith('room.id = :id', { id: 'room-b' });
  });

  it('performs duplicate lookup inside the same tenant and branch', async () => {
    const qb = createQueryBuilder();
    const repository = new RoomRepository({ createQueryBuilder: jest.fn(() => qb) } as any);

    await repository.findByCode(ctx, 'branch-a', 'LAB-1');

    expect(qb.where).toHaveBeenCalledWith('room.tenant_id = :tenantId', { tenantId: 'tenant-a' });
    expect(qb.andWhere).toHaveBeenCalledWith('room.branch_id = :branchId', { branchId: 'branch-a' });
    expect(qb.andWhere).toHaveBeenCalledWith('LOWER(room.code) = :code', { code: 'lab-1' });
  });
});
