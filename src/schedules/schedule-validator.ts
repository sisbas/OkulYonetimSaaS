import {
  M3_SCHEDULE_CONTRACT_ID,
  M3_SCHEDULE_CONTRACT_VERSION,
  ScheduleEventDraft,
  ScheduleValidationEvidence,
  ScheduleValidationInput,
  ScheduleValidationReason,
  ScheduleConflictSuggestion,
  teacherCourseKey,
} from './m3-schedule-contract';

function add(reasons: ScheduleValidationReason[], code: ScheduleValidationReason['code'], eventId?: string, conflictingEventId?: string): void {
  reasons.push({ code, ...(eventId ? { eventId } : {}), ...(conflictingEventId ? { conflictingEventId } : {}) });
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

type IndexedEvent = {
  eventId: string;
  dayOfWeek: number;
  start: number;
  end: number;
};

function minutes(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function intersects(left: IndexedEvent, right: IndexedEvent): boolean {
  return left.dayOfWeek === right.dayOfWeek && left.start < right.end && left.end > right.start;
}

function indexConflict(
  reasons: ScheduleValidationReason[],
  suggestions: ScheduleConflictSuggestion[],
  index: Map<string, IndexedEvent[]>,
  resourceId: string | null,
  event: ScheduleEventDraft,
  code: ScheduleValidationReason['code'],
): void {
  if (!resourceId) return;
  const current: IndexedEvent = {
    eventId: event.eventId,
    dayOfWeek: event.dayOfWeek,
    start: minutes(event.startTime),
    end: minutes(event.endTime),
  };
  const bucket = index.get(resourceId) ?? [];
  const conflict = bucket.find((candidate) => intersects(candidate, current));
  if (conflict) {
    add(reasons, code, event.eventId, conflict.eventId);
    // OKUL-07: çakışma çözümü önerisi — çakışan event'in bitişinden sonra başlat.
    const suggestedStart = `${String(Math.floor(conflict.end / 60)).padStart(2, '0')}:${String(conflict.end % 60).padStart(2, '0')}`;
    const duration = current.end - current.start;
    const suggestedEndMin = conflict.end + duration;
    const suggestedEnd = `${String(Math.floor(suggestedEndMin / 60)).padStart(2, '0')}:${String(suggestedEndMin % 60).padStart(2, '0')}`;
    suggestions.push({
      eventId: event.eventId,
      conflictingEventId: conflict.eventId,
      code,
      suggestedStart,
      suggestedEnd,
      message: `Kaynak '${resourceId}' için ${event.eventId} ile ${conflict.eventId} çakışıyor. Öneri: ${suggestedStart}-${suggestedEnd} aralığına taşıyın.`,
    });
  }
  bucket.push(current);
  index.set(resourceId, bucket);
}

export function validateSchedule(input: ScheduleValidationInput): ScheduleValidationEvidence {
  const reasons: ScheduleValidationReason[] = [];
  const full = input.mode === 'FULL';

  if (full && input.events.length === 0) add(reasons, 'SCHEDULE_EMPTY');
  if (full && input.validatedRevision !== input.currentScheduleRevision) add(reasons, 'SCHEDULE_VALIDATION_STALE');
  if (full && input.validationFingerprint !== input.inputFingerprint) add(reasons, 'SCHEDULE_VALIDATION_STALE');
  if (full && input.publishedPeriodConflict) add(reasons, 'PUBLISHED_SCHEDULE_PERIOD_CONFLICT');
  if (full && input.status === 'published') add(reasons, 'PUBLISHED_SCHEDULE_IMMUTABLE');

  const teacherIntervals = new Map<string, IndexedEvent[]>();
  const groupIntervals = new Map<string, IndexedEvent[]>();
  const roomIntervals = new Map<string, IndexedEvent[]>();
  const suggestions: ScheduleConflictSuggestion[] = [];
  for (const event of input.events) {
    requireReference(reasons, event, event.teacherId, input.references.activeTeacherIds, 'TEACHER_INACTIVE');
    requireReference(reasons, event, event.studentGroupId, input.references.activeStudentGroupIds, 'STUDENT_GROUP_INACTIVE');
    requireReference(reasons, event, event.roomId, input.references.activeRoomIds, 'ROOM_TIME_OVERLAP');
    requireReference(reasons, event, event.timeSlotId, input.references.activeTimeSlotIds, 'TIMESLOT_INACTIVE');

    if (!event.teacherBranchId || !input.references.activeTeacherBranchIds.has(event.teacherBranchId)) {
      add(reasons, 'TEACHER_BRANCH_ASSIGNMENT_MISSING', event.eventId);
    }

    if (!event.teacherId || !event.courseId || !input.references.activeTeacherCourseKeys.has(teacherCourseKey(event.teacherId, event.courseId))) {
      add(reasons, 'TEACHER_COURSE_MISMATCH', event.eventId);
    }

    indexConflict(reasons, suggestions, teacherIntervals, event.teacherId, event, 'TEACHER_TIME_OVERLAP');
    indexConflict(reasons, suggestions, groupIntervals, event.studentGroupId, event, 'STUDENT_GROUP_TIME_OVERLAP');
    indexConflict(reasons, suggestions, roomIntervals, event.roomId, event, 'ROOM_TIME_OVERLAP');
  }

  const hardConflictCount = reasons.filter((reason) => ![
    'SCHEDULE_VALIDATION_STALE',
    'SCHEDULE_EMPTY',
    'PUBLISHED_SCHEDULE_PERIOD_CONFLICT',
  ].includes(reason.code)).length;
  if (full && hardConflictCount > 0) add(reasons, 'SCHEDULE_HARD_CONFLICTS_PRESENT');

  return {
    contractId: M3_SCHEDULE_CONTRACT_ID,
    contractVersion: M3_SCHEDULE_CONTRACT_VERSION,
    mode: input.mode,
    status: reasons.length === 0 ? 'valid' : 'invalid',
    evidenceStatus: full ? 'authoritative' : 'editor_feedback',
    canPublish: full && reasons.length === 0,
    hardConflictCount,
    reasons,
    suggestions,
    scheduleRevision: input.currentScheduleRevision,
    inputFingerprint: input.inputFingerprint,
  };
}
