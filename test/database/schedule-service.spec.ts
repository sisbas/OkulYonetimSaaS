import { ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { RequestContext } from '../../src/common/context/request-context';
import { ScheduleService } from '../../src/schedules/schedule.service';
import { Schedule } from '../../src/schedules/schedule.entity';
import { ScheduleVersion } from '../../src/schedules/schedule-version.entity';
import { ScheduleEvent } from '../../src/schedules/schedule-event.entity';
import { ScheduleEventDraft } from '../../src/schedules/m3-schedule-contract';

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const describeWithPostgres = DATABASE_URL ? describe : describe.skip;

// UUID yalnızca [0-9a-f] hex karakterleri içerir (t/g/r/s/u gibi harfler GEÇERSİZ).
const TENANT_A = 'a0000000-0000-4000-8000-0000000000a1';
const TENANT_B = 'b0000000-0000-4000-8000-0000000000b1';
const BRANCH_A = 'a1000000-0000-4000-8000-0000000000a1';
const BRANCH_B = 'b1000000-0000-4000-8000-0000000000b1';

// Referans varlıkları (loadActiveReferences doğru çalışsın diye).
const TEACHER_1 = 'c1000000-0000-4000-8000-0000000000c1';
const TEACHER_BRANCH_1 = 'cb000000-0000-4000-8000-0000000000c1';
const GROUP_1 = 'd1000000-0000-4000-8000-0000000000c1';
const COURSE_1 = 'e1000000-0000-4000-8000-0000000000c1';
const ROOM_1 = 'f1000000-0000-4000-8000-0000000000c1';
const SLOT_1 = 'a2000000-0000-4000-8000-0000000000c1';
// Var olmayan (ama geçerli formatlı) teacher — referans kontrolü reddetmeli.
const MISSING_TEACHER = 'deadbeef-0000-4000-8000-0000000000ff';

function makeEvent(over: Partial<ScheduleEventDraft> = {}): ScheduleEventDraft {
  return {
    eventId: 'e1',
    teacherId: TEACHER_1,
    teacherBranchId: TEACHER_BRANCH_1,
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

describeWithPostgres('ScheduleService PostgreSQL integration (P1B-05 slice 2)', () => {
  jest.setTimeout(30_000);

  let dataSource: DataSource;
  let service: ScheduleService;
  const ctxA: RequestContext = {
    requestId: 'schedule-int-a',
    tenantId: TENANT_A,
    user: {
      userId: 'a3000000-0000-4000-8000-0000000000c1',
      tenantId: TENANT_A,
      roleIds: ['tenant-admin'],
      permissions: ['schedule:draft:create', 'schedule:draft:update', 'schedule:read', 'schedule:publish'],
    },
  };

  async function seedReferences(): Promise<void> {
    for (const [tid, bid] of [
      [TENANT_A, BRANCH_A],
      [TENANT_B, BRANCH_B],
    ]) {
      await dataSource.query(
        `INSERT INTO tenants (id, name, slug, status, timezone, deleted_at)
         VALUES ($1, $2, $3, 'active', 'Europe/Istanbul', NULL)
         ON CONFLICT (id) DO UPDATE SET status='active', deleted_at=NULL`,
        [tid, `${tid}-tenant`, `${tid}-slug`],
      );
      await dataSource.query(
        `INSERT INTO branches (id, tenant_id, name, code, status, deleted_at)
         VALUES ($1, $2, $3, $4, 'active', NULL)
         ON CONFLICT (id) DO UPDATE SET status='active', deleted_at=NULL`,
        [bid, tid, `${bid}-branch`, `${bid}-code`],
      );
    }
    await dataSource.query(
      `INSERT INTO teachers (id, tenant_id, first_name, last_name, status, deleted_at)
       VALUES ($1, $2, 'Seed', 'Teacher', 'active', NULL)
       ON CONFLICT (id) DO UPDATE SET first_name='Seed', last_name='Teacher', status='active', deleted_at=NULL`,
      [TEACHER_1, TENANT_A],
    );
    await dataSource.query(
      `INSERT INTO teacher_branches (id, tenant_id, teacher_id, branch_id, status, effective_from, deleted_at)
       VALUES ($1, $2, $3, $4, 'active', '2026-01-01', NULL)
       ON CONFLICT (id) DO UPDATE SET status='active', deleted_at=NULL`,
      [TEACHER_BRANCH_1, TENANT_A, TEACHER_1, BRANCH_A],
    );
    await dataSource.query(
      `INSERT INTO student_groups (id, tenant_id, branch_id, name, status, deleted_at)
       VALUES ($1, $2, $3, 'Group', 'active', NULL)
       ON CONFLICT (id) DO UPDATE SET status='active', deleted_at=NULL`,
      [GROUP_1, TENANT_A, BRANCH_A],
    );
    // Reference fixtures mirror their canonical schema columns used by FK validation.
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
    await dataSource.query(
      `INSERT INTO time_slots (id, tenant_id, branch_id, name, day_of_week, start_time, end_time, status, archived_at)
       VALUES ($1, $2, $3, 'Period 1', 1, '09:00', '10:00', 'active', NULL)
       ON CONFLICT (id) DO UPDATE SET status='active', archived_at=NULL`,
      [SLOT_1, TENANT_A, BRANCH_A],
    );
  }

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
    );
  });

  beforeEach(async () => {
    await dataSource.query('DELETE FROM schedule_events WHERE tenant_id = $1', [TENANT_A]);
    await dataSource.query('DELETE FROM schedule_versions WHERE tenant_id = $1', [TENANT_A]);
    await dataSource.query('DELETE FROM schedules WHERE tenant_id = $1', [TENANT_A]);
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    await dataSource.query('DELETE FROM schedule_events WHERE tenant_id IN ($1,$2)', [TENANT_A, TENANT_B]);
    await dataSource.query('DELETE FROM schedule_versions WHERE tenant_id IN ($1,$2)', [TENANT_A, TENANT_B]);
    await dataSource.query('DELETE FROM schedules WHERE tenant_id IN ($1,$2)', [TENANT_A, TENANT_B]);
    await dataSource.query('DELETE FROM teacher_branches WHERE id = $1', [TEACHER_BRANCH_1]);
    await dataSource.query('DELETE FROM teachers WHERE id = $1', [TEACHER_1]);
    await dataSource.query('DELETE FROM student_groups WHERE id = $1', [GROUP_1]);
    await dataSource.query('DELETE FROM courses WHERE id = $1', [COURSE_1]);
    await dataSource.query('DELETE FROM rooms WHERE id = $1', [ROOM_1]);
    await dataSource.query('DELETE FROM time_slots WHERE id = $1', [SLOT_1]);
    await dataSource.query('DELETE FROM branches WHERE id IN ($1,$2)', [BRANCH_A, BRANCH_B]);
    await dataSource.query('DELETE FROM tenants WHERE id IN ($1,$2)', [TENANT_A, TENANT_B]);
    await dataSource.destroy();
  });

  it('creates a tenant-scoped draft schedule (revision 1)', async () => {
    const schedule = await service.createSchedule({
      tenantId: TENANT_A,
      branchId: BRANCH_A,
      effectiveFrom: '2026-09-01',
      effectiveTo: null,
    });
    expect(schedule.id).toBeDefined();
    const rows = await dataSource.query(
      'SELECT tenant_id, branch_id, revision, status FROM schedules WHERE id = $1',
      [schedule.id],
    );
    expect(rows[0].tenant_id).toBe(TENANT_A);
    expect(rows[0].branch_id).toBe(BRANCH_A);
    expect(Number(rows[0].revision)).toBe(1);
    expect(rows[0].status).toBe('draft');
  });

  it('saves a draft version whose snapshot is a JSON object (constraint-safe)', async () => {
    const schedule = await service.createSchedule({
      tenantId: TENANT_A,
      branchId: BRANCH_A,
      effectiveFrom: '2026-09-01',
      effectiveTo: null,
    });
    await service.saveDraft({
      tenantId: TENANT_A,
      branchId: BRANCH_A,
      scheduleId: schedule.id,
      events: [makeEvent()],
    });
    const rows = await dataSource.query(
      `SELECT jsonb_typeof(snapshot) AS t, snapshot->>'events' AS has_events
       FROM schedule_versions WHERE schedule_id = $1`,
      [schedule.id],
    );
    expect(rows[0].t).toBe('object');
    expect(rows[0].has_events).not.toBeNull();
  });

  it('isolates schedules by tenant (B cannot see A)', async () => {
    const schedule = await service.createSchedule({
      tenantId: TENANT_A,
      branchId: BRANCH_A,
      effectiveFrom: '2026-09-01',
      effectiveTo: null,
    });
    const rows = await dataSource.query(
      'SELECT id FROM schedules WHERE tenant_id = $1 AND id = $2',
      [TENANT_B, schedule.id],
    );
    expect(rows).toHaveLength(0);
  });

  it('publishes with real active references and bumps revision', async () => {
    const schedule = await service.createSchedule({
      tenantId: TENANT_A,
      branchId: BRANCH_A,
      effectiveFrom: '2026-09-01',
      effectiveTo: null,
    });
    await service.saveDraft({
      tenantId: TENANT_A,
      branchId: BRANCH_A,
      scheduleId: schedule.id,
      events: [makeEvent()],
    });
    const persisted = await dataSource.query('SELECT revision FROM schedules WHERE id = $1', [schedule.id]);
    const rev = Number(persisted[0].revision);
    const published = await service.publish(
      TENANT_A,
      BRANCH_A,
      schedule.id,
      ctxA.user!.userId,
      'req-publish-1',
      [makeEvent()],
      rev,
    );
    expect(published.status).toBe('published');

    const rows = await dataSource.query(
      `SELECT s.status, s.active_version_id, s.revision, v.validation_mode
       FROM schedules s JOIN schedule_versions v ON v.id = s.active_version_id
       WHERE s.id = $1`,
      [schedule.id],
    );
    expect(rows[0].status).toBe('published');
    expect(rows[0].active_version_id).not.toBeNull();
    expect(Number(rows[0].revision)).toBeGreaterThanOrEqual(1);
    expect(rows[0].validation_mode).toBe('FULL');

    const ev = await dataSource.query(
      'SELECT COUNT(*)::int AS n FROM schedule_events WHERE schedule_id = $1',
      [schedule.id],
    );
    expect(ev[0].n).toBe(1);
  });

  it('rejects publish on revision mismatch (optimistic concurrency)', async () => {
    const schedule = await service.createSchedule({
      tenantId: TENANT_A,
      branchId: BRANCH_A,
      effectiveFrom: '2026-09-01',
      effectiveTo: null,
    });
    await service.saveDraft({
      tenantId: TENANT_A,
      branchId: BRANCH_A,
      scheduleId: schedule.id,
      events: [makeEvent()],
    });
    await expect(
      service.publish(TENANT_A, BRANCH_A, schedule.id, ctxA.user!.userId, 'req-stale', [makeEvent()], 99),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects publish when a referenced teacher does not exist (real reference check)', async () => {
    const schedule = await service.createSchedule({
      tenantId: TENANT_A,
      branchId: BRANCH_A,
      effectiveFrom: '2026-09-01',
      effectiveTo: null,
    });
    await service.saveDraft({
      tenantId: TENANT_A,
      branchId: BRANCH_A,
      scheduleId: schedule.id,
      events: [makeEvent()],
    });
    const persisted = await dataSource.query('SELECT revision FROM schedules WHERE id = $1', [schedule.id]);
    const rev = Number(persisted[0].revision);
    await expect(
      service.publish(
        TENANT_A,
        BRANCH_A,
        schedule.id,
        ctxA.user!.userId,
        'req-badref',
        [makeEvent({ teacherId: MISSING_TEACHER })],
        rev,
      ),
    ).rejects.toThrow();
  });

  it('unpublish clears active_version_id', async () => {
    const schedule = await service.createSchedule({
      tenantId: TENANT_A,
      branchId: BRANCH_A,
      effectiveFrom: '2026-09-01',
      effectiveTo: null,
    });
    await service.saveDraft({
      tenantId: TENANT_A,
      branchId: BRANCH_A,
      scheduleId: schedule.id,
      events: [makeEvent()],
    });
    const persisted = await dataSource.query('SELECT revision FROM schedules WHERE id = $1', [schedule.id]);
    const rev = Number(persisted[0].revision);
    await service.publish(TENANT_A, BRANCH_A, schedule.id, ctxA.user!.userId, 'req-pub', [makeEvent()], rev);

    const publishedSchedule = await dataSource.query('SELECT revision FROM schedules WHERE id = $1', [schedule.id]);
    const publishedRev = Number(publishedSchedule[0].revision);
    await service.unpublish(TENANT_A, BRANCH_A, schedule.id, ctxA.user!.userId, 'req-unpub', publishedRev);

    const rows = await dataSource.query(
      'SELECT status, active_version_id FROM schedules WHERE id = $1',
      [schedule.id],
    );
    expect(rows[0].status).toBe('unpublished');
    expect(rows[0].active_version_id).toBeNull();
  });

  it('publish throws NotFound when schedule missing', async () => {
    await expect(
      service.publish(TENANT_A, BRANCH_A, '00000000-0000-4000-8000-000000001111', ctxA.user!.userId, 'req-miss', [makeEvent()], 1),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
