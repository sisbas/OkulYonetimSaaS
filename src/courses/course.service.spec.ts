import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import { RequestContext } from '../common/context/request-context';
import { CourseAuditService } from './course-audit.service';
import { Course, CourseStatus } from './course.entity';
import { CourseRepository } from './course.repository';
import { CourseService } from './course.service';

function course(overrides: Partial<Course> = {}): Course {
  const now = new Date('2026-07-14T00:00:00.000Z');
  return {
    id: 'course-1',
    tenantId: 'tenant-a',
    name: 'Matematik',
    code: 'MAT-101',
    description: 'TYT Matematik',
    status: CourseStatus.ACTIVE,
    createdAt: now,
    updatedAt: now,
    deactivatedAt: null,
    ...overrides,
  } as Course;
}

function setup() {
  const repository = {
    create: jest.fn(),
    findByCode: jest.fn(),
    findById: jest.fn(),
    list: jest.fn(),
    save: jest.fn(),
  } as unknown as jest.Mocked<CourseRepository>;
  const audit = { emit: jest.fn() } as unknown as jest.Mocked<CourseAuditService>;
  const service = new CourseService(repository, audit);
  const ctx: RequestContext = {
    requestId: 'req-1',
    tenantId: 'tenant-a',
    user: { userId: 'user-1', tenantId: 'tenant-a', roleIds: ['role-admin'], permissions: ['course:create'] },
  };
  return { audit, ctx, repository, service };
}

describe('CourseService', () => {
  it('creates a course and emits course.created without raw payload values', async () => {
    const { audit, ctx, repository, service } = setup();
    const created = course({ description: 'token=secret should not be audited' });
    repository.findByCode.mockResolvedValue(null);
    repository.create.mockResolvedValue(created);

    const result = await service.create(ctx, { name: ' Matematik ', code: 'mat-101', description: 'token=secret should not be audited' });

    expect(result.id).toBe('course-1');
    expect(repository.findByCode).toHaveBeenCalledWith(ctx, 'MAT-101');
    expect(repository.create).toHaveBeenCalledWith(ctx, { name: 'Matematik', code: 'MAT-101', description: 'token=secret should not be audited' });
    expect(audit.emit).toHaveBeenCalledWith(ctx, 'course.created', expect.objectContaining({ courseId: 'course-1' }));
    expect(JSON.stringify(audit.emit.mock.calls[0])).not.toContain('secret');
  });

  it('rejects duplicate code inside the same tenant', async () => {
    const { ctx, repository, service } = setup();
    repository.findByCode.mockResolvedValue(course());

    await expect(service.create(ctx, { name: 'Matematik', code: 'MAT-101' })).rejects.toThrow(ConflictException);
  });

  it('lists paginated courses', async () => {
    const { ctx, repository, service } = setup();
    repository.list.mockResolvedValue({ data: [course()], meta: { page: 1, limit: 20, total: 1, totalPages: 1 } });

    await expect(service.list(ctx, { page: '1', limit: '20' })).resolves.toMatchObject({ meta: { total: 1 } });
    expect(repository.list).toHaveBeenCalledWith(ctx, { page: '1', limit: '20' });
  });

  it('hides cross-tenant or missing records as 404', async () => {
    const { ctx, repository, service } = setup();
    repository.findById.mockResolvedValue(null);

    await expect(service.get(ctx, 'course-from-other-tenant')).rejects.toThrow(NotFoundException);
  });

  it('updates a course with tenant-scoped duplicate validation', async () => {
    const { audit, ctx, repository, service } = setup();
    const existing = course();
    repository.findById.mockResolvedValue(existing);
    repository.findByCode.mockResolvedValue(null);
    repository.save.mockImplementation(async (value) => value);

    const result = await service.update(ctx, 'course-1', { name: 'Geometri', code: 'geo-101' });

    expect(result.name).toBe('Geometri');
    expect(result.code).toBe('GEO-101');
    expect(repository.findByCode).toHaveBeenCalledWith(ctx, 'GEO-101', 'course-1');
    expect(audit.emit).toHaveBeenCalledWith(ctx, 'course.updated', expect.objectContaining({ changedFields: expect.arrayContaining(['name', 'code']) }));
  });

  it('deactivates and reactivates without hard delete', async () => {
    const { audit, ctx, repository, service } = setup();
    const active = course();
    repository.findById.mockResolvedValueOnce(active);
    repository.save.mockImplementationOnce(async (value) => value);

    await expect(service.deactivate(ctx, 'course-1')).resolves.toMatchObject({ status: CourseStatus.INACTIVE });
    expect(audit.emit).toHaveBeenCalledWith(ctx, 'course.deactivated', expect.objectContaining({ courseId: 'course-1' }));

    const inactive = course({ status: CourseStatus.INACTIVE, deactivatedAt: new Date() });
    repository.findById.mockResolvedValueOnce(inactive);
    repository.save.mockImplementationOnce(async (value) => value);

    await expect(service.reactivate(ctx, 'course-1')).resolves.toMatchObject({ status: CourseStatus.ACTIVE, deactivatedAt: null });
    expect(audit.emit).toHaveBeenCalledWith(ctx, 'course.reactivated', expect.objectContaining({ courseId: 'course-1' }));
  });

  it('rejects invalid inactive lifecycle transitions', async () => {
    const { ctx, repository, service } = setup();
    repository.findById.mockResolvedValue(course({ status: CourseStatus.INACTIVE, deactivatedAt: new Date() }));

    await expect(service.deactivate(ctx, 'course-1')).rejects.toThrow(BadRequestException);
  });
});
