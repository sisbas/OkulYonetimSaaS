import { DataSource, EntityManager } from 'typeorm';
import { ForbiddenException } from '@nestjs/common';
import { DailyOperationsRepository } from '../../src/daily-operations/daily-operations.repository';
import { TeacherRepository } from '../../src/teachers/teacher.repository';
import { RequestContext } from '../../src/common/context/request-context';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;
const tenant = '10000000-0000-4000-8000-000000000001';
const otherTenant = '10000000-0000-4000-8000-000000000002';
const actor = '20000000-0000-4000-8000-000000000001';
const ctx: RequestContext = {
  requestId: 'leave-safety-query-test', tenantId: tenant,
  user: { userId: actor, tenantId: tenant, roleIds: [], permissions: [] },
};

// Query regressions only. Temporary reference fixtures do not seed approved
// leave, assignments, audit or projections. Full migration/UI pilot is separate.
withPostgres('Leave safety SQL on isolated PostgreSQL temporary tables', () => {
  let ds: DataSource;
  beforeAll(async () => {
    ds = new DataSource({ type: 'postgres', url: databaseUrl, entities: [], synchronize: false });
    await ds.initialize();
  });
  afterAll(async () => { if (ds?.isInitialized) await ds.destroy(); });

  async function identityFixture(manager: EntityManager) {
    await manager.query(`
      CREATE TEMP TABLE users (id uuid, status text, deleted_at timestamptz) ON COMMIT DROP;
      CREATE TEMP TABLE tenant_memberships (user_id uuid, tenant_id uuid, status text, deleted_at timestamptz) ON COMMIT DROP;
      CREATE TEMP TABLE teachers (id uuid, user_id uuid, tenant_id uuid, status text, deleted_at timestamptz) ON COMMIT DROP;
    `);
    await manager.query(`INSERT INTO users VALUES ($1, 'active', NULL)`, [actor]);
    await manager.query(`INSERT INTO tenant_memberships VALUES ($1, $2, 'active', NULL)`, [actor, tenant]);
    return new TeacherRepository({ query: manager.query.bind(manager) } as any);
  }

  it('distinguishes verified non-teacher, historical affiliation, ambiguous affiliation and revoked member', async () => {
    await ds.transaction(async (manager) => {
      const directory = await identityFixture(manager);
      await expect(directory.findDecisionActorTeacherId(ctx)).resolves.toBeNull();
      const teacher = '30000000-0000-4000-8000-000000000001';
      await manager.query(`INSERT INTO teachers VALUES ($1, $2, $3, 'inactive', now())`, [teacher, actor, tenant]);
      await expect(directory.findDecisionActorTeacherId(ctx)).resolves.toBe(teacher);
      await manager.query(`INSERT INTO teachers VALUES ($1, $2, $3, 'active', NULL)`,
        ['30000000-0000-4000-8000-000000000002', actor, tenant]);
      await expect(directory.findDecisionActorTeacherId(ctx)).rejects.toBeInstanceOf(ForbiddenException);
      await manager.query(`UPDATE tenant_memberships SET status = 'inactive'`);
      await expect(directory.findDecisionActorTeacherId(ctx)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  it('does not use another tenant membership to authorize the actor', async () => {
    await ds.transaction(async (manager) => {
      const directory = await identityFixture(manager);
      await manager.query(`UPDATE tenant_memberships SET tenant_id = $1`, [otherTenant]);
      await expect(directory.findDecisionActorTeacherId(ctx)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  it('rejects a teacher busy in another branch, accepts boundary time, and isolates other tenants', async () => {
    await ds.transaction(async (manager) => {
      await manager.query(`
        CREATE TEMP TABLE teachers (id text, tenant_id text, status text) ON COMMIT DROP;
        CREATE TEMP TABLE teacher_branches (id text, tenant_id text, teacher_id text, branch_id text, status text, effective_from date, effective_to date) ON COMMIT DROP;
        CREATE TEMP TABLE teacher_courses (tenant_id text, teacher_id text, course_id text, status text, effective_from date, effective_to date) ON COMMIT DROP;
        CREATE TEMP TABLE leave_requests (id text, tenant_id text, teacher_id text, decision_status text, starts_at timestamptz, ends_at timestamptz) ON COMMIT DROP;
        CREATE TEMP TABLE schedules (id text, tenant_id text, branch_id text, active_version_id text, status text, effective_from date, effective_to date) ON COMMIT DROP;
        CREATE TEMP TABLE schedule_versions (id text, tenant_id text, branch_id text, schedule_id text, status text) ON COMMIT DROP;
        CREATE TEMP TABLE schedule_events (id text, tenant_id text, branch_id text, version_id text, schedule_id text, teacher_id text, day_of_week int, start_time time, end_time time) ON COMMIT DROP;
        CREATE TEMP TABLE leave_substitution_assignments (id text, tenant_id text, branch_id text, leave_request_id text, schedule_event_id text, substitute_teacher_id text, state text) ON COMMIT DROP;
      `);
      await manager.query(`INSERT INTO teachers VALUES ('substitute', $1, 'active')`, [tenant]);
      await manager.query(`INSERT INTO teacher_branches VALUES ('membership', $1, 'substitute', 'branch-a', 'active', '2026-01-01', NULL)`, [tenant]);
      await manager.query(`INSERT INTO teacher_courses VALUES ($1, 'substitute', 'course', 'active', '2026-01-01', NULL)`, [tenant]);
      await manager.query(`INSERT INTO schedules VALUES ('schedule', $1, 'branch-b', 'version', 'published', '2026-01-01', NULL)`, [tenant]);
      await manager.query(`INSERT INTO schedule_versions VALUES ('version', $1, 'branch-b', 'schedule', 'published')`, [tenant]);
      await manager.query(`INSERT INTO schedule_events VALUES ('busy-event', $1, 'branch-b', 'version', 'schedule', 'substitute', 1, '10:00', '11:00')`, [tenant]);
      const repository = new DailyOperationsRepository(ds, {} as any);
      // TeacherCourse readiness checks the real authority table; the temp table
      // uses the same query contract and only reference data for this regression.
      jest.spyOn(repository as any, 'teacherCoursesReady').mockResolvedValue(true);
      const leave = { id: 'pending-request', tenantId: tenant, branchId: 'branch-a', teacherId: 'original' };
      const event = { scheduleEventId: 'target', courseId: 'course', dayOfWeek: 1,
        startTime: '10:00', endTime: '11:00', occurrenceDate: '2026-09-14' };
      const check = () => (repository as any).assertEligibleCandidate(manager, leave, event, 'substitute',
        new Date('2026-09-14T07:00:00Z'), new Date('2026-09-14T08:00:00Z'));
      await expect(check()).rejects.toThrow('SUBSTITUTE_TIME_CONFLICT');
      await manager.query(`UPDATE schedule_events SET start_time = '11:00', end_time = '12:00'`);
      await expect(check()).resolves.toBeUndefined();
      await manager.query(`UPDATE schedule_events SET tenant_id = $1, start_time = '10:00', end_time = '11:00'`, [otherTenant]);
      await expect(check()).resolves.toBeUndefined();
    });
  });
});
