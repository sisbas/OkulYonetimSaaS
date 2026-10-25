import {
  PublishedOccurrenceLimitExceededError,
  expandPublishedOccurrences,
  type PublishedScheduleEventDescriptor,
} from './published-occurrence-expansion';

describe('published occurrence deep seam', () => {
  const baseEvent = (): PublishedScheduleEventDescriptor => ({
    scheduleEventId: 'event-1',
    scheduleId: 'schedule-1',
    scheduleVersionId: 'version-1',
    teacherId: 'teacher-1',
    teacherBranchId: 'teacher-branch-1',
    studentGroupId: 'group-1',
    courseId: 'course-1',
    roomId: 'room-1',
    timeSlotId: 'slot-1',
    dayOfWeek: 1,
    startTime: '09:00',
    endTime: '10:00',
    effectiveFrom: '2026-09-01',
    effectiveTo: null,
    courseLabel: 'Matematik',
    groupLabel: '5-A',
    roomLabel: 'Derslik 1',
  });

  it('expands only weekly occurrences that overlap the leave window', () => {
    const result = expandPublishedOccurrences({
      leaveStartsAt: new Date('2026-09-14T00:00:00.000Z'),
      leaveEndsAt: new Date('2026-09-28T20:00:00.000Z'),
      timeZone: 'Europe/Istanbul',
      maximumOccurrences: 10,
      publishedEvents: [baseEvent()],
    });

    expect(result.map((item) => item.occurrenceDate)).toEqual([
      '2026-09-14',
      '2026-09-21',
      '2026-09-28',
    ]);
    expect(result[0].courseLabel).toBe('Matematik');

  });

  it('keeps two different schedule events on the same date distinct', () => {
    const secondEvent = {
      ...baseEvent(),
      scheduleEventId: 'event-2',
      courseId: 'course-2',
      courseLabel: 'Fizik',
      startTime: '10:00',
      endTime: '11:00',
    };

    const result = expandPublishedOccurrences({
      leaveStartsAt: new Date('2026-09-14T00:00:00.000Z'),
      leaveEndsAt: new Date('2026-09-14T23:59:00.000Z'),
      timeZone: 'Europe/Istanbul',
      maximumOccurrences: 10,
      publishedEvents: [baseEvent(), secondEvent],
    });

    expect(result).toHaveLength(2);
    expect(result.map((item) => item.scheduleEventId)).toEqual(['event-1', 'event-2']);
  });

  it('ignores published events whose effective interval never intersects leave dates', () => {
    const result = expandPublishedOccurrences({
      leaveStartsAt: new Date('2026-09-14T00:00:00.000Z'),
      leaveEndsAt: new Date('2026-09-28T20:00:00.000Z'),
      timeZone: 'Europe/Istanbul',
      maximumOccurrences: 10,
      publishedEvents: [{ ...baseEvent(), effectiveFrom: '2027-01-01' }],
    });

    expect(result).toEqual([]);
  });

  it('uses positive overlap even when the lesson only partially overlaps leave', () => {
    const result = expandPublishedOccurrences({
      leaveStartsAt: new Date('2026-09-14T06:30:00.000Z'),
      leaveEndsAt: new Date('2026-09-14T09:30:00.000Z'),
      timeZone: 'Europe/Istanbul',
      maximumOccurrences: 10,
      publishedEvents: [baseEvent()],
    });

    expect(result.map((item) => item.occurrenceDate)).toEqual(['2026-09-14']);
  });

  it('throws when the configured occurrence ceiling is exceeded', () => {
    expect(() =>
      expandPublishedOccurrences({
        leaveStartsAt: new Date('2026-09-07T00:00:00.000Z'),
        leaveEndsAt: new Date('2026-09-28T20:00:00.000Z'),
        timeZone: 'Europe/Istanbul',
        maximumOccurrences: 2,
        publishedEvents: [baseEvent()],
      }),
    ).toThrow(PublishedOccurrenceLimitExceededError);
  });
});
