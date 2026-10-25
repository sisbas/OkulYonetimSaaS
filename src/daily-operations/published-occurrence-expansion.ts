import { EventOccurrence, eventOccurrencesForRange } from './leave-impact.types';

/**
 * Deep seam for approved-leave occurrence matching.
 *
 * Callers remain responsible for tenant-scoped schedule loading and for
 * transaction boundaries. This seam owns only the pure domain rule: which
 * published schedule descriptors in a leave period become impacted occurrences.
 */
export interface PublishedScheduleEventDescriptor {
  readonly scheduleEventId: string;
  readonly scheduleId: string;
  readonly scheduleVersionId: string;
  readonly teacherId: string;
  readonly teacherBranchId: string;
  readonly studentGroupId: string;
  readonly courseId: string;
  readonly roomId: string;
  readonly timeSlotId: string;
  readonly dayOfWeek: number;
  readonly startTime: string;
  readonly endTime: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly courseLabel: string | null;
  readonly groupLabel: string | null;
  readonly roomLabel: string | null;
}

export interface PublishedScheduleOccurrence extends PublishedScheduleEventDescriptor, EventOccurrence {}

export class PublishedOccurrenceLimitExceededError extends RangeError {
  readonly maximumOccurrences: number;

  constructor(maximumOccurrences: number) {
    super(
      `Leave period affects more than ${maximumOccurrences} schedule occurrences; narrow the period or split the request`,
    );
    this.name = 'PublishedOccurrenceLimitExceededError';
    this.maximumOccurrences = maximumOccurrences;
  }
}

export interface PublishedOccurrenceExpansionInput {
  readonly leaveStartsAt: Date;
  readonly leaveEndsAt: Date;
  readonly timeZone: string;
  readonly maximumOccurrences: number;
  readonly publishedEvents: readonly PublishedScheduleEventDescriptor[];
}

export function expandPublishedOccurrences(
  input: PublishedOccurrenceExpansionInput,
): readonly PublishedScheduleOccurrence[] {
  const impacted: PublishedScheduleOccurrence[] = [];

  for (const event of input.publishedEvents) {
    for (const occurrence of eventOccurrencesForRange({
      leaveStartsAt: input.leaveStartsAt,
      leaveEndsAt: input.leaveEndsAt,
      effectiveFrom: event.effectiveFrom,
      effectiveTo: event.effectiveTo,
      dayOfWeek: event.dayOfWeek,
      startTime: event.startTime,
      endTime: event.endTime,
      timeZone: input.timeZone,
    })) {
      if (impacted.length >= input.maximumOccurrences) {
        throw new PublishedOccurrenceLimitExceededError(input.maximumOccurrences);
      }

      impacted.push({
        ...event,
        dayOfWeek: Number(event.dayOfWeek),
        ...occurrence,
      });
    }
  }

  return impacted;
}
