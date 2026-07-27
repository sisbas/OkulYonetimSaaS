import { LeaveCoverageStatus } from '../leaves/leave-request.entity';

export const DAILY_OPERATION_STATES = ['open', 'resolved'] as const;
export type DailyOperationState = (typeof DAILY_OPERATION_STATES)[number];

export const LEAVE_IMPACT_REASON_CODES = [
  'LEAVE_NOT_APPROVED',
  'NO_PUBLISHED_SCHEDULE_EVENT',
  'TEACHER_COURSE_ELIGIBILITY_NOT_READY',
  'TEACHER_COURSE_MISMATCH',
  'SUBSTITUTE_TEACHER_INACTIVE',
  'SUBSTITUTE_BRANCH_ASSIGNMENT_MISSING',
  'SUBSTITUTE_LEAVE_OVERLAP',
  'SUBSTITUTE_TIME_CONFLICT',
  'ASSIGNMENT_ALREADY_EXISTS',
  'ASSIGNMENT_NOT_FOUND',
  'LEAVE_VERSION_REQUIRED',
  'LEAVE_VERSION_MISMATCH',
] as const;

export type LeaveImpactReasonCode = (typeof LEAVE_IMPACT_REASON_CODES)[number];

export type LeaveImpactEvent = Readonly<{
  scheduleEventId: string;
  scheduleId: string;
  scheduleVersionId: string;
  teacherId: string;
  teacherBranchId: string;
  studentGroupId: string;
  courseId: string;
  roomId: string;
  timeSlotId: string;
  occurrenceDate: string;
  startsAt: string;
  endsAt: string;
  state: DailyOperationState;
  substituteAssignmentId: string | null;
  substituteTeacherId: string | null;
}>;

export type LeaveImpactResponse = Readonly<{
  leaveRequestId: string;
  branchId: string;
  coverageStatus: LeaveCoverageStatus;
  impactedLessonCount: number;
  resolvedLessonCount: number;
  openLessonCount: number;
  events: LeaveImpactEvent[];
}>;

export type SubstituteCandidate = Readonly<{
  teacherId: string;
  teacherBranchId: string;
  decisionSupportOnly: true;
  eligible: true;
}>;

export type CandidateResponse = Readonly<{
  leaveRequestId: string;
  scheduleEventId: string;
  courseId: string;
  eligibilityAuthority: 'teacher_courses';
  eligibilityFinalized: boolean;
  candidates: SubstituteCandidate[];
}>;

export function projectionKey(input: {
  leaveRequestId: string;
  scheduleVersionId: string;
  scheduleEventId: string;
}): string {
  return `leave:${input.leaveRequestId}:version:${input.scheduleVersionId}:event:${input.scheduleEventId}`;
}

export function computeCoverageStatus(total: number, resolved: number): LeaveCoverageStatus {
  if (total === 0) return LeaveCoverageStatus.NOT_REQUIRED;
  if (resolved === 0) return LeaveCoverageStatus.UNRESOLVED;
  if (resolved < total) return LeaveCoverageStatus.PARTIALLY_COVERED;
  return LeaveCoverageStatus.COVERED;
}

export function parseLeaveExpectedVersion(ifMatch: string | undefined, leaveId: string): number {
  if (!ifMatch?.trim()) throw new Error('LEAVE_VERSION_REQUIRED');
  const match = /^(?:W\/)?"leave:([^:"]+):v(\d+)"$/i.exec(ifMatch.trim());
  if (!match || match[1] !== leaveId) throw new Error('LEAVE_VERSION_MISMATCH');
  const version = Number.parseInt(match[2], 10);
  if (!Number.isInteger(version) || version < 1) throw new Error('LEAVE_VERSION_REQUIRED');
  return version;
}

export function overlaps(startA: Date, endA: Date, startB: Date, endB: Date): boolean {
  return startA < endB && endA > startB;
}

export function minutesFromTime(value: string): number {
  const [hour, minute] = value.split(':').map((part) => Number.parseInt(part, 10));
  return hour * 60 + minute;
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function isoDayOfWeek(date: Date): number {
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function eventOccurrenceForRange(input: {
  leaveStartsAt: Date;
  leaveEndsAt: Date;
  effectiveFrom: string;
  effectiveTo: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}): { occurrenceDate: string; startsAt: Date; endsAt: Date } | null {
  const lower = new Date(`${input.effectiveFrom}T00:00:00.000Z`);
  const leaveStartDay = new Date(Date.UTC(
    input.leaveStartsAt.getUTCFullYear(),
    input.leaveStartsAt.getUTCMonth(),
    input.leaveStartsAt.getUTCDate(),
  ));
  let cursor = lower > leaveStartDay ? lower : leaveStartDay;
  const upper = input.effectiveTo
    ? new Date(`${input.effectiveTo}T23:59:59.999Z`)
    : input.leaveEndsAt;

  for (let index = 0; index < 370 && cursor <= upper && cursor < input.leaveEndsAt; index += 1) {
    if (isoDayOfWeek(cursor) === input.dayOfWeek) {
      const date = isoDate(cursor);
      const startsAt = new Date(`${date}T${input.startTime}Z`);
      const endsAt = new Date(`${date}T${input.endTime}Z`);
      if (overlaps(startsAt, endsAt, input.leaveStartsAt, input.leaveEndsAt)) {
        return { occurrenceDate: date, startsAt, endsAt };
      }
    }
    cursor = addDays(cursor, 1);
  }
  return null;
}
