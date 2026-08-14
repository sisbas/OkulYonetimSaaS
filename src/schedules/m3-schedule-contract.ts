export const M3_SCHEDULE_CONTRACT_ID = 'M3_CONTRACT_V1';
export const M3_SCHEDULE_CONTRACT_VERSION = '1.0.0';

export const CANONICAL_SCHEDULE_REASON_CODES = [
  'TEACHER_TIME_OVERLAP',
  'STUDENT_GROUP_TIME_OVERLAP',
  'ROOM_TIME_OVERLAP',
  'TIMESLOT_INACTIVE',
  'TEACHER_INACTIVE',
  'STUDENT_GROUP_INACTIVE',
  'TEACHER_BRANCH_ASSIGNMENT_MISSING',
  'TEACHER_COURSE_MISMATCH',
  'TENANT_REFERENCE_MISMATCH',
  'BRANCH_REFERENCE_MISMATCH',
  'PUBLISHED_SCHEDULE_IMMUTABLE',
  'SCHEDULE_EMPTY',
  'SCHEDULE_VALIDATION_STALE',
  'SCHEDULE_HARD_CONFLICTS_PRESENT',
  'PUBLISHED_SCHEDULE_PERIOD_CONFLICT',
  'SCHEDULE_VERSION_MISMATCH',
  'SCHEDULE_VERSION_REQUIRED',
] as const;

export type CanonicalScheduleReasonCode = (typeof CANONICAL_SCHEDULE_REASON_CODES)[number];
export type ScheduleValidationMode = 'FULL' | 'INCREMENTAL';
export type ScheduleStatus = 'draft' | 'published' | 'unpublished';

export type ScheduleEventDraft = {
  eventId: string;
  teacherId: string | null;
  teacherBranchId: string | null;
  studentGroupId: string | null;
  courseId: string | null;
  roomId: string | null;
  timeSlotId: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  timeSlotLabel?: string | null;
  sourceTimeSlotUpdatedAt?: string | null;
};

export type ScheduleReferenceSet = {
  activeTeacherIds: ReadonlySet<string>;
  activeStudentGroupIds: ReadonlySet<string>;
  activeRoomIds: ReadonlySet<string>;
  activeTimeSlotIds: ReadonlySet<string>;
  activeTeacherBranchIds: ReadonlySet<string>;
  activeTeacherCourseKeys: ReadonlySet<string>;
};

export type ScheduleValidationInput = {
  mode: ScheduleValidationMode;
  tenantId: string;
  branchId: string;
  scheduleId: string;
  scheduleRevision: number;
  currentScheduleRevision: number;
  inputFingerprint: string;
  validationFingerprint?: string | null;
  validatedRevision?: number | null;
  status: ScheduleStatus;
  effectiveFrom: string;
  effectiveTo?: string | null;
  publishedPeriodConflict?: boolean;
  events: readonly ScheduleEventDraft[];
  references: ScheduleReferenceSet;
};

export type ScheduleValidationReason = {
  code: CanonicalScheduleReasonCode;
  eventId?: string;
  conflictingEventId?: string;
};

// OKUL-07: Çakışma çözümü önerisi. Tespit edilen bir time-overlap için
// alternatif zaman aralığı öneren hafif bir yapı.
export type ScheduleConflictSuggestion = {
  eventId: string;
  conflictingEventId: string;
  code: CanonicalScheduleReasonCode;
  // Önerilen yeni başlangıç/süre (发生冲突事件之后).
  suggestedStart?: string;
  suggestedEnd?: string;
  // İnsan-okunur açıklama.
  message: string;
};

export type ScheduleValidationEvidence = {
  contractId: typeof M3_SCHEDULE_CONTRACT_ID;
  contractVersion: typeof M3_SCHEDULE_CONTRACT_VERSION;
  mode: ScheduleValidationMode;
  status: 'valid' | 'invalid';
  evidenceStatus: 'authoritative' | 'editor_feedback';
  canPublish: boolean;
  hardConflictCount: number;
  reasons: ScheduleValidationReason[];
  // OKUL-07: çakışma çözümü önerileri.
  suggestions: ScheduleConflictSuggestion[];
  scheduleRevision: number;
  inputFingerprint: string;
};

export type TimeSlotSnapshot = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  label: string | null;
  sourceTimeSlotUpdatedAt: string | null;
};

export type PublishedScheduleEventSnapshot = {
  eventId: string;
  teacherId: string;
  teacherBranchId: string;
  studentGroupId: string;
  courseId: string;
  roomId: string;
  timeSlotId: string;
  timeSlotSnapshot: TimeSlotSnapshot;
};

export type PublishedScheduleSnapshot = {
  contractId: typeof M3_SCHEDULE_CONTRACT_ID;
  contractVersion: typeof M3_SCHEDULE_CONTRACT_VERSION;
  tenantId: string;
  branchId: string;
  scheduleId: string;
  scheduleVersionId: string;
  versionNo: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  publishedAt: string;
  events: readonly PublishedScheduleEventSnapshot[];
};

export type PublishedScheduleReadFilter = {
  tenantId: string;
  branchId?: string;
  teacherId?: string;
  from?: string;
  to?: string;
  publishedVersionId?: string;
};

export function teacherCourseKey(teacherId: string, courseId: string): string {
  return `${teacherId}:${courseId}`;
}

export function snapshotEvent(event: ScheduleEventDraft): PublishedScheduleEventSnapshot {
  const refs = [event.teacherId, event.teacherBranchId, event.studentGroupId, event.courseId, event.roomId, event.timeSlotId];
  if (refs.some((value) => !value)) {
    throw new Error('Published snapshot requires all ScheduleEvent references, including teacherBranchId');
  }
  return Object.freeze({
    eventId: event.eventId,
    teacherId: event.teacherId!,
    teacherBranchId: event.teacherBranchId!,
    studentGroupId: event.studentGroupId!,
    courseId: event.courseId!,
    roomId: event.roomId!,
    timeSlotId: event.timeSlotId!,
    timeSlotSnapshot: Object.freeze({
      dayOfWeek: event.dayOfWeek,
      startTime: event.startTime,
      endTime: event.endTime,
      label: event.timeSlotLabel ?? null,
      sourceTimeSlotUpdatedAt: event.sourceTimeSlotUpdatedAt ?? null,
    }),
  });
}

export function makePublishedSnapshot(input: {
  tenantId: string;
  branchId: string;
  scheduleId: string;
  scheduleVersionId: string;
  versionNo: number;
  effectiveFrom: string;
  effectiveTo?: string | null;
  publishedAt: string;
  events: readonly ScheduleEventDraft[];
}): PublishedScheduleSnapshot {
  return Object.freeze({
    contractId: M3_SCHEDULE_CONTRACT_ID,
    contractVersion: M3_SCHEDULE_CONTRACT_VERSION,
    tenantId: input.tenantId,
    branchId: input.branchId,
    scheduleId: input.scheduleId,
    scheduleVersionId: input.scheduleVersionId,
    versionNo: input.versionNo,
    effectiveFrom: input.effectiveFrom,
    effectiveTo: input.effectiveTo ?? null,
    publishedAt: input.publishedAt,
    events: Object.freeze(input.events.map(snapshotEvent)),
  });
}
