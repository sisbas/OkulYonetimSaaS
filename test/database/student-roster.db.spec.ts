import { DataSource } from 'typeorm';

import { RequestContext } from '../../src/common/context/request-context';
import { CreateStudentGroupMembers1890000000000 } from '../../src/database/migrations/1890000000000-CreateStudentGroupMembers';
import { seedStudentRoster } from '../../src/database/seeds/student-roster.seed';
import { StudentGroupMember } from '../../src/students/student-group-member.entity';
import { StudentGroup } from '../../src/students/student-group.entity';
import { Student } from '../../src/students/student.entity';
import { StudentRepository } from '../../src/students/student.repository';

/**
 * #461 F1 — GERÇEK PostgreSQL üzerinde roster foundation kanıtı.
 *
 * Kanıtlanan özellikler:
 * - Migration idempotent up + composite FK postconditions
 * - Tenant/branch izolasyonu (cross-tenant ve cross-branch üyelik reddi)
 * - Aktif üyelik + aktif öğrenci filtresi; soft-delete edilen üyelik sızmaz
 * - Aynı grupta tek aktif üyelik (partial unique index)
 * - Roster sırası deterministik; F3 için sunucu-türetimli student ID listesi
 */
const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const describeWithPostgres = DATABASE_URL ? describe : describe.skip;

const TENANT_ID = '46100000-0000-4000-8000-000000000001';
const OTHER_TENANT_ID = '46100000-0000-4000-8000-000000000002';
const BRANCH_ID = '46100000-0000-4000-8000-000000000003';
const OTHER_BRANCH_ID = '46100000-0000-4000-8000-000000000004';
const GROUP_ID = '46100000-0000-4000-8000-000000000005';
const OTHER_GROUP_ID = '46100000-0000-4000-8000-000000000006';
const STUDENT_ACTIVE_ID = '46100000-0000-4000-8000-000000000007';
const STUDENT_INACTIVE_MEMBERSHIP_ID = '46100000-0000-4000-8000-000000000008';
const STUDENT_SOFT_DELETED_MEMBERSHIP_ID = '46100000-0000-4000-8000-000000000009';
const STUDENT_ENROLLMENT_INACTIVE_ID = '46100000-0000-4000-8000-000000000010';
const STUDENT_OTHER_GROUP_ID = '46100000-0000-4000-8000-000000000011';
const STUDENT_OTHER_BRANCH_ID = '46100000-0000-4000-8000-000000000012';
const STUDENT_OTHER_TENANT_ID = '46100000-0000-4000-8000-000000000013';
const STUDENT_OTHER_BRANCH_ORDER_ID = '46100000-0000-4000-8000-000000000014';
const OTHER_TENANT_BRANCH_ID = '46100000-0000-4000-8000-000000000015';

