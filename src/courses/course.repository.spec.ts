import { RequestContext } from '../common/context/request-context';
import { TenantScopeRequiredError } from '../common/tenant/tenant-scope.error';
import { CourseRepository } from './course.repository';

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

describe('CourseRepository tenant isolation', () => {
  const ctx: RequestContext = { requestId: 'req-1', tenantId: 'tenant-a' };

  it('requires tenant scope for list queries', async () => {
    const repository = new CourseRepository({ createQueryBuilder: jest.fn() } as any);

    await expect(repository.list({ requestId: 'req-missing' })).rejects.toThrow(TenantScopeRequiredError);
  });

  it('scopes list queries by tenant_id and paginates', async () => {
    const qb = createQueryBuilder();
    const repository = new CourseRepository({ createQueryBuilder: jest.fn(() => qb) } as any);

    await repository.list(ctx, { page: '2', limit: '5', search: 'mat' });

    expect(qb.where).toHaveBeenCalledWith('course.tenant_id = :tenantId', { tenantId: 'tenant-a' });
    expect(qb.andWhere).toHaveBeenCalledWith('course.status = :status', { status: 'active' });
    expect(qb.skip).toHaveBeenCalledWith(5);
    expect(qb.take).toHaveBeenCalledWith(5);
  });

  it('scopes findById by id and tenant_id so cross-tenant records stay hidden', async () => {
    const qb = createQueryBuilder();
    const repository = new CourseRepository({ createQueryBuilder: jest.fn(() => qb) } as any);

    await repository.findById(ctx, 'course-b');

    expect(qb.where).toHaveBeenCalledWith('course.id = :id AND course.tenant_id = :tenantId', {
      id: 'course-b',
      tenantId: 'tenant-a',
    });
  });

  it('checks same-tenant existence before cross-tenant audit classification', async () => {
    const qb = createQueryBuilder();
    const repository = new CourseRepository({ createQueryBuilder: jest.fn(() => qb) } as any);

    await expect(repository.existsByIdInTenant(ctx, 'course-b')).resolves.toBe(true);

    expect(qb.where).toHaveBeenCalledWith('course.id = :id AND course.tenant_id = :tenantId', {
      id: 'course-b',
      tenantId: 'tenant-a',
    });
  });

  it('checks raw existence by id only for internal tenant.access_denied audit classification', async () => {
    const qb = createQueryBuilder();
    const repository = new CourseRepository({ createQueryBuilder: jest.fn(() => qb) } as any);

    await expect(repository.existsByIdAnyTenant('course-b')).resolves.toBe(true);

    expect(qb.where).toHaveBeenCalledWith('course.id = :id', { id: 'course-b' });
  });

  it('performs duplicate lookup inside the same tenant', async () => {
    const qb = createQueryBuilder();
    const repository = new CourseRepository({ createQueryBuilder: jest.fn(() => qb) } as any);

    await repository.findByCode(ctx, 'MAT-101');

    expect(qb.where).toHaveBeenCalledWith('course.tenant_id = :tenantId', { tenantId: 'tenant-a' });
    expect(qb.andWhere).toHaveBeenCalledWith('LOWER(course.code) = :code', { code: 'mat-101' });
  });
});
