import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { NON_ENUMERATING_NOT_FOUND_MESSAGE } from '../../src/common/context/deny-response';
import { RequestContext } from '../../src/common/context/request-context';
import { ScheduleService } from '../../src/schedules/schedule.service';
import { ScheduleReadService } from '../../src/schedules/schedule-read.service';
import { Schedule } from '../../src/schedules/schedule.entity';
import { ScheduleVersion } from '../../src/schedules/schedule-version.entity';
import { ScheduleEvent } from '../../src/schedules/schedule-event.entity';
import { ScheduleEventDraft } from '../../src/schedules/m3-schedule-contract';
import { TeacherRepository } from '../../src/teachers/teacher.repository';

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const describeWithPostgres = DATABASE_URL ? describe : describe.skip;

const TENANT_A = 'a7000000-0000-4000-8000-0000000000a1';
const TENANT_B = 'b7000000-0000-4000-8000-0000000000b1';
const BRANCH_A = 'a7100000-0000-4000-8000-0000000000a1';
// Same tenant, another branch — cross-branch cases must not enumerate.
const BRANCH_B = 'a7200000-0000-4000-8000-0000000000a2';
const BRANCH_OTHER_TENANT = 'b7100000-0000-4000-8000-0000000000b1';
const TEACHER_OWN = 'a7300000-0000-4000-8000-0000000000a1';
const TEACHER_OTHER = 'a7400000-0000-4000-8000-0000000000a1';
const TEACHER_BRANCH_OWN = 'a7500000-0000-4000-8000-0000000000a1';
const TEACHER_BRANCH_OTHER = 'a7600000-0000-4000-8000-0000000000a1';
const OWN_USER = 'a7700000-0000-4000-8000-0000000000a1';
const OTHER_USER = 'a7800000-0000-4000-8000-0000000000a1';
const GROUP_1 = 'd7000000-0000-4000-8000-0000000000d1';
const COURSE_1 = 'e7000000-0000-4000-8000-0000000000e1';
const ROOM_1 = 'f7000000-0000-4000-8000-0000000000f1';
const SLOT_1 = 'a7900000-0000-4000-8000-0000000000a1';
const SLOT_2 = 'a7910000-0000-4000-8000-0000000000a1';
const UNKNOWN_SCHEDULE = '00000000-0000-4000-8000-0000000000ff';

function isoDate(value: unknown): string {
  return String(value ?? '').slice(0, 10);
}

function makeEvent(over: Partial<ScheduleEventDraft> = {}): ScheduleEventDraft {
  return {
    eventId: 'e1',
    teacherId: TEACHER_OWN,
    teacherBranchId: TEACHER_BRANCH_OWN,
    studentGroupId: GROUP_1,
    courseId: COURSE_1,
    roomId: ROOM_1,
    timeSlotId: SLOT_1,
    dayOfWeek: 1,
    startTime: '09:00',
    endTime: '10:00',
    ...over,
  };
}
const ownEvent = () => makeEvent();
const otherEvent = () =>
  makeEvent({
    eventId: 'e2',
    teacherId: TEACHER_OTHER,
    teacherBranchId: TEACHER_BRANCH_OTHER,
    timeSlotId: SLOT_2,
    startTime: '10:00',
    endTime: '11:00',
  });

function adminContext(): RequestContext {
  return {
    requestId: 'schedule-read-admin',
    tenantId: TENANT_A,
    permissions: ['schedule:draft:read', 'schedule:read', 'schedule:own:read', 'schedule:publish', 'schedule:draft:create', 'schedule:draft:update', 'schedule:validate', 'schedule:conflict:read'],
    user: { userId: 'a3000000-0000-4000-8000-0000000000c1', tenantId: TENANT_A, roleIds: ['tenant-admin'], permissions: ['schedule:draft:read'] },
  };
}

function ownContext(userId: string): RequestContext {
  return {
    requestId: 'schedule-read-own',
    tenantId: TENANT_A,
    permissions: ['schedule:own:read'],
    user: { userId, tenantId: TENANT_A, roleIds: ['teacher'], permissions: ['schedule:own:read'] },
  };
}

