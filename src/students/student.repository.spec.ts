import { RequestContext } from '../common/context/request-context';
import { TenantScopeRequiredError } from '../common/tenant/tenant-scope.error';
import {
  StudentGroupMembershipStatus,
  StudentGroupMember,
} from './student-group-member.entity';
import { StudentRepository } from './student.repository';
import { StudentEnrollmentStatus } from './student.entity';

function queryBuilder() {
  const qb: any = {
    select: jest.fn(() => qb),
    from: jest.fn(() => qb),
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    innerJoin: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    addOrderBy: jest.fn(() => qb),
    skip: jest.fn(() => qb),
    take: jest.fn(() => qb),
    getMany: jest.fn(async () => []),
    getManyAndCount: jest.fn(async () => [[], 0]),
    getOne: jest.fn(async () => null),
    getRawOne: jest.fn(async () => ({ exists: '1' })),
  };
  return qb;
}

function repositoryWith(options: {
  studentsQb?: any;
  groupsQb?: any;
  membersQb?: any;
} = {}): {
  repository: StudentRepository;
  studentsQb: any;
  groupsQb: any;
  membersQb: any;
} {
  const studentsQb = options.studentsQb ?? queryBuilder();
  const groupsQb = options.groupsQb ?? queryBuilder();
  const membersQb = options.membersQb ?? queryBuilder();
  const repository = new StudentRepository(
    {
      createQueryBuilder: jest.fn(() => studentsQb),
      manager: { createQueryBuilder: jest.fn(() => studentsQb) },
    } as any,
    { createQueryBuilder: jest.fn(() => groupsQb) } as any,
    { createQueryBuilder: jest.fn(() => membersQb) } as any,
  );
  return { repository, studentsQb, groupsQb, membersQb };
}

