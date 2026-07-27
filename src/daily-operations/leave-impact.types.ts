import { LeaveCoverageStatus } from '../leaves/leave-request.entity';

export const DEFAULT_TENANT_TIME_ZONE = 'Europe/Istanbul';

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

export type EventOccurrence = Readonly<{
  occurrenceDate: string;
  startsAt: Date;
  endsAt: Date;
}>;

export function projectionKey(input: {
  leaveRequestId: string;
  scheduleVersionId: string;
  scheduleEventId: string;
  occurrenceDate: string;
}): string {
  return `leave:${input.leaveRequestId}:version:${input.scheduleVersionId}:event:${input.scheduleEventId}:date:${input.occurrenceDate}`;
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

function datePartsInTimeZone(date: Date, timeZone: string): { year: string; month: string; day: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return { year: value.year, month: value.month, day: value.day };
}

function dateStringInTimeZone(date: Date, timeZone: string): string {
  const { year, month, day } = datePartsInTimeZone(date, timeZone);
  return `${year}-${month}-${day}`;
}

function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split('-').map((part) => Number.parseInt(part, 10));
  return new Date(Date.UTC(year, month - 1, day));
}

function maxDateString(left: string, right: string): string {
  return left >= right ? left : right;
}

function minDateString(left: string, right: string): string {
  return left <= right ? left : right;
}

function timeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(value.year),
    Number(value.month) - 1,
    Number(value.day),
    Number(value.hour) % 24,
    Number(value.minute),
    Number(value.second),
  );
  return (asUtc - date.getTime()) / 60000;
}

function zonedDateTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = date.split('-').map((part) => Number.parseInt(part, 10));
  const [hour, minute, second = 0] = time.split(':').map((part) => Number.parseInt(part, 10));
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, second, 0);
  let instant = new Date(localAsUtc);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    instant = new Date(localAsUtc - timeZoneOffsetMinutes(instant, timeZone) * 60000);
  }
  return instant;
}

export function eventOccurrencesForRange(input: {
  leaveStartsAt: Date;
  leaveEndsAt: Date;
  effectiveFrom: string;
  effectiveTo: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  timeZone?: string;
}): EventOccurrence[] {
  const timeZone = input.timeZone ?? DEFAULT_TENANT_TIME_ZONE;
  const leaveStartDate = dateStringInTimeZone(input.leaveStartsAt, timeZone);
  const leaveEndDate = dateStringInTimeZone(input.leaveEndsAt, timeZone);
  const lowerDate = maxDateString(input.effectiveFrom, leaveStartDate);
  const upperDate = input.effectiveTo ? minDateString(input.effectiveTo, leaveEndDate) : leaveEndDate;
  let cursor = parseDateOnly(lowerDate);
  const upper = parseDateOnly(upperDate);
  const occurrences: EventOccurrence[] = [];

  while (cursor <= upper) {
    if (isoDayOfWeek(cursor) === input.dayOfWeek) {
      const occurrenceDate = isoDate(cursor);
      const startsAt = zonedDateTimeToUtc(occurrenceDate, input.startTime, timeZone);
      const endsAt = zonedDateTimeToUtc(occurrenceDate, input.endTime, timeZone);
      if (overlaps(startsAt, endsAt, input.leaveStartsAt, input.leaveEndsAt)) {
        occurrences.push({ occurrenceDate, startsAt, endsAt });
      }
    }
    cursor = addDays(cursor, 1);
  }

  return occurrences;
}

export function eventOccurrenceForRange(input: Parameters<typeof eventOccurrencesForRange>[0]): EventOccurrence | null {
  return eventOccurrencesForRange(input)[0] ?? null;
}
