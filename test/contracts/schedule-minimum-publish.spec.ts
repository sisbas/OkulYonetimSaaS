import { makePublishedSnapshot, ScheduleValidationInput, teacherCourseKey } from '../../src/schedules/m3-schedule-contract';
import { publishSchedule, filterPublishedSchedules, ScheduleTransactionPort } from '../../src/schedules/schedule-publisher';
import { validateSchedule } from '../../src/schedules/schedule-validator';

const ids = {
  tenant: '00000000-0000-4000-8000-000000000001',
  branch: '00000000-0000-4000-8000-000000000002',
  schedule: '00000000-0000-4000-8000-000000000003',
  eventA: '00000000-0000-4000-8000-000000000004',
  eventB: '00000000-0000-4000-8000-000000000005',
  teacher: '00000000-0000-4000-8000-000000000006',
  teacherBranch: '00000000-0000-4000-8000-000000000007',
  group: '00000000-0000-4000-8000-000000000008',
  course: '00000000-0000-4000-8000-000000000009',
  room: '00000000-0000-4000-8000-000000000010',
  slot: '00000000-0000-4000-8000-000000000011',
  version: '00000000-0000-4000-8000-000000000012',
};

function baseInput(overrides: Partial<ScheduleValidationInput> = {}): ScheduleValidationInput {
  return {
    mode: 'FULL',
    tenantId: ids.tenant,
    branchId: ids.branch,
    scheduleId: ids.schedule,
    scheduleRevision: 2,
    currentScheduleRevision: 2,
    inputFingerprint: 'fingerprint-a',
    validationFingerprint: 'fingerprint-a',
    validatedRevision: 2,
    status: 'draft',
    effectiveFrom: '2026-09-01',
    effectiveTo: '2027-06-30',
    publishedPeriodConflict: false,
    events: [{
      eventId: ids.eventA,
      teacherId: ids.teacher,
      teacherBranchId: ids.teacherBranch,
      studentGroupId: ids.group,
      courseId: ids.course,
      roomId: ids.room,
      timeSlotId: ids.slot,
      dayOfWeek: 1,
      startTime: '09:00',
      endTime: '09:40',
      timeSlotLabel: '1. Ders',
      sourceTimeSlotUpdatedAt: '2026-07-20T00:00:00.000Z',
    }],
    references: {
      activeTeacherIds: new Set([ids.teacher]),
      activeStudentGroupIds: new Set([ids.group]),
      activeRoomIds: new Set([ids.room]),
      activeTimeSlotIds: new Set([ids.slot]),
      activeTeacherBranchIds: new Set([ids.teacherBranch]),
      activeTeacherCourseKeys: new Set([teacherCourseKey(ids.teacher, ids.course)]),
    },
    ...overrides,
  };
}

function tx(log: string[] = []): ScheduleTransactionPort {
  return {
    insertPublishedVersion: jest.fn(async () => { log.push('version'); }),
    markSchedulePublished: jest.fn(async () => { log.push('publish'); }),
    markScheduleUnpublished: jest.fn(async () => { log.push('unpublish'); }),
    appendAudit: jest.fn(async () => { log.push('audit'); }),
  };
}

