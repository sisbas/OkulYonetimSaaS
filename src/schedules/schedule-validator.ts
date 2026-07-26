import {
  M3_SCHEDULE_CONTRACT_ID,
  M3_SCHEDULE_CONTRACT_VERSION,
  ScheduleEventDraft,
  ScheduleValidationEvidence,
  ScheduleValidationInput,
  ScheduleValidationReason,
  teacherCourseKey,
} from './m3-schedule-contract';

function add(
  reasons: ScheduleValidationReason[],
  code: ScheduleValidationReason['code'],
  eventId?: string,
  conflictingEventId?: string,
): void {
  reasons.push({
    code,
    ...(eventId ? { eventId } : {}),
    ...(conflictingEventId ? { conflictingEventId } : {}),
  });
}

function requireReference(
  reasons: ScheduleValidationReason[],
  event: ScheduleEventDraft,
  value: string | null,
  active: ReadonlySet<string>,
  inactiveCode: ScheduleValidationReason['code'],
): void {
  if (!value || !active.has(value)) add(reasons, inactiveCode, event.eventId);
}

function intervalsOverlap(left: ScheduleEventDraft, right: ScheduleEventDraft): boolean {
  return (
    left.dayOfWeek === right.dayOfWeek &&
    left.startTime < right.endTime &&
    right.startTime < left.endTime
  );
}

function addResourceConflicts(
  reasons: ScheduleValidationReason[],
  current: ScheduleEventDraft,
  previousEvents: readonly ScheduleEventDraft[],
): void {
  for (const previous of previousEvents) {
    if (!intervalsOverlap(current, previous)) continue;

    if (current.teacherId && current.teacherId === previous.teacherId) {
      add(reasons, 'TEACHER_TIME_OVERLAP', current.eventId, previous.eventId);
    }
    if (current.studentGroupId && current.studentGroupId === previous.studentGroupId) {
      add(reasons, 'STUDENT_GROUP_TIME_OVERLAP', current.eventId, previous.eventId);
    }
    if (current.roomId && current.roomId === previous.roomId) {
      add(reasons, 'ROOM_TIME_OVERLAP', current.eventId, previous.eventId);
    }
  }
}

export function validateSchedule(input: ScheduleValidationInput): ScheduleValidationEvidence {
  const reasons: ScheduleValidationReason[] = [];
  const full = input.mode === 'FULL';

  if (full && input.status === 'published') add(reasons, 'PUBLISHED_SCHEDULE_IMMUTABLE');
  if (full && input.events.length === 0) add(reasons, 'SCHEDULE_EMPTY');
  if (full && input.validatedRevision !== input.currentScheduleRevision) {
    add(reasons, 'SCHEDULE_VALIDATION_STALE');
  }
  if (full && input.validationFingerprint !== input.inputFingerprint) {
    add(reasons, 'SCHEDULE_VALIDATION_STALE');
  }
  if (full && input.publishedPeriodConflict) {
    add(reasons, 'PUBLISHED_SCHEDULE_PERIOD_CONFLICT');
  }

  const previousEvents: ScheduleEventDraft[] = [];

  for (const event of input.events) {
    requireReference(
      reasons,
      event,
      event.teacherId,
      input.references.activeTeacherIds,
      'TEACHER_INACTIVE',
    );
    requireReference(
      reasons,
      event,
      event.studentGroupId,
      input.references.activeStudentGroupIds,
      'STUDENT_GROUP_INACTIVE',
    );
    requireReference(
      reasons,
      event,
      event.roomId,
      input.references.activeRoomIds,
      'ROOM_TIME_OVERLAP',
    );
    requireReference(
      reasons,
      event,
      event.timeSlotId,
      input.references.activeTimeSlotIds,
      'TIMESLOT_INACTIVE',
    );

    if (
      !event.teacherBranchId ||
      !input.references.activeTeacherBranchIds.has(event.teacherBranchId)
    ) {
      add(reasons, 'TEACHER_BRANCH_ASSIGNMENT_MISSING', event.eventId);
    }

    if (
      !event.teacherId ||
      !event.courseId ||
      !input.references.activeTeacherCourseKeys.has(
        teacherCourseKey(event.teacherId, event.courseId),
      )
    ) {
      add(reasons, 'TEACHER_COURSE_MISMATCH', event.eventId);
    }

    addResourceConflicts(reasons, event, previousEvents);
    previousEvents.push(event);
  }

  const nonConflictCodes: ReadonlySet<ScheduleValidationReason['code']> = new Set([
    'PUBLISHED_SCHEDULE_IMMUTABLE',
    'SCHEDULE_VALIDATION_STALE',
    'SCHEDULE_EMPTY',
    'PUBLISHED_SCHEDULE_PERIOD_CONFLICT',
  ]);
  const hardConflictCount = reasons.filter(
    (reason) => !nonConflictCodes.has(reason.code),
  ).length;
  if (full && hardConflictCount > 0) {
    add(reasons, 'SCHEDULE_HARD_CONFLICTS_PRESENT');
  }

  return {
    contractId: M3_SCHEDULE_CONTRACT_ID,
    contractVersion: M3_SCHEDULE_CONTRACT_VERSION,
    mode: input.mode,
    status: reasons.length === 0 ? 'valid' : 'invalid',
    evidenceStatus: full ? 'authoritative' : 'editor_feedback',
    canPublish: full && reasons.length === 0,
    hardConflictCount,
    reasons,
    scheduleRevision: input.currentScheduleRevision,
    inputFingerprint: input.inputFingerprint,
  };
}
