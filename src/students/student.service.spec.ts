import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';

import { RequestContext } from '../common/context/request-context';
import { StudentGroup } from './student-group.entity';
import { Student } from './student.entity';
import { StudentRepository } from './student.repository';
import { StudentService } from './student.service';

const student = (overrides: Partial<Student> = {}): Student =>
  ({
    id: 'student-1',
    tenantId: 'tenant-a',
    branchId: 'branch-a',
    studentCode: 'S-1',
    firstName: 'Ada',
    lastName: 'Yılmaz',
    birthDate: '2012-01-01',
    gender: 'female',
    enrollmentStatus: 'active',
    enrollmentDate: '2025-09-01',
    createdAt: new Date(),
    updatedAt: new Date(),
    deactivatedAt: null,
    deletedAt: null,
    ...overrides,
  }) as Student;

const group = (overrides: Partial<StudentGroup> = {}): StudentGroup =>
  ({
    id: 'group-a',
    tenantId: 'tenant-a',
    branchId: 'branch-a',
    name: '9-A',
    code: '9A',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    deactivatedAt: null,
    deletedAt: null,
    ...overrides,
  }) as StudentGroup;

function serviceWith(repository: Partial<StudentRepository>): StudentService {
  return new StudentService(repository as StudentRepository);
}

describe('StudentService read-only roster surface', () => {
  const ctx: RequestContext = {
    requestId: 'req-1',
    tenantId: 'tenant-a',
    branchId: 'branch-a',
  };

  it('requires a branch when neither the request nor the active context has one', async () => {
    const service = serviceWith({});
    await expect(
      service.list({ requestId: 'req-1', tenantId: 'tenant-a' }, {}),
    ).rejects.toThrow(BadRequestException);
  });

  it('returns non-enumerating 404 for a branch outside the tenant', async () => {
    const service = serviceWith({
      branchExistsInTenant: jest.fn(async () => false),
    });
    await expect(
      service.list(ctx, { branchId: 'branch-other' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('filters by an explicit group only after proving it is visible in the branch', async () => {
    const list = jest.fn(async () => ({
      data: [student()],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    }));
    const service = serviceWith({
      branchExistsInTenant: jest.fn(async () => true),
      findGroupById: jest.fn(async () => group()),
      list,
    });

    const result = await service.list(ctx, {
      branchId: 'branch-a',
      studentGroupId: 'group-a',
    });

    expect(list).toHaveBeenCalledWith(ctx, {
      branchId: 'branch-a',
      studentGroupId: 'group-a',
      search: undefined,
      page: undefined,
      limit: undefined,
    });
    expect(result.data[0]).toEqual({
      id: 'student-1',
      branchId: 'branch-a',
      studentCode: 'S-1',
      firstName: 'Ada',
      lastName: 'Yılmaz',
      enrollmentStatus: 'active',
    });
  });

  it('never includes birth date, gender or guardian fields in student output', async () => {
    const service = serviceWith({
      branchExistsInTenant: jest.fn(async () => true),
      list: jest.fn(async () => ({
        data: [student()],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      })),
    });

    const result = await service.list(ctx, {});
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain('birthDate');
    expect(serialized).not.toContain('gender');
    expect(serialized).not.toContain('guardian');
    expect(serialized).not.toContain('phone');
    expect(serialized).not.toContain('email');
  });

  it('returns a non-enumerating 404 for a missing student', async () => {
    const service = serviceWith({ findById: jest.fn(async () => null) });
    await expect(service.get(ctx, 'student-missing')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('returns the roster with its group summary and pagination meta', async () => {
    const roster = jest.fn(async () => ({
      data: [student(), student({ id: 'student-2', firstName: 'Bora' })],
      meta: { page: 1, limit: 50, total: 2, totalPages: 1 },
    }));
    const expectedGroup = group();
    const service = serviceWith({
      branchExistsInTenant: jest.fn(async () => true),
      findGroupById: jest.fn(async () => expectedGroup),
      roster,
    });

    const result = await service.roster(ctx, 'group-a', {});

    expect(result.studentGroup).toEqual({
      id: 'group-a',
      branchId: 'branch-a',
      name: '9-A',
      code: '9A',
    });
    expect(result.data).toHaveLength(2);
    expect(result.meta.total).toBe(2);
    expect(roster).toHaveBeenCalledWith(ctx, expectedGroup, {
      page: undefined,
      limit: undefined,
    });
  });

  it('uses the active branch context when the roster request omits branchId', async () => {
    const findGroupById = jest.fn(async () => group());
    const service = serviceWith({
      branchExistsInTenant: jest.fn(async () => true),
      findGroupById,
      roster: jest.fn(async () => ({
        data: [],
        meta: { page: 1, limit: 50, total: 0, totalPages: 0 },
      })),
    });

    await service.roster(ctx, 'group-a', {});

    expect(findGroupById).toHaveBeenCalledWith(ctx, 'group-a', 'branch-a');
  });

  it('returns a non-enumerating 404 for a group outside the active branch', async () => {
    const service = serviceWith({
      branchExistsInTenant: jest.fn(async () => true),
      findGroupById: jest.fn(async () => null),
    });

    await expect(service.roster(ctx, 'group-other', {})).rejects.toThrow(
      NotFoundException,
    );
  });
});
