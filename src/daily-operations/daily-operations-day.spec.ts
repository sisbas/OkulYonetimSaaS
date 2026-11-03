import { DailyOperationsRepository } from './daily-operations.repository';
import {
  DailyOperationsDayLesson,
  DailyOperationsDayResponse,
} from './leave-impact.types';
import { RequestContext } from '../common/context/request-context';
import { TenantScopeRequiredError } from '../common/tenant/tenant-scope.error';

/**
 * #461 F2 — günün tam yayınlanmış programı.
 *
 * Bu spec yalnız dış davranışı bağlar: hangi SQL yayınlanmış sürüme kilitli,
 * yanıt hangi yoklama/kapsama/roster özetini taşır, draft sızıyor mu.
 */
describe('daily operations day surface (#461 F2)', () => {
  const ctx: RequestContext = {
    requestId: 'day-req',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
  };

  const baseRow = {
    scheduleEventId: 'event-1',
    scheduleId: 'schedule-1',
    scheduleVersionId: 'version-1',
    branchId: 'branch-1',
    teacherId: 'teacher-1',
    studentGroupId: 'group-1',
    courseId: 'course-1',
    roomId: 'room-1',
    timeSlotId: 'slot-1',
    startTime: '09:00:00',
    endTime: '09:40:00',
    dayOfWeek: 1,
    teacherLabel: 'Ayşe Kaya',
    courseLabel: 'Matematik',
    groupLabel: '9-A',
    roomLabel: 'D-101',
    timeSlotLabel: '1. Ders',
  };

  function repositoryWithQueries(): {
    repository: DailyOperationsRepository;
    query: jest.Mock;
  } {
    const query = jest.fn();
    const repository = new DailyOperationsRepository(
      { manager: { query } } as never,
      {} as never,
    );
    return { repository, query };
  }

  function mockDayQueries(
    query: jest.Mock,
    input: {
      lessons?: unknown[];
      attendance?: unknown[];
      membership?: unknown[];
      coverage?: unknown[];
      leaves?: unknown[];
      substitutes?: unknown[];
    },
  ): void {
    query
      .mockResolvedValueOnce([{ '?column?': 1 }]) // branch ownership
      .mockResolvedValueOnce(input.lessons ?? [])
      .mockResolvedValueOnce(input.attendance ?? [])
      .mockResolvedValueOnce(input.membership ?? [])
      .mockResolvedValueOnce(input.coverage ?? [])
      .mockResolvedValueOnce(input.leaves ?? [])
      .mockResolvedValueOnce(input.substitutes ?? []);
  }

  it('requires tenant scope before any query', async () => {
    const { repository, query } = repositoryWithQueries();
    await expect(
      repository.day({ requestId: 'missing' }, { branchId: 'branch-1', date: '2026-11-02' }),
    ).rejects.toThrow(TenantScopeRequiredError);
    expect(query).not.toHaveBeenCalled();
  });

  it('reads only the active published schedule version for the requested day', async () => {
    const { repository, query } = repositoryWithQueries();
    mockDayQueries(query, { lessons: [baseRow] });

    await repository.day(ctx, { branchId: 'branch-1', date: '2026-11-02' });

    const [sql, parameters] = query.mock.calls[1];
    expect(sql).toContain("version.status = 'published'");
    expect(sql).toContain('schedule.active_version_id = version.id');
    expect(sql).toContain("schedule.status = 'published'");
    expect(sql).toContain('event.day_of_week = $3');
    expect(sql).toContain('schedule.effective_from <= $4::date');
    expect(sql).not.toContain("'draft'");
    // 2026-11-02 Pazartesi → ISO 1.
    expect(parameters).toEqual(['tenant-1', 'branch-1', 1, '2026-11-02']);
  });

  it('returns labels, day-of-week, time range and not-started attendance from current membership', async () => {
    const { repository, query } = repositoryWithQueries();
    mockDayQueries(query, {
      lessons: [baseRow],
      membership: [{ studentGroupId: 'group-1', rosterCount: 12 }],
    });

    const result = await repository.day(ctx, {
      branchId: 'branch-1',
      date: '2026-11-02',
    });

    expect(result).toMatchObject<Partial<DailyOperationsDayResponse>>({
      tenantScoped: true,
      branchId: 'branch-1',
      date: '2026-11-02',
      dayOfWeek: 1,
      permission: 'daily_operations:read',
    });
    expect(result.lessons).toHaveLength(1);
    expect(result.lessons[0]).toMatchObject<Partial<DailyOperationsDayLesson>>({
      scheduleEventId: 'event-1',
      teacherLabel: 'Ayşe Kaya',
      courseLabel: 'Matematik',
      groupLabel: '9-A',
      roomLabel: 'D-101',
      timeSlotLabel: '1. Ders',
      timeLabel: '09:00–09:40',
      startsAt: '2026-11-02T09:00:00',
      endsAt: '2026-11-02T09:40:00',
      needsCoverage: false,
      needsAttendance: true,
    });
    expect(result.lessons[0].attendance).toEqual({
      sessionId: null,
      status: 'not_started',
      rosterCount: 12,
      recordedCount: 0,
      unrecordedCount: 12,
      presentCount: 0,
      absentCount: 0,
      lateCount: 0,
      excusedCount: 0,
    });
    expect(result.stats).toMatchObject({
      lessonCount: 1,
      rosterCount: 12,
      recordedCount: 0,
      unrecordedCount: 12,
      readOnly: true,
    });
  });

  it('uses the session roster snapshot and live record counts when a session exists', async () => {
    const { repository, query } = repositoryWithQueries();
    mockDayQueries(query, {
      lessons: [baseRow],
      attendance: [
        {
          sessionId: 'session-1',
          scheduleEventId: 'event-1',
          status: 'published',
          rosterCount: 10,
          recordedCount: 10,
          presentCount: 7,
          absentCount: 2,
          lateCount: 1,
          excusedCount: 0,
        },
      ],
      membership: [{ studentGroupId: 'group-1', rosterCount: 12 }],
    });

    const result = await repository.day(ctx, {
      branchId: 'branch-1',
      date: '2026-11-02',
    });

    expect(result.lessons[0].attendance).toEqual({
      sessionId: 'session-1',
      status: 'published',
      rosterCount: 10,
      recordedCount: 10,
      unrecordedCount: 0,
      presentCount: 7,
      absentCount: 2,
      lateCount: 1,
      excusedCount: 0,
    });
    // Oturum tamamlandı: akıştan düşer ama gün toplamında görünür.
    expect(result.lessons[0].needsAttendance).toBe(false);
    expect(result.stats).toMatchObject({
      completedSessionCount: 1,
      lockedSessionCount: 0,
      presentCount: 7,
      absentCount: 2,
      lateCount: 1,
    });
  });

  it('marks an unresolved leave projection as a coverage gap', async () => {
    const { repository, query } = repositoryWithQueries();
    mockDayQueries(query, {
      lessons: [baseRow],
      membership: [{ studentGroupId: 'group-1', rosterCount: 10 }],
      coverage: [
        {
          scheduleEventId: 'event-1',
          total: 2,
          resolved: 0,
          leaveRequestId: 'leave-1',
          substituteAssignmentId: null,
        },
      ],
      leaves: [{ id: 'leave-1', version: 4 }],
    });

    const result = await repository.day(ctx, {
      branchId: 'branch-1',
      date: '2026-11-02',
    });

    expect(result.lessons[0].coverage).toEqual({
      state: 'unresolved',
      leaveRequestId: 'leave-1',
      leaveVersion: 4,
      leaveEtag: '"leave:leave-1:v4"',
      substituteAssignmentId: null,
      substituteTeacherId: null,
      substituteTeacherLabel: null,
    });
    expect(result.lessons[0].needsCoverage).toBe(true);
    expect(result.stats.uncoveredLessonCount).toBe(1);
  });

  it('resolves coverage with the server-provided substitute label', async () => {
    const { repository, query } = repositoryWithQueries();
    mockDayQueries(query, {
      lessons: [baseRow],
      membership: [{ studentGroupId: 'group-1', rosterCount: 10 }],
      coverage: [
        {
          scheduleEventId: 'event-1',
          total: 1,
          resolved: 1,
          leaveRequestId: 'leave-1',
          substituteAssignmentId: 'assignment-1',
        },
      ],
      leaves: [{ id: 'leave-1', version: 2 }],
      substitutes: [
        {
          assignmentId: 'assignment-1',
          substituteTeacherId: 'teacher-2',
          substituteTeacherLabel: 'Mehmet Demir',
        },
      ],
    });

    const result = await repository.day(ctx, {
      branchId: 'branch-1',
      date: '2026-11-02',
    });

    expect(result.lessons[0].coverage).toMatchObject({
      state: 'covered',
      substituteAssignmentId: 'assignment-1',
      substituteTeacherId: 'teacher-2',
      substituteTeacherLabel: 'Mehmet Demir',
    });
    expect(result.lessons[0].needsCoverage).toBe(false);
    expect(result.stats.coveredLessonCount).toBe(1);
    expect(result.stats.uncoveredLessonCount).toBe(0);
  });

  it('reports partially covered lessons as a coverage gap', async () => {
    const { repository, query } = repositoryWithQueries();
    mockDayQueries(query, {
      lessons: [baseRow],
      membership: [{ studentGroupId: 'group-1', rosterCount: 10 }],
      coverage: [
        {
          scheduleEventId: 'event-1',
          total: 2,
          resolved: 1,
          leaveRequestId: 'leave-1',
          substituteAssignmentId: 'assignment-1',
        },
      ],
      leaves: [{ id: 'leave-1', version: 3 }],
      substitutes: [
        {
          assignmentId: 'assignment-1',
          substituteTeacherId: 'teacher-2',
          substituteTeacherLabel: 'Mehmet Demir',
        },
      ],
    });

    const result = await repository.day(ctx, {
      branchId: 'branch-1',
      date: '2026-11-02',
    });

    expect(result.lessons[0].coverage.state).toBe('partially_covered');
    expect(result.lessons[0].needsCoverage).toBe(true);
  });

  it('returns a zeroed read-only day without further queries when nothing is published', async () => {
    const { repository, query } = repositoryWithQueries();
    mockDayQueries(query, { lessons: [] });

    const result = await repository.day(ctx, {
      branchId: 'branch-1',
      date: '2026-11-02',
    });

    expect(result.lessons).toEqual([]);
    expect(result.stats).toEqual({
      lessonCount: 0,
      coveredLessonCount: 0,
      uncoveredLessonCount: 0,
      completedSessionCount: 0,
      lockedSessionCount: 0,
      rosterCount: 0,
      recordedCount: 0,
      unrecordedCount: 0,
      presentCount: 0,
      absentCount: 0,
      lateCount: 0,
      excusedCount: 0,
      readOnly: true,
    });
    expect(query).toHaveBeenCalledTimes(2); // ownership + published day only
  });
});