describeWithPostgres('student roster PostgreSQL (#461 F1)', () => {
  jest.setTimeout(30_000);

  let dataSource: DataSource;
  let repository: StudentRepository;
  const migration = new CreateStudentGroupMembers1890000000000();
  const ctx: RequestContext = { requestId: 'student-roster-db', tenantId: TENANT_ID };

  async function seedFixtures(): Promise<void> {
    await dataSource.query(
      `INSERT INTO student_groups (id, tenant_id, branch_id, name, code, status)
       VALUES ($1, $2, $3, '9-A', '9A', 'active'),
              ($4, $2, $5, '10-B', '10B', 'active')`,
      [GROUP_ID, TENANT_ID, BRANCH_ID, OTHER_GROUP_ID, OTHER_BRANCH_ID],
    );
    await dataSource.query(
      `INSERT INTO students
         (id, tenant_id, branch_id, student_code, first_name, last_name, enrollment_status)
       VALUES
         ($1, $2, $3, 'S-1', 'Ada', 'Yılmaz', 'active'),
         ($4, $2, $3, 'S-2', 'Bora', 'Demir', 'active'),
         ($5, $2, $3, 'S-3', 'Cem', 'Kaya', 'active'),
         ($6, $2, $3, 'S-4', 'Deniz', 'Işık', 'inactive'),
         ($7, $2, $8, 'S-5', 'Ece', 'Zorlu', 'active'),
         ($9, $2, $8, 'S-7', 'Fikri', 'Ak', 'active'),
         ($10, $11, $12, 'S-8', 'Gizem', 'Other', 'active')`,
      [
        STUDENT_ACTIVE_ID,
        TENANT_ID,
        BRANCH_ID,
        STUDENT_INACTIVE_MEMBERSHIP_ID,
        STUDENT_SOFT_DELETED_MEMBERSHIP_ID,
        STUDENT_ENROLLMENT_INACTIVE_ID,
        STUDENT_OTHER_GROUP_ID,
        OTHER_BRANCH_ID,
        STUDENT_OTHER_BRANCH_ORDER_ID,
        STUDENT_OTHER_TENANT_ID,
        OTHER_TENANT_ID,
        OTHER_TENANT_BRANCH_ID,
      ],
    );
    await dataSource.query(
      `INSERT INTO student_group_members
         (tenant_id, branch_id, student_group_id, student_id, status, deleted_at)
       VALUES
         ($1, $2, $3, $4, 'active', NULL),
         ($1, $2, $3, $5, 'inactive', NULL),
         ($1, $2, $3, $6, 'active', now()),
         ($1, $2, $3, $7, 'active', NULL),
         ($1, $8, $9, $10, 'active', NULL),
         ($1, $8, $9, $11, 'active', NULL)`,
      [
        TENANT_ID,
        BRANCH_ID,
        GROUP_ID,
        STUDENT_ACTIVE_ID,
        STUDENT_INACTIVE_MEMBERSHIP_ID,
        STUDENT_SOFT_DELETED_MEMBERSHIP_ID,
        STUDENT_ENROLLMENT_INACTIVE_ID,
        OTHER_BRANCH_ID,
        OTHER_GROUP_ID,
        STUDENT_OTHER_GROUP_ID,
        STUDENT_OTHER_BRANCH_ORDER_ID,
      ],
    );
  }

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      url: DATABASE_URL as string,
      entities: [Student, StudentGroup, StudentGroupMember],
      synchronize: false,
      logging: false,
    });
    await dataSource.initialize();

    const runner = dataSource.createQueryRunner();
    try {
      await migration.up(runner);
    } finally {
      await runner.release();
    }

    await dataSource.query(
      `INSERT INTO tenants (id, name, slug)
       VALUES ($1, 'Roster Tenant', 'roster-tenant'),
              ($2, 'Roster Other Tenant', 'roster-other-tenant')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name`,
      [TENANT_ID, OTHER_TENANT_ID],
    );
    await dataSource.query(
      `INSERT INTO branches (id, tenant_id, name, code)
       VALUES ($1, $2, 'Roster Branch', 'ROSTER-B'),
              ($3, $2, 'Roster Other Branch', 'ROSTER-OB'),
              ($4, $5, 'Roster Other Tenant Branch', 'ROSTER-OTB')
       ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name`,
      [
        BRANCH_ID,
        TENANT_ID,
        OTHER_BRANCH_ID,
        OTHER_TENANT_BRANCH_ID,
        OTHER_TENANT_ID,
      ],
    );

    repository = new StudentRepository(
      dataSource.getRepository(Student),
      dataSource.getRepository(StudentGroup),
      dataSource.getRepository(StudentGroupMember),
    );
  });

  beforeEach(async () => {
    await dataSource.query(
      `DELETE FROM student_group_members WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_ID, OTHER_TENANT_ID]],
    );
    await dataSource.query(
      `DELETE FROM students WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_ID, OTHER_TENANT_ID]],
    );
    await dataSource.query(
      `DELETE FROM student_groups WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_ID, OTHER_TENANT_ID]],
    );
    await seedFixtures();
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    await dataSource.query(
      `DELETE FROM student_group_members WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_ID, OTHER_TENANT_ID]],
    );
    await dataSource.query(
      `DELETE FROM students WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_ID, OTHER_TENANT_ID]],
    );
    await dataSource.query(
      `DELETE FROM student_groups WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_ID, OTHER_TENANT_ID]],
    );
    await dataSource.query(
      `DELETE FROM branches WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_ID, OTHER_TENANT_ID]],
    );
    await dataSource.query(
      `DELETE FROM tenants WHERE id = ANY($1::uuid[])`,
      [[TENANT_ID, OTHER_TENANT_ID]],
    );
    await dataSource.destroy();
  });

  it('returns only active memberships of active, non-deleted students', async () => {
    const group = await repository.findGroupById(ctx, GROUP_ID, BRANCH_ID);
    expect(group).not.toBeNull();

    const result = await repository.roster(ctx, group!, {});

    expect(result.data.map((row) => row.id)).toEqual([STUDENT_ACTIVE_ID]);
    expect(result.meta).toEqual({
      page: 1,
      limit: 50,
      total: 1,
      totalPages: 1,
    });
  });

  it('filters the student list by branch and active group membership', async () => {
    const branchOnly = await repository.list(ctx, { branchId: BRANCH_ID });
    expect(branchOnly.data.map((row) => row.id).sort()).toEqual(
      [
        STUDENT_ACTIVE_ID,
        STUDENT_INACTIVE_MEMBERSHIP_ID,
        STUDENT_SOFT_DELETED_MEMBERSHIP_ID,
      ].sort(),
    );

    const grouped = await repository.list(ctx, {
      branchId: BRANCH_ID,
      studentGroupId: GROUP_ID,
    });
    expect(grouped.data.map((row) => row.id)).toEqual([STUDENT_ACTIVE_ID]);
  });

  it('scopes student and group detail reads to tenant and branch', async () => {
    await expect(repository.findById(ctx, STUDENT_ACTIVE_ID)).resolves.toMatchObject({
      id: STUDENT_ACTIVE_ID,
      tenantId: TENANT_ID,
    });
    await expect(
      repository.findById({ ...ctx, branchId: OTHER_BRANCH_ID }, STUDENT_ACTIVE_ID),
    ).resolves.toBeNull();
    await expect(
      repository.findById({ ...ctx, tenantId: OTHER_TENANT_ID }, STUDENT_ACTIVE_ID),
    ).resolves.toBeNull();
    await expect(
      repository.findGroupById(ctx, GROUP_ID, OTHER_BRANCH_ID),
    ).resolves.toBeNull();
  });

  it('derives the F3 roster in deterministic last-name order', async () => {
    await expect(
      repository.listRosterStudentIds(ctx, OTHER_BRANCH_ID, OTHER_GROUP_ID),
    ).resolves.toEqual([
      STUDENT_OTHER_BRANCH_ORDER_ID,
      STUDENT_OTHER_GROUP_ID,
    ]);
  });

  it('rejects a duplicate active membership in the same group', async () => {
    await expect(
      dataSource.query(
        `INSERT INTO student_group_members
           (tenant_id, branch_id, student_group_id, student_id, status)
         VALUES ($1, $2, $3, $4, 'active')`,
        [TENANT_ID, BRANCH_ID, GROUP_ID, STUDENT_ACTIVE_ID],
      ),
    ).rejects.toThrow();
  });

  it('allows a new active membership after the previous one is soft-deleted', async () => {
    await dataSource.query(
      `UPDATE student_group_members
          SET deleted_at = now()
        WHERE tenant_id = $1 AND student_group_id = $2 AND student_id = $3`,
      [TENANT_ID, GROUP_ID, STUDENT_ACTIVE_ID],
    );

    await expect(
      dataSource.query(
        `INSERT INTO student_group_members
           (tenant_id, branch_id, student_group_id, student_id, status)
         VALUES ($1, $2, $3, $4, 'active')`,
        [TENANT_ID, BRANCH_ID, GROUP_ID, STUDENT_ACTIVE_ID],
      ),
    ).resolves.toBeDefined();
  });

  it('rejects a student from another branch in the group membership', async () => {
    await expect(
      dataSource.query(
        `INSERT INTO student_group_members
           (tenant_id, branch_id, student_group_id, student_id, status)
         VALUES ($1, $2, $3, $4, 'active')`,
        [TENANT_ID, BRANCH_ID, GROUP_ID, STUDENT_OTHER_BRANCH_ORDER_ID],
      ),
    ).rejects.toThrow();
  });

  it('rejects a group from another branch in the membership row', async () => {
    await expect(
      dataSource.query(
        `INSERT INTO student_group_members
           (tenant_id, branch_id, student_group_id, student_id, status)
         VALUES ($1, $2, $3, $4, 'active')`,
        [TENANT_ID, BRANCH_ID, OTHER_GROUP_ID, STUDENT_ACTIVE_ID],
      ),
    ).rejects.toThrow();
  });

  it('rejects a cross-tenant student in the membership composite FK', async () => {
    await expect(
      dataSource.query(
        `INSERT INTO student_group_members
           (tenant_id, branch_id, student_group_id, student_id, status)
         VALUES ($1, $2, $3, $4, 'active')`,
        [TENANT_ID, BRANCH_ID, GROUP_ID, STUDENT_OTHER_TENANT_ID],
      ),
    ).rejects.toThrow();
  });

  it('enforces the membership status CHECK constraint', async () => {
    await expect(
      dataSource.query(
        `UPDATE student_group_members SET status = 'unknown' WHERE tenant_id = $1`,
        [TENANT_ID],
      ),
    ).rejects.toThrow();
  });

  it('seeds a synthetic roster idempotently', async () => {
    const input = {
      tenantSlug: 'roster-tenant',
      branchCode: 'SEED-B',
      branchName: 'Seed Branch',
      groupCode: 'SEED-9A',
      groupName: 'Seed 9-A',
      studentCount: 3,
    } as const;

    const first = await seedStudentRoster(dataSource.manager, input);
    const second = await seedStudentRoster(dataSource.manager, input);

    expect(second).toEqual(first);
    expect(first.studentCount).toBe(3);
    expect(first.membershipCount).toBe(3);

    const students = (await dataSource.query(
      `SELECT count(*)::int AS n FROM students
        WHERE tenant_id = $1 AND branch_id = $2 AND deleted_at IS NULL`,
      [TENANT_ID, first.branchId],
    )) as Array<{ n: number }>;
    const members = (await dataSource.query(
      `SELECT count(*)::int AS n FROM student_group_members
        WHERE tenant_id = $1 AND student_group_id = $2
          AND status = 'active' AND deleted_at IS NULL`,
      [TENANT_ID, first.studentGroupId],
    )) as Array<{ n: number }>;

    expect(students[0].n).toBe(3);
    expect(members[0].n).toBe(3);
  });
});