describe('StudentRepository tenant/branch roster scope', () => {
  const ctx: RequestContext = { requestId: 'req-1', tenantId: 'tenant-a' };

  it('rejects missing tenant context before repository access', async () => {
    const { repository, studentsQb } = repositoryWith();
    await expect(
      repository.list(
        { requestId: 'missing' },
        { branchId: 'branch-a' },
      ),
    ).rejects.toThrow(TenantScopeRequiredError);
    expect(studentsQb.where).not.toHaveBeenCalled();
  });

  it('scopes student list by tenant, branch, active enrollment and soft-delete', async () => {
    const studentsQb = queryBuilder();
    studentsQb.getManyAndCount.mockResolvedValueOnce([
      [
        {
          id: 'student-1',
          tenantId: 'tenant-a',
          branchId: 'branch-a',
          firstName: 'Ada',
          lastName: 'Yılmaz',
          studentCode: 'S-1',
          enrollmentStatus: StudentEnrollmentStatus.ACTIVE,
        },
      ],
      1,
    ]);
    const { repository } = repositoryWith({ studentsQb });

    const result = await repository.list(ctx, {
      branchId: 'branch-a',
      page: '2',
      limit: '10',
    });

    expect(studentsQb.where).toHaveBeenCalledWith(
      'student.tenant_id = :tenantId',
      { tenantId: 'tenant-a' },
    );
    expect(studentsQb.andWhere).toHaveBeenCalledWith(
      'student.branch_id = :branchId',
      { branchId: 'branch-a' },
    );
    expect(studentsQb.andWhere).toHaveBeenCalledWith(
      'student.deleted_at IS NULL',
    );
    expect(studentsQb.andWhere).toHaveBeenCalledWith(
      'student.enrollment_status = :enrollmentStatus',
      { enrollmentStatus: StudentEnrollmentStatus.ACTIVE },
    );
    expect(studentsQb.skip).toHaveBeenCalledWith(10);
    expect(studentsQb.take).toHaveBeenCalledWith(10);
    expect(result.meta).toEqual({
      page: 2,
      limit: 10,
      total: 1,
      totalPages: 1,
    });
    expect(result.data[0].id).toBe('student-1');
  });

  it('joins only active memberships when filtering by student group', async () => {
    const { repository, studentsQb } = repositoryWith();
    await repository.list(ctx, {
      branchId: 'branch-a',
      studentGroupId: 'group-a',
    });

    expect(studentsQb.innerJoin).toHaveBeenCalledWith(
      StudentGroupMember,
      'member',
      expect.stringContaining('member.deleted_at IS NULL'),
      { membershipStatus: StudentGroupMembershipStatus.ACTIVE },
    );
    expect(studentsQb.andWhere).toHaveBeenCalledWith(
      'member.student_group_id = :studentGroupId',
      { studentGroupId: 'group-a' },
    );
  });

  it('parameterizes and escapes search wildcards', async () => {
    const { repository, studentsQb } = repositoryWith();
    await repository.list(ctx, {
      branchId: 'branch-a',
      search: ' 50%_\\ ',
    });

    const searchCall = studentsQb.andWhere.mock.calls.find(
      (call: unknown[]) =>
        typeof call[1] === 'object' &&
        call[1] !== null &&
        'search' in (call[1] as Record<string, unknown>),
    );
    expect(searchCall?.[0]).toContain('ILIKE :search');
    expect(searchCall?.[1]).toEqual({ search: '%50\\%\\_\\\\%' });
  });

  it('scopes detail reads by tenant and applies the active branch when present', async () => {
    const { repository, studentsQb } = repositoryWith();
    await repository.findById({ ...ctx, branchId: 'branch-a' }, 'student-1');

    expect(studentsQb.where).toHaveBeenCalledWith(
      'student.id = :id AND student.tenant_id = :tenantId',
      { id: 'student-1', tenantId: 'tenant-a' },
    );
    expect(studentsQb.andWhere).toHaveBeenCalledWith(
      'student.deleted_at IS NULL',
    );
    expect(studentsQb.andWhere).toHaveBeenCalledWith(
      'student.branch_id = :branchId',
      { branchId: 'branch-a' },
    );
  });

  it('scopes group lookup by tenant, branch and soft-delete', async () => {
    const { repository, groupsQb } = repositoryWith();
    await repository.findGroupById(ctx, 'group-a', 'branch-a');

    expect(groupsQb.where).toHaveBeenCalledWith(
      'group.id = :groupId AND group.tenant_id = :tenantId',
      { groupId: 'group-a', tenantId: 'tenant-a' },
    );
    expect(groupsQb.andWhere).toHaveBeenCalledWith(
      'group.deleted_at IS NULL',
    );
    expect(groupsQb.andWhere).toHaveBeenCalledWith(
      'group.branch_id = :branchId',
      { branchId: 'branch-a' },
    );
  });

  it('returns only active, enrolled students for a roster', async () => {
    const studentsQb = queryBuilder();
    studentsQb.getManyAndCount.mockResolvedValueOnce([[], 0]);
    const { repository } = repositoryWith({ studentsQb });

    await repository.roster(
      ctx,
      {
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
      } as any,
      { page: '1', limit: '50' },
    );

    expect(studentsQb.innerJoin).toHaveBeenCalledWith(
      StudentGroupMember,
      'member',
      expect.stringContaining('member.status = :membershipStatus'),
      { membershipStatus: StudentGroupMembershipStatus.ACTIVE },
    );
    expect(studentsQb.andWhere).toHaveBeenCalledWith(
      'student.enrollment_status = :enrollmentStatus',
      { enrollmentStatus: StudentEnrollmentStatus.ACTIVE },
    );
    expect(studentsQb.andWhere).toHaveBeenCalledWith(
      'member.student_group_id = :studentGroupId',
      { studentGroupId: 'group-a' },
    );
    expect(studentsQb.take).toHaveBeenCalledWith(50);
  });

  it('derives the attendance roster from active memberships in deterministic order', async () => {
    const membersQb = queryBuilder();
    membersQb.getMany.mockResolvedValueOnce([
      { studentId: 'student-1' },
      { studentId: 'student-2' },
    ]);
    const { repository } = repositoryWith({ membersQb });

    await expect(
      repository.listRosterStudentIds(ctx, 'branch-a', 'group-a'),
    ).resolves.toEqual(['student-1', 'student-2']);

    expect(membersQb.where).toHaveBeenCalledWith(
      'member.tenant_id = :tenantId',
      { tenantId: 'tenant-a' },
    );
    expect(membersQb.andWhere).toHaveBeenCalledWith(
      'member.branch_id = :branchId',
      { branchId: 'branch-a' },
    );
    expect(membersQb.andWhere).toHaveBeenCalledWith(
      'member.deleted_at IS NULL',
    );
    expect(membersQb.andWhere).toHaveBeenCalledWith(
      'member.status = :membershipStatus',
      { membershipStatus: StudentGroupMembershipStatus.ACTIVE },
    );
  });

  it('validates only active same-tenant branches', async () => {
    const { repository, studentsQb } = repositoryWith();
    await expect(
      repository.branchExistsInTenant(ctx, 'branch-a'),
    ).resolves.toBe(true);

    expect(studentsQb.where).toHaveBeenCalledWith(
      'branch.id = :branchId AND branch.tenant_id = :tenantId',
      { branchId: 'branch-a', tenantId: 'tenant-a' },
    );
    expect(studentsQb.andWhere).toHaveBeenCalledWith(
      'branch.status = :status',
      { status: 'active' },
    );
    expect(studentsQb.andWhere).toHaveBeenCalledWith(
      'branch.deleted_at IS NULL',
    );
  });
});
