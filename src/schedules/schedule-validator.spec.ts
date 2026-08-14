import { validateSchedule } from './schedule-validator';
import { ScheduleValidationInput } from './m3-schedule-contract';

function makeInput(events: ScheduleValidationInput['events']): ScheduleValidationInput {
  return {
    mode: 'FULL',
    tenantId: 't1',
    branchId: 'b1',
    scheduleId: 's1',
    scheduleRevision: 1,
    currentScheduleRevision: 1,
    inputFingerprint: 'fp1',
    validationFingerprint: 'fp1',
    validatedRevision: 1,
    status: 'draft',
    effectiveFrom: '2026-08-14',
    events,
    references: {
      activeTeacherIds: new Set(['teacher-1', 'teacher-2']),
      activeStudentGroupIds: new Set(['group-1', 'group-2']),
      activeRoomIds: new Set(['room-1', 'room-2']),
      activeTimeSlotIds: new Set(['ts-1']),
      activeTeacherBranchIds: new Set(['tb-1']),
      activeTeacherCourseKeys: new Set(['teacher-1:course-1', 'teacher-2:course-1']),
    },
  };
}

describe('validateSchedule conflict suggestions (OKUL-07)', () => {
  it('detects teacher time overlap and suggests resolution', () => {
    const input = makeInput([
      {
        eventId: 'e1',
        teacherId: 'teacher-1',
        teacherBranchId: 'tb-1',
        studentGroupId: 'group-1',
        courseId: 'course-1',
        roomId: 'room-1',
        timeSlotId: 'ts-1',
        dayOfWeek: 1,
        startTime: '09:00',
        endTime: '10:00',
      },
      {
        eventId: 'e2',
        teacherId: 'teacher-1',
        teacherBranchId: 'tb-1',
        studentGroupId: 'group-1',
        courseId: 'course-1',
        roomId: 'room-1',
        timeSlotId: 'ts-1',
        dayOfWeek: 1,
        startTime: '09:30',
        endTime: '10:30',
      },
    ]);
    const result = validateSchedule(input);
    expect(result.status).toBe('invalid');
    expect(result.hardConflictCount).toBeGreaterThan(0);
    expect(result.suggestions.length).toBeGreaterThan(0);
    const sug = result.suggestions[0];
    expect(sug.eventId).toBe('e2');
    expect(sug.conflictingEventId).toBe('e1');
    expect(sug.suggestedStart).toBe('10:00');
    expect(sug.suggestedEnd).toBe('11:00');
  });

  it('returns valid with no suggestions when no overlap', () => {
    const input = makeInput([
      {
        eventId: 'e1',
        teacherId: 'teacher-1',
        teacherBranchId: 'tb-1',
        studentGroupId: 'group-1',
        courseId: 'course-1',
        roomId: 'room-1',
        timeSlotId: 'ts-1',
        dayOfWeek: 1,
        startTime: '09:00',
        endTime: '10:00',
      },
      {
        eventId: 'e2',
        teacherId: 'teacher-2',
        teacherBranchId: 'tb-1',
        studentGroupId: 'group-2',
        courseId: 'course-1',
        roomId: 'room-2',
        timeSlotId: 'ts-1',
        dayOfWeek: 1,
        startTime: '09:00',
        endTime: '10:00',
      },
    ]);
    const result = validateSchedule(input);
    expect(result.status).toBe('valid');
    expect(result.suggestions.length).toBe(0);
  });
});