describe('Schedule minimum publish source', () => {
  it('separates FULL and INCREMENTAL validation; INCREMENTAL is never publish evidence', () => {
    const full = validateSchedule(baseInput());
    const incremental = validateSchedule(baseInput({ mode: 'INCREMENTAL' }));
    expect(full.canPublish).toBe(true);
    expect(full.evidenceStatus).toBe('authoritative');
    expect(incremental.canPublish).toBe(false);
    expect(incremental.evidenceStatus).toBe('editor_feedback');
  });

  it('returns separate reason codes before publish', () => {
    expect(validateSchedule(baseInput({ events: [] })).reasons.map((r) => r.code)).toContain('SCHEDULE_EMPTY');
    expect(validateSchedule(baseInput({ validatedRevision: 1 })).reasons.map((r) => r.code)).toContain('SCHEDULE_VALIDATION_STALE');
    expect(validateSchedule(baseInput({ publishedPeriodConflict: true })).reasons.map((r) => r.code)).toContain('PUBLISHED_SCHEDULE_PERIOD_CONFLICT');
    expect(validateSchedule(baseInput({ events: [{ ...baseInput().events[0], teacherBranchId: null }] })).reasons.map((r) => r.code)).toContain('TEACHER_BRANCH_ASSIGNMENT_MISSING');
  });

  it('rejects hard conflicts before publish', async () => {
    const duplicate = { ...baseInput().events[0], eventId: ids.eventB };
    const input = baseInput({ events: [...baseInput().events, duplicate] });
    const validation = validateSchedule(input);
    expect(validation.reasons.map((r) => r.code)).toEqual(expect.arrayContaining([
      'TEACHER_TIME_OVERLAP',
      'STUDENT_GROUP_TIME_OVERLAP',
      'ROOM_TIME_OVERLAP',
      'SCHEDULE_HARD_CONFLICTS_PRESENT',
    ]));
    await expect(publishSchedule({
      actorId: 'actor-1',
      requestId: 'req-1',
      expectedRevision: 2,
      scheduleVersionId: ids.version,
      versionNo: 1,
      publishedAt: '2026-09-01T00:00:00.000Z',
      validation,
      validationInput: input,
      transaction: tx(),
    })).rejects.toThrow('TEACHER_TIME_OVERLAP');
  });

  it('keeps published snapshots immutable and preserves TimeSlot historical values', () => {
    const snapshot = makePublishedSnapshot({
      tenantId: ids.tenant,
      branchId: ids.branch,
      scheduleId: ids.schedule,
      scheduleVersionId: ids.version,
      versionNo: 1,
      effectiveFrom: '2026-09-01',
      effectiveTo: null,
      publishedAt: '2026-09-01T00:00:00.000Z',
      events: baseInput().events,
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.events[0].timeSlotSnapshot)).toBe(true);
    expect(snapshot.events[0].teacherBranchId).toBe(ids.teacherBranch);
    expect(snapshot.events[0].timeSlotSnapshot).toMatchObject({ dayOfWeek: 1, startTime: '09:00', endTime: '09:40', label: '1. Ders' });
  });

  it('enforces optimistic concurrency and publish plus audit order on the same transaction port', async () => {
    const input = baseInput();
    const validation = validateSchedule(input);
    await expect(publishSchedule({
      actorId: 'actor-1',
      requestId: 'req-1',
      expectedRevision: 1,
      scheduleVersionId: ids.version,
      versionNo: 1,
      publishedAt: '2026-09-01T00:00:00.000Z',
      validation,
      validationInput: input,
      transaction: tx(),
    })).rejects.toThrow('SCHEDULE_VERSION_MISMATCH');

    const log: string[] = [];
    await publishSchedule({
      actorId: 'actor-1',
      requestId: 'req-1',
      expectedRevision: 2,
      scheduleVersionId: ids.version,
      versionNo: 1,
      publishedAt: '2026-09-01T00:00:00.000Z',
      validation,
      validationInput: input,
      transaction: tx(log),
    });
    expect(log).toEqual(['version', 'publish', 'audit']);
  });

  it('supports tenant, branch, teacher, date range and published version read filters', () => {
    const first = makePublishedSnapshot({
      tenantId: ids.tenant, branchId: ids.branch, scheduleId: ids.schedule, scheduleVersionId: ids.version, versionNo: 1,
      effectiveFrom: '2026-09-01', effectiveTo: '2027-06-30', publishedAt: '2026-09-01T00:00:00.000Z', events: baseInput().events,
    });
    const filtered = filterPublishedSchedules([first], {
      tenantId: ids.tenant,
      branchId: ids.branch,
      teacherId: ids.teacher,
      from: '2026-10-01',
      to: '2026-10-31',
      publishedVersionId: ids.version,
    });
    expect(filtered).toHaveLength(1);
  });
});