describeWithPostgres('#447/#449 Schedule read surface PostgreSQL integration', () => {
  jest.setTimeout(60_000);

  let dataSource: DataSource;
  let service: ScheduleService;
  let reads: ScheduleReadService;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      url: DATABASE_URL as string,
      entities: [Schedule, ScheduleVersion, ScheduleEvent],
      synchronize: false,
      logging: false,
    });
    await dataSource.initialize();
    await seedReferences();

    service = new ScheduleService(
      dataSource.getRepository(Schedule),
      dataSource.getRepository(ScheduleVersion),
      dataSource.getRepository(ScheduleEvent),
      { solve: async () => ({}) as never } as never,
    );
    reads = new ScheduleReadService(
      dataSource.getRepository(Schedule),
      dataSource.getRepository(ScheduleVersion),
      new TeacherRepository(dataSource),
    );
  });

  async function seedReferences(): Promise<void> {
    const branches: Array<[string, string, string]> = [
      [TENANT_A, BRANCH_A, 'BranchA-001'],
      [TENANT_A, BRANCH_B, 'BranchB-001'],
      [TENANT_B, BRANCH_OTHER_TENANT, 'BranchCross-001'],
    ];
    for (const [tenantId, branchId, code] of branches) {
      await dataSource.query(
        `INSERT INTO tenants (id, name, slug, status, timezone, deleted_at)
         VALUES ($1, $2, $3, 'active', 'Europe/Istanbul', NULL)
         ON CONFLICT (id) DO UPDATE SET status='active', deleted_at=NULL`,
        [tenantId, `${tenantId}-tenant`, `${tenantId}-slug`],
      );
      await dataSource.query(
        `INSERT INTO branches (id, tenant_id, name, code, status, deleted_at)
         VALUES ($1, $2, $3, $4, 'active', NULL)
         ON CONFLICT (id) DO UPDATE SET status='active', deleted_at=NULL`,
        [branchId, tenantId, `${branchId}-branch`, code],
      );
    }
    await dataSource.query(
      `INSERT INTO users (id, email, credential_hash, full_name, status)
       VALUES ($1, $2, 'hash', 'Own User', 'active')
       ON CONFLICT (id) DO UPDATE SET status='active', deleted_at=NULL`,
      [OWN_USER, `${OWN_USER}@test.example`],
    );
    await dataSource.query(
      `INSERT INTO users (id, email, credential_hash, full_name, status)
       VALUES ($1, $2, 'hash', 'Other User', 'active')
       ON CONFLICT (id) DO UPDATE SET status='active', deleted_at=NULL`,
      [OTHER_USER, `${OTHER_USER}@test.example`],
    );
    for (const [userId] of [
      [OWN_USER],
      [OTHER_USER],
    ] as Array<[string]>) {
      await dataSource.query(
        `INSERT INTO tenant_memberships (tenant_id, user_id, status)
         VALUES ($1, $2, 'active')
         ON CONFLICT (tenant_id, user_id) DO UPDATE SET status='active', deleted_at=NULL`,
        [TENANT_A, userId],
      );
    }
    await dataSource.query(
      `INSERT INTO teachers (id, tenant_id, user_id, first_name, last_name, status, deleted_at)
       VALUES ($1, $2, $3, 'Own', 'Teacher', 'active', NULL)
       ON CONFLICT (id) DO UPDATE SET user_id = $3, status='active', deleted_at=NULL`,
      [TEACHER_OWN, TENANT_A, OWN_USER],
    );
    await dataSource.query(
      `INSERT INTO teachers (id, tenant_id, user_id, first_name, last_name, status, deleted_at)
       VALUES ($1, $2, $3, 'Other', 'Teacher', 'active', NULL)
       ON CONFLICT (id) DO UPDATE SET user_id = $3, status='active', deleted_at=NULL`,
      [TEACHER_OTHER, TENANT_A, OTHER_USER],
    );
    await dataSource.query(
      `INSERT INTO teacher_branches (id, tenant_id, teacher_id, branch_id, status, effective_from, deleted_at)
       VALUES ($1, $2, $3, $4, 'active', '2026-01-01', NULL)
       ON CONFLICT (id) DO UPDATE SET status='active', deleted_at=NULL`,
      [TEACHER_BRANCH_OWN, TENANT_A, TEACHER_OWN, BRANCH_A],
    );
    await dataSource.query(
      `INSERT INTO teacher_branches (id, tenant_id, teacher_id, branch_id, status, effective_from, deleted_at)
       VALUES ($1, $2, $3, $4, 'active', '2026-01-01', NULL)
       ON CONFLICT (id) DO UPDATE SET status='active', deleted_at=NULL`,
      [TEACHER_BRANCH_OTHER, TENANT_A, TEACHER_OTHER, BRANCH_A],
    );
    await dataSource.query(
      `INSERT INTO student_groups (id, tenant_id, branch_id, name, status, deleted_at)
       VALUES ($1, $2, $3, 'Group', 'active', NULL)
       ON CONFLICT (id) DO UPDATE SET status='active', deleted_at=NULL`,
      [GROUP_1, TENANT_A, BRANCH_A],
    );
    await dataSource.query(
      `INSERT INTO courses (id, tenant_id, name, status, deactivated_at)
       VALUES ($1, $2, 'Course', 'active', NULL)
       ON CONFLICT (id) DO UPDATE SET status='active', deactivated_at=NULL`,
      [COURSE_1, TENANT_A],
    );
    await dataSource.query(
      `INSERT INTO rooms (id, tenant_id, branch_id, name, status, deactivated_at)
       VALUES ($1, $2, $3, 'Room', 'active', NULL)
       ON CONFLICT (id) DO UPDATE SET status='active', deactivated_at=NULL`,
      [ROOM_1, TENANT_A, BRANCH_A],
    );
    for (const [slotId, start, end] of [
      [SLOT_1, '09:00', '10:00'] as const,
      [SLOT_2, '10:00', '11:00'] as const,
    ]) {
      await dataSource.query(
        `INSERT INTO time_slots (id, tenant_id, branch_id, name, day_of_week, start_time, end_time, status, archived_at)
         VALUES ($1, $2, $3, 'Period', 1, $4, $5, 'active', NULL)
         ON CONFLICT (id) DO UPDATE SET status='active', archived_at=NULL`,
        [slotId, TENANT_A, BRANCH_A, start, end],
      );
    }
  }

  beforeEach(async () => {
    await dataSource.query('DELETE FROM schedule_events WHERE tenant_id IN ($1, $2)', [TENANT_A, TENANT_B]);
    await dataSource.query('DELETE FROM schedule_versions WHERE tenant_id IN ($1, $2)', [TENANT_A, TENANT_B]);
    await dataSource.query('DELETE FROM schedules WHERE tenant_id IN ($1, $2)', [TENANT_A, TENANT_B]);
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    await dataSource.query('DELETE FROM schedule_events WHERE tenant_id IN ($1, $2)', [TENANT_A, TENANT_B]);
    await dataSource.query('DELETE FROM schedule_versions WHERE tenant_id IN ($1, $2)', [TENANT_A, TENANT_B]);
    await dataSource.query('DELETE FROM schedules WHERE tenant_id IN ($1, $2)', [TENANT_A, TENANT_B]);
    await dataSource.query('DELETE FROM teacher_branches WHERE id IN ($1, $2)', [TEACHER_BRANCH_OWN, TEACHER_BRANCH_OTHER]);
    await dataSource.query('DELETE FROM teachers WHERE id IN ($1, $2)', [TEACHER_OWN, TEACHER_OTHER]);
    await dataSource.query('DELETE FROM tenant_memberships WHERE tenant_id = $1', [TENANT_A]);
    await dataSource.query('DELETE FROM users WHERE id IN ($1, $2)', [OWN_USER, OTHER_USER]);
  });

  type Created = Awaited<ReturnType<typeof create>>;
  async function create(period: { from?: string; to?: string } = {}) {
    const schedule = await service.createSchedule({
      tenantId: TENANT_A,
      branchId: BRANCH_A,
      effectiveFrom: period.from ?? '2026-09-01',
      effectiveTo: period.to ?? '2027-06-30',
    });
    return schedule;
  }

  async function saveAndPublish(scheduleId: string, events: ScheduleEventDraft[]) {
    await service.saveDraft({ tenantId: TENANT_A, branchId: BRANCH_A, scheduleId, events, expectedRevision: 1 });
    const rows = await dataSource.query('SELECT revision FROM schedules WHERE id = $1', [scheduleId]);
    const revision = Number(rows[0].revision);
    await service.publish(TENANT_A, BRANCH_A, scheduleId, 'actor', 'req-publish', events, revision);
    return revision;
  }

  it('lists draft and unpublished in management scope, hides published, with counts and projections', async () => {
    const draft = await create();
    await service.saveDraft({ tenantId: TENANT_A, branchId: BRANCH_A, scheduleId: draft.id, events: [ownEvent()], expectedRevision: 1 });

    // #453 — aynı şubede yayınlanmış dönemler örtüşemez; bu yüzden ikinci
    // yayın farklı bir dönem kullanır (testin amacı projeksiyonları ayırt etmek).
    const published = await create({ from: '2026-09-01', to: '2026-12-20' });
    await saveAndPublish(published.id, [ownEvent()]);

    const unpublished = await create({ from: '2027-01-01', to: '2027-06-30' });
    await saveAndPublish(unpublished.id, [ownEvent()]);
    await service.unpublish(TENANT_A, BRANCH_A, unpublished.id, 'actor', 'req-unpublish', 2);
    const items = await reads.listManagementDrafts({ tenantId: TENANT_A, branchId: BRANCH_A });
    const ids = items.map((item) => item.scheduleId);

    expect(ids).toContain(draft.id);
    expect(ids).toContain(unpublished.id);
    expect(ids).not.toContain(published.id);
    const draftItem = items.find((item) => item.scheduleId === draft.id)!;
    const unpublishedItem = items.find((item) => item.scheduleId === unpublished.id)!;
    expect(draftItem.projection).toBe('management_draft');
    expect(draftItem.gridState).toBe('weekly_grid_ready_draft');
    expect(draftItem.readOnly).toBe(false);
    expect(draftItem.eventCount).toBe(1);
    expect(unpublishedItem.eventCount).toBe(1);
    expect(unpublishedItem.version?.status).toBe('unpublished');
  });

  it('readSchedule serves a management draft detail with events and zero mutation', async () => {
    const draft = await create();
    await service.saveDraft({ tenantId: TENANT_A, branchId: BRANCH_A, scheduleId: draft.id, events: [ownEvent()], expectedRevision: 1 });
    const before = await dataSource.query('SELECT revision FROM schedules WHERE id = $1', [draft.id]);
    const versionBefore = await dataSource.query(
      'SELECT COUNT(*)::int AS n, max(jsonb_typeof(snapshot)) AS t FROM schedule_versions WHERE schedule_id = $1',
      [draft.id],
    );

    const read = await reads.readSchedule({ tenantId: TENANT_A, branchId: BRANCH_A, scheduleId: draft.id, ctx: adminContext() });
    expect(read.projection).toBe('management_draft');
    expect(read.readOnly).toBe(false);
    expect(read.gridState).toBe('weekly_grid_ready_draft');
    expect(read.events).toHaveLength(1);
    expect(read.events[0].teacherId).toBe(TEACHER_OWN);
    expect(read.effectiveFrom).toBe('2026-09-01');
    expect(isoDate(read.effectiveTo)).toBe('2027-06-30');

    const after = await dataSource.query('SELECT revision FROM schedules WHERE id = $1', [draft.id]);
    const versionAfter = await dataSource.query(
      'SELECT COUNT(*)::int AS n, max(jsonb_typeof(snapshot)) AS t FROM schedule_versions WHERE schedule_id = $1',
      [draft.id],
    );
    expect(after[0].revision).toBe(before[0].revision);
    expect(versionAfter[0].n).toBe(versionBefore[0].n);
  });

  it('renders the published schedule as readOnly published_branch for management owners', async () => {
    const published = await create();
    await saveAndPublish(published.id, [ownEvent(), otherEvent()]);

    const read = await reads.readSchedule({ tenantId: TENANT_A, branchId: BRANCH_A, scheduleId: published.id, ctx: adminContext() });
    expect(read.status).toBe('published');
    expect(read.projection).toBe('published_branch');
    expect(read.readOnly).toBe(true);
    expect(read.gridState).toBe('weekly_grid_ready_published');
    expect(read.events).toHaveLength(2);
    expect(read.version?.status).toBe('published');
  });

  it('surfaces the unpublished (locked) snapshot for a just-unpublished schedule', async () => {
    const published = await create();
    const version = await saveAndPublish(published.id, [ownEvent(), otherEvent()]);
    await service.unpublish(TENANT_A, BRANCH_A, published.id, 'actor', 'req-unpublish', version);

    const read = await reads.readSchedule({ tenantId: TENANT_A, branchId: BRANCH_A, scheduleId: published.id, ctx: adminContext() });
    expect(read.status).toBe('unpublished');
    expect(read.projection).toBe('management_draft');
    expect(read.gridState).toBe('weekly_grid_ready_draft');
    expect(read.events).toHaveLength(2);
    expect(read.version?.status).toBe('unpublished');
  });

  it('answers cross-tenant, cross-branch and unknown-id reads with the SAME non-enumerating 404 message', async () => {
    const published = await create();
    await saveAndPublish(published.id, [ownEvent()]);

    const messages: string[] = [];
    const cases = [
      { label: 'cross-branch', tenantId: TENANT_A, branchId: BRANCH_B, scheduleId: published.id },
      { label: 'cross-tenant', tenantId: TENANT_B, branchId: BRANCH_OTHER_TENANT, scheduleId: published.id },
      { label: 'unknown id', tenantId: TENANT_A, branchId: BRANCH_A, scheduleId: UNKNOWN_SCHEDULE },
    ];
    for (const { label, tenantId, branchId, scheduleId } of cases) {
      try {
        await reads.readSchedule({ tenantId, branchId, scheduleId, ctx: adminContext() });
        throw new Error(`expected NotFoundException for ${label}`);
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundException);
        messages.push((error as NotFoundException).message);
      }
    }
    expect(new Set(messages)).toEqual(new Set([NON_ENUMERATING_NOT_FOUND_MESSAGE]));
  });

  it('serves published own projection with only the actor events and 404s on empty', async () => {
    const withOwn = await create();
    await saveAndPublish(withOwn.id, [ownEvent(), otherEvent()]);
    const otherOnly = await create({ from: '2027-07-01', to: '2027-12-31' });
    await saveAndPublish(otherOnly.id, [otherEvent()]);

    const ctx = ownContext(OWN_USER);

    const own = await reads.readSchedule({ tenantId: TENANT_A, branchId: BRANCH_A, scheduleId: withOwn.id, ctx });
    expect(own.projection).toBe('published_own');
    expect(own.readOnly).toBe(true);
    expect(own.gridState).toBe('weekly_grid_ready_published');
    expect(own.events).toHaveLength(1);
    expect(own.events[0].teacherId).toBe(TEACHER_OWN);

    await expect(
      reads.readSchedule({ tenantId: TENANT_A, branchId: BRANCH_A, scheduleId: otherOnly.id, ctx }),
    ).rejects.toBeInstanceOf(NotFoundException);

    // Own-scope için taslak/yayınlanmamış keşfedilemez.
    const draft = await create();
    await expect(
      reads.readSchedule({ tenantId: TENANT_A, branchId: BRANCH_A, scheduleId: draft.id, ctx }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('listPublished returns only schedules containing own events for own-scope actors', async () => {
    const withOwn = await create();
    await saveAndPublish(withOwn.id, [ownEvent(), otherEvent()]);
    const otherOnly = await create({ from: '2027-07-01', to: '2027-12-31' });
    await saveAndPublish(otherOnly.id, [otherEvent()]);

    const ownItems = await reads.listPublished({ tenantId: TENANT_A, branchId: BRANCH_A, ctx: ownContext(OWN_USER) });
    expect(ownItems.map((item) => item.scheduleId)).toEqual([withOwn.id]);
    expect(ownItems[0].projection).toBe('published_own');

    const branchItems = await reads.listPublished({
      tenantId: TENANT_A,
      branchId: BRANCH_A,
      ctx: { ...adminContext(), permissions: ['schedule:read'] },
    });
    expect(new Set(branchItems.map((item) => item.scheduleId))).toEqual(new Set([withOwn.id, otherOnly.id]));
    expect(branchItems.every((item) => item.projection === 'published_branch')).toBe(true);

    const denied = await reads.listPublished({
      tenantId: TENANT_A,
      branchId: BRANCH_A,
      ctx: { ...adminContext(), permissions: [] },
    });
    expect(denied).toEqual([]);
  });

  it('listPublished applies the effective-period overlap filter', async () => {
    const early = await service.createSchedule({ tenantId: TENANT_A, branchId: BRANCH_A, effectiveFrom: '2025-01-01', effectiveTo: '2025-06-30' });
    await service.saveDraft({ tenantId: TENANT_A, branchId: BRANCH_A, scheduleId: early.id, events: [ownEvent()], expectedRevision: 1 });
    await service.publish(TENANT_A, BRANCH_A, early.id, 'actor', 'req-early', [ownEvent()], 2);

    const current = await create();
    await saveAndPublish(current.id, [ownEvent()]);

    const only2026 = await reads.listPublished({
      tenantId: TENANT_A,
      branchId: BRANCH_A,
      ctx: adminContext(),
      from: '2026-01-01',
    });
    expect(only2026.map((item) => item.scheduleId)).toEqual([current.id]);

    const everything = await reads.listPublished({ tenantId: TENANT_A, branchId: BRANCH_A, ctx: adminContext() });
    expect(new Set(everything.map((item) => item.scheduleId))).toEqual(new Set([early.id, current.id]));
  });

  it('reads a version snapshot without touching the event table or revision chain', async () => {
    const draft = await create();
    await service.saveDraft({ tenantId: TENANT_A, branchId: BRANCH_A, scheduleId: draft.id, events: [ownEvent()], expectedRevision: 1 });
    const before = await dataSource.query('SELECT revision FROM schedules WHERE id = $1', [draft.id]);

    await reads.readSchedule({ tenantId: TENANT_A, branchId: BRANCH_A, scheduleId: draft.id, ctx: adminContext() });
    await reads.listManagementDrafts({ tenantId: TENANT_A, branchId: BRANCH_A });

    const after = await dataSource.query('SELECT revision FROM schedules WHERE id = $1', [draft.id]);
    expect(after[0].revision).toBe(before[0].revision);
  });
});
