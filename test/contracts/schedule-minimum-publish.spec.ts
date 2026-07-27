import { makePublishedSnapshot, ScheduleEventDraft, ScheduleValidationInput, teacherCourseKey } from '../../src/schedules/m3-schedule-contract';
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
  teacher2: '00000000-0000-4000-8000-000000000013',
  teacherBranch2: '00000000-0000-4000-8000-000000000014',
  group2: '00000000-0000-4000-8000-000000000015',
  room2: '00000000-0000-4000-8000-000000000016',
  slot2: '00000000-0000-4000-8000-000000000017',
};

function eventA(): ScheduleEventDraft {
  return {
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
  };
}

function eventB(overrides: Partial<ScheduleEventDraft> = {}): ScheduleEventDraft {
  return {
    ...eventA(),
    eventId: ids.eventB,
    teacherId: ids.teacher2,
    teacherBranchId: ids.teacherBranch2,
    studentGroupId: ids.group2,
    roomId: ids.room2,
    timeSlotId: ids.slot2,
    startTime: '09:30',
    endTime: '10:10',
    ...overrides,
  };
}

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
    events: [eventA()],
    references: {
      activeTeacherIds: new Set([ids.teacher, ids.teacher2]),
      activeStudentGroupIds: new Set([ids.group, ids.group2]),
      activeRoomIds: new Set([ids.room, ids.room2]),
      activeTimeSlotIds: new Set([ids.slot, ids.slot2]),
      activeTeacherBranchIds: new Set([ids.teacherBranch, ids.teacherBranch2]),
      activeTeacherCourseKeys: new Set([teacherCourseKey(ids.teacher, ids.course), teacherCourseKey(ids.teacher2, ids.course)]),
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

async function publish(input: ScheduleValidationInput): Promise<void> {
  await publishSchedule({
    actorId: 'actor-1',
    requestId: 'req-1',
    expectedRevision: input.currentScheduleRevision,
    scheduleVersionId: ids.version,
    versionNo: 1,
    publishedAt: '2026-09-01T00:00:00.000Z',
    validation: validateSchedule(input),
    validationInput: input,
    transaction: tx(),
  });
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
    expect(validateSchedule(baseInput({ events: [{ ...eventA(), teacherBranchId: null }] })).reasons.map((r) => r.code)).toContain('TEACHER_BRANCH_ASSIGNMENT_MISSING');
  });

  it('rejects partial teacher interval overlap, not just equal start/end keys', async () => {
    const input = baseInput({ events: [eventA(), eventB({ teacherId: ids.teacher, teacherBranchId: ids.teacherBranch })] });
    const reasons = validateSchedule(input).reasons.map((r) => r.code);
    expect(reasons).toEqual(expect.arrayContaining(['TEACHER_TIME_OVERLAP', 'SCHEDULE_HARD_CONFLICTS_PRESENT']));
    await expect(publish(input)).rejects.toThrow('TEACHER_TIME_OVERLAP');
  });

  it('rejects partial student-group interval overlap', async () => {
    const input = baseInput({ events: [eventA(), eventB({ studentGroupId: ids.group })] });
    const reasons = validateSchedule(input).reasons.map((r) => r.code);
    expect(reasons).toEqual(expect.arrayContaining(['STUDENT_GROUP_TIME_OVERLAP', 'SCHEDULE_HARD_CONFLICTS_PRESENT']));
    await expect(publish(input)).rejects.toThrow('STUDENT_GROUP_TIME_OVERLAP');
  });

  it('rejects partial room interval overlap', async () => {
    const input = baseInput({ events: [eventA(), eventB({ roomId: ids.room })] });
    const reasons = validateSchedule(input).reasons.map((r) => r.code);
    expect(reasons).toEqual(expect.arrayContaining(['ROOM_TIME_OVERLAP', 'SCHEDULE_HARD_CONFLICTS_PRESENT']));
    await expect(publish(input)).rejects.toThrow('ROOM_TIME_OVERLAP');
  });

  it('accepts boundary-touch adjacency for consecutive lessons', () => {
    const input = baseInput({ events: [eventA(), eventB({
      teacherId: ids.teacher,
      teacherBranchId: ids.teacherBranch,
      studentGroupId: ids.group,
      roomId: ids.room,
      startTime: '09:40',
      endTime: '10:20',
    })] });
    expect(validateSchedule(input).canPublish).toBe(true);
  });

  it('rejects published schedule republish attempts', async () => {
    const input = baseInput({ status: 'published' });
    const reasons = validateSchedule(input).reasons.map((r) => r.code);
    expect(reasons).toEqual(expect.arrayContaining(['PUBLISHED_SCHEDULE_IMMUTABLE', 'SCHEDULE_HARD_CONFLICTS_PRESENT']));
    await expect(publish(input)).rejects.toThrow('PUBLISHED_SCHEDULE_IMMUTABLE');
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
