import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  runtime,
  response,
  ALL_PERMISSION_KEYS,
  TEACHER_PERMISSION_KEYS,
} from './runtime-harness';

/**
 * #454 — Operasyon gün kurulu (split screen).
 *
 * Günün dersleri solda yayınlanmış program sırasıyla; yoklama dersin olduğu
 * yerde. Sağ sutun seçili dersin kararıdır: sunucu-türetimli yoklama listesi
 * veya öğretmensiz dersin karşılık ataması (adaylar YALNIZ sunucudan).
 * Devamsızlık istatistikleri salt-okunur canlı şerittir ve her mutasyondan
 * sonra sunucudan yeniden okunur — istemci stat üretmez, sıralama yapmaz.
 * Gün kapatma kavramı bu sistemde YOKTUR.
 */

const PROBE =
  'state, dayCoverage, updateContext, loadDayBoard, openDayRoster, markDayAttendance, markAllDayPresent, loadDayCoverage, assignDayCandidate';

const BRANCH = 'ANKARA';
const DATE = '2026-11-03';
const SID = 'sess-1';

// Günlük karşılık ataması dışında kalan dar persona: karar/mutasyon
// yetkileri yokta bile kontroller gizlenmez — devre dışı çizilir (AC-8).
const NO_COVERAGE_KEYS = ALL_PERMISSION_KEYS.filter(
  (key) => key !== 'leave:impact:read' && key !== 'daily_operations:update',
);

function signedIn(permissions = ALL_PERMISSION_KEYS) {
  const ui = runtime(PROBE, permissions);
  ui.probe.state.accessToken = 'token';
  ui.probe.state.branchId = BRANCH;
  ui.probe.state.date = DATE;
  return ui;
}

function attendanceSummary(overrides = {}) {
  return {
    sessionId: SID,
    status: 'published',
    rosterCount: 3,
    recordedCount: 0,
    unrecordedCount: 3,
    presentCount: 0,
    absentCount: 0,
    lateCount: 0,
    excusedCount: 0,
    ...overrides,
  };
}

function coverageSummary(overrides = {}) {
  return {
    state: 'not_required',
    leaveRequestId: null,
    leaveVersion: null,
    leaveEtag: null,
    substituteAssignmentId: null,
    substituteTeacherId: null,
    substituteTeacherLabel: null,
    ...overrides,
  };
}

function dayLesson(overrides = {}) {
  return {
    scheduleEventId: 'event-1',
    scheduleId: 'sched-1',
    scheduleVersionId: 'sv-1',
    branchId: BRANCH,
    occurrenceDate: DATE,
    dayOfWeek: 2,
    startTime: '09:00',
    endTime: '10:00',
    startsAt: `${DATE}T09:00`,
    endsAt: `${DATE}T10:00`,
    timeLabel: '09:00–10:00',
    teacherId: 'teacher-1',
    teacherLabel: 'Ada Demir',
    studentGroupId: 'g1',
    groupLabel: '8-A',
    courseId: 'c1',
    courseLabel: 'Matematik',
    roomId: 'r1',
    roomLabel: 'Derslik 2',
    timeSlotId: 'ts1',
    timeSlotLabel: '1. ders',
    lessonLabel: 'Matematik · 8-A · 09:00–10:00',
    attendance: attendanceSummary(),
    coverage: coverageSummary(),
    needsCoverage: false,
    needsAttendance: true,
    ...overrides,
  };
}

/** `DailyOperationsDayStats` sunucu türetimi (test yerel kopya değil). */
function dayStatsFrom(lessons: Array<any>) {
  const sum = (key: string) =>
    lessons.reduce((total, lesson) => total + Number(lesson.attendance[key] ?? 0), 0);
  return {
    lessonCount: lessons.length,
    coveredLessonCount: lessons.filter((lesson) => !lesson.needsCoverage).length,
    uncoveredLessonCount: lessons.filter((lesson) => lesson.needsCoverage).length,
    completedSessionCount: lessons.filter(
      (lesson) =>
        lesson.attendance.sessionId !== null &&
        lesson.attendance.rosterCount > 0 &&
        lesson.attendance.recordedCount >= lesson.attendance.rosterCount &&
        lesson.attendance.status !== 'draft',
    ).length,
    lockedSessionCount: lessons.filter((lesson) => lesson.attendance.status === 'locked').length,
    rosterCount: sum('rosterCount'),
    recordedCount: sum('recordedCount'),
    unrecordedCount: sum('unrecordedCount'),
    presentCount: sum('presentCount'),
    absentCount: sum('absentCount'),
    lateCount: sum('lateCount'),
    excusedCount: sum('excusedCount'),
    readOnly: true,
  };
}

function dayBody(lessons: Array<any>, overrides = {}) {
  return {
    tenantScoped: true,
    branchId: BRANCH,
    date: DATE,
    dayOfWeek: 2,
    permission: 'daily_operations:read',
    lessons,
    stats: dayStatsFrom(lessons),
    ...overrides,
  };
}

function rosterRow(overrides = {}) {
  return {
    studentId: 's1',
    studentCode: '101',
    studentLabel: 'Ada Demir',
    status: 'not_marked',
    ...overrides,
  };
}

function rosterBody(rows: Array<any>, overrides = {}) {
  const count = (status: string) => rows.filter((row) => row.status === status).length;
  return {
    tenantScoped: true,
    sessionId: SID,
    status: 'published',
    sessionVersion: 1,
    rows,
    summary: {
      rosterCount: rows.length,
      recordedCount: rows.filter((row) => row.status !== 'not_marked').length,
      unrecordedCount: rows.filter((row) => row.status === 'not_marked').length,
      presentCount: count('present'),
      absentCount: count('absent'),
      lateCount: count('late'),
      excusedCount: count('excused'),
    },
    ...overrides,
  };
}

function lessonWithoutTeacher() {
  return dayLesson({
    scheduleEventId: 'event-2',
    teacherId: '',
    teacherLabel: 'Öğretmen bilgisi çözümlenemedi',
    lessonLabel: 'Türkçe · 7-B · 10:00–11:00',
    timeLabel: '10:00–11:00',
    needsCoverage: true,
    coverage: coverageSummary({
      state: 'unresolved',
      leaveRequestId: 'leave-7',
      leaveVersion: 3,
      leaveEtag: 'W/"7"',
    }),
  });
}

describe('#454 daily-ops day board', () => {
  describe('left column — the day', () => {
    it('loads the branch day through the day endpoint and renders lessons in server order', async () => {
      const a = dayLesson();
      const b = lessonWithoutTeacher();
      const ui = signedIn();
      ui.fetch.mockResolvedValueOnce(response(dayBody([a, b])));

      await ui.probe.loadDayBoard();

      const [url, init] = ui.fetch.mock.calls[0];
      expect(String(url)).toBe(`/api/v1/daily-operations/day?branchId=${BRANCH}&date=${DATE}`);
      expect(init.headers['x-branch-code']).toBe(BRANCH);
      const lessonsHtml = ui.element('#day-lessons').innerHTML;
      expect(lessonsHtml).toContain('Matematik · 8-A · 09:00–10:00');
      expect(lessonsHtml).toContain('Türkçe · 7-B · 10:00–11:00');
      expect(lessonsHtml.indexOf('Matematik')).toBeLessThan(lessonsHtml.indexOf('Türkçe'));
      // Sunucu sırası korunur; istemci yeniden sıralamaz.
      expect(ui.probe.state.dayLessonCount).toBe(2);
    });

    it('stamps the canonical empty state when the day has no published lessons', async () => {
      const ui = signedIn();
      ui.fetch.mockResolvedValueOnce(response(dayBody([])));

      await ui.probe.loadDayBoard();

      expect(ui.element('#day-lessons').dataset.state).toBe('same_scope_empty');
      expect(ui.renderedStrings()).toContain('Gün programı boş');
    });

    it('fails closed for the teacher role: the day fetch is denied before it is sent', async () => {
      const ui = signedIn(TEACHER_PERMISSION_KEYS);

      await ui.probe.loadDayBoard();

      expect(ui.fetch).not.toHaveBeenCalled();
      expect(ui.element('#day-lessons').dataset.state).toBe('forbidden_non_enumerating');
      expect(ui.renderedStrings()).not.toMatch(/data-action="day-(mark|present-all|assign)"/);
    });

    it('refuses to send a day fetch without a branch context', async () => {
      const ui = signedIn();
      ui.probe.state.branchId = '';

      await ui.probe.loadDayBoard();

      expect(ui.fetch).not.toHaveBeenCalled();
      expect(ui.renderedStrings()).toContain('Gün kurulu için şube seçin.');
    });

    it('matches completed sessions against the server rule without a close-the-day action', async () => {
      const done = dayLesson({
        attendance: attendanceSummary({
          recordedCount: 3,
          unrecordedCount: 0,
          presentCount: 2,
          absentCount: 1,
        }),
        needsAttendance: false,
      });
      const ui = signedIn();
      ui.fetch.mockResolvedValueOnce(response(dayBody([done])));

      await ui.probe.loadDayBoard();

      expect(ui.element('#day-lessons').innerHTML).toContain('data-state="done"');
      expect(ui.element('#day-summary').innerHTML).toContain('Tamamlanan oturum: 1');
      // Gün kapatma kavramı sistemde yoktur — salt-okunur canlı şerit için
      // dürüst bağlam ipucu çizilir.
      expect(ui.element('#day-summary').innerHTML).toContain('salt-okunur');
    });
  });

  describe('live statistics strip', () => {
    it('reads every number from the server response and becomes truthfully read-only', async () => {
      const a = dayLesson();
      const ui = signedIn();
      ui.fetch.mockResolvedValueOnce(response(dayBody([a])));

      await ui.probe.loadDayBoard();

      const strip = ui.element('#day-summary').innerHTML;
      expect(strip).toContain('Ders: 1');
      expect(strip).toContain('İşaretli: 0');
      expect(strip).toContain('İşaretsiz: 3');
      expect(strip).toContain('Hazır: 0');
      expect(strip).toContain('Devamsız: 0');
      expect(strip).toContain('dönem raporu değildir');
      expect(strip).not.toContain('undefined');
    });
  });

  describe('attendance in place', () => {
    it('renders the roster on the right in server order with the server summary', async () => {
      const rows = [
        rosterRow({ studentId: 'sc-2', studentLabel: 'Ece Aydın', studentCode: '102' }),
        rosterRow({ studentId: 'sc-1', studentLabel: 'Ada Demir', studentCode: '101', status: 'late' }),
      ];
      const ui = signedIn();
      ui.fetch.mockResolvedValueOnce(response(rosterBody(rows)));

      await ui.probe.openDayRoster(SID);

      const [url] = ui.fetch.mock.calls[0];
      expect(String(url)).toBe(`/api/v1/attendance/sessions/${SID}/roster`);
      const rail = ui.element('#day-rail').innerHTML;
      expect(rail.indexOf('Ece Aydın')).toBeLessThan(rail.indexOf('Ada Demir'));
      expect(rail).toContain('1/2 işaretli');
      expect(rail).toContain('1 Geç');
      // Kimlik yalnız diagnostika veri kanalından (data-*) taşınır.
      expect(rail).toContain('data-student-id="sc-2"');
    });

    it('marks a student in place and recomputes strip and roster from the server', async () => {
      const ui = signedIn();
      ui.fetch.mockResolvedValueOnce(response({ sessionId: SID, sessionVersion: 2 }));
      ui.fetch.mockResolvedValueOnce(
        response(rosterBody([rosterRow({ status: 'absent' })], { sessionVersion: 2 })),
      );
      ui.fetch.mockResolvedValueOnce(
        response(
          dayBody([
            dayLesson({
              attendance: attendanceSummary({
                recordedCount: 1,
                unrecordedCount: 2,
                absentCount: 1,
              }),
            }),
          ]),
        ),
      );

      await ui.probe.markDayAttendance(SID, 'sc-5', 'absent');

      const calls = ui.fetch.mock.calls;
      expect(String(calls[0][0])).toBe(`/api/v1/attendance/sessions/${SID}/records`);
      expect(JSON.parse(calls[0][1].body)).toEqual({ studentId: 'sc-5', status: 'absent' });
      expect(String(calls[1][0])).toBe(`/api/v1/attendance/sessions/${SID}/roster`);
      expect(String(calls[2][0])).toBe(`/api/v1/daily-operations/day?branchId=${BRANCH}&date=${DATE}`);
      expect(ui.element('#day-rail').innerHTML).toContain('data-action="day-mark"');
      expect(ui.element('#day-rail').innerHTML).toContain('Devamsız');
      expect(ui.element('#day-summary').innerHTML).toContain('Devamsız: 1');
    });

    it('marks the whole class present in one action targeting the 5-segment present route', async () => {
      const ui = signedIn();
      ui.fetch.mockResolvedValueOnce(
        response({ sessionId: SID, sessionVersion: 2, rosterCount: 3 }),
      );
      ui.fetch.mockResolvedValueOnce(
        response(
          rosterBody([
            rosterRow({ status: 'present' }),
            rosterRow({ studentId: 'sc-2', status: 'present' }),
            rosterRow({ studentId: 'sc-3', status: 'present' }),
          ]),
        ),
      );
      ui.fetch.mockResolvedValueOnce(
        response(
          dayBody([
            dayLesson({
              attendance: attendanceSummary({
                recordedCount: 3,
                unrecordedCount: 0,
                presentCount: 3,
              }),
              needsAttendance: false,
            }),
          ]),
        ),
      );

      await ui.probe.markAllDayPresent(SID);

      const calls = ui.fetch.mock.calls;
      expect(String(calls[0][0])).toBe(`/api/v1/attendance/sessions/${SID}/records/present`);
      // Roster gövdeyle taşınmaz; sunucu snapshot'ı kullanır.
      expect(calls[0][1].body).toBeUndefined();
      expect(ui.element('#day-summary').innerHTML).toContain('Tamamlanan oturum: 1');
    });

    it('keeps a locked session read-only on the card and offers only the correction path', async () => {
      const lockedLesson = dayLesson({ attendance: attendanceSummary({ status: 'locked' }) });
      const ui = signedIn();
      ui.fetch.mockResolvedValueOnce(response(rosterBody([rosterRow()], { status: 'locked', sessionVersion: 2 })));

      await ui.probe.openDayRoster(SID);

      const rail = ui.element('#day-rail').innerHTML;
      expect(rail).not.toContain('data-action="day-mark"');
      expect(rail).not.toContain('data-action="day-present-all"');
      expect(rail).toContain('data-action="day-correct"');
      expect(rail).toContain('data-session-version="2"');
      expect(rail).toContain('Kontrollü düzeltme');
    });

    it('renders the locked-lesson card without marking shortcuts', async () => {
      const lockedLesson = dayLesson({ attendance: attendanceSummary({ status: 'locked' }) });
      const ui = signedIn();
      ui.fetch.mockResolvedValueOnce(response(dayBody([lockedLesson])));

      await ui.probe.loadDayBoard();

      const lessonsHtml = ui.element('#day-lessons').innerHTML;
      expect(lessonsHtml).not.toContain('data-action="day-present-all"');
      expect(lessonsHtml).toContain('yalnız kontrollü düzeltme');
      expect(ui.element('#day-summary').innerHTML).toContain('Kilitli oturum: 1');
    });
  });

  describe('coverage assignment on the teacher-less lesson', () => {
    it('offers the rail action on the lesson and lists only server-returned candidates', async () => {
      const ui = signedIn();
      ui.fetch.mockResolvedValueOnce(response(dayBody([lessonWithoutTeacher()])));

      await ui.probe.loadDayBoard();

      const lessonsHtml = ui.element('#day-lessons').innerHTML;
      expect(lessonsHtml).toContain('data-action="day-coverage"');
      expect(lessonsHtml).not.toMatch(/data-action="day-coverage"[^>]*disabled/);
      // Karar çubuğu bağlamında dersi taşıyan data-urkanlar sunucu değerleri:
      expect(lessonsHtml).toContain('data-leave-id="leave-7"');
      expect(lessonsHtml).toContain('data-leave-etag="W/&quot;7&quot;"');
    });

    it('loads server-listed candidates into the rail and does not disable the assignment control', async () => {
      const ui = signedIn();
      ui.fetch.mockResolvedValueOnce(
        response({
          candidates: [
            { teacherId: 'sub-1', displayName: 'Ali Veli', courseEligible: true, availabilityStatus: 'available' },
          ],
        }),
      );

      await ui.probe.loadDayCoverage('leave-7', 'event-2', 'W/"7"', 'Türkçe · 7-B');

      const [url] = ui.fetch.mock.calls[0];
      expect(String(url)).toBe('/api/v1/daily-operations/leaves/leave-7/events/event-2/candidates');
      const rail = ui.element('#day-rail').innerHTML;
      expect(rail).toContain('Ali Veli');
      expect(rail).toContain('data-teacher-id="sub-1"');
      expect(rail).not.toMatch(/data-action="day-assign"[^>]*disabled/);
    });

    it('assigns through If-Match and refreshes BOTH the day and the rail from the server', async () => {
      const ui = signedIn();
      // Akış önce dersi çubuğa alır (aday listesi sunucudan), sonra atama yapar.
      ui.fetch.mockResolvedValueOnce(
        response({
          candidates: [
            { teacherId: 'sub-1', displayName: 'Ali Veli', courseEligible: true, availabilityStatus: 'available' },
          ],
        }),
      );
      await ui.probe.loadDayCoverage('leave-7', 'event-2', 'W/"7"', 'Türkçe · 7-B');
      ui.fetch.mockClear();

      ui.fetch.mockResolvedValueOnce(response({ events: [{ scheduleEventId: 'event-2', substituteAssignmentId: 'asg-9' }] }));
      ui.fetch.mockResolvedValueOnce(
        response(
          dayBody([
            lessonWithoutTeacher(),
          ].map((lesson) => ({
            ...lesson,
            coverage: coverageSummary({
              state: 'covered',
              substituteAssignmentId: 'asg-9',
              substituteTeacherLabel: 'Ali Veli',
            }),
            needsCoverage: false,
          }))),
        ),
      );
      ui.fetch.mockResolvedValueOnce(
        response({
          candidates: [
            { teacherId: 'sub-1', displayName: 'Ali Veli', courseEligible: true, availabilityStatus: 'available' },
          ],
        }),
      );

      await ui.probe.assignDayCandidate('sub-1');

      const calls = ui.fetch.mock.calls;
      expect(String(calls[0][0])).toBe('/api/v1/daily-operations/leaves/leave-7/events/event-2/substitution');
      expect(calls[0][1].headers['If-Match']).toBe('W/"7"');
      expect(JSON.parse(calls[0][1].body)).toEqual({ substituteTeacherId: 'sub-1' });
      expect(String(calls[1][0])).toBe(`/api/v1/daily-operations/day?branchId=${BRANCH}&date=${DATE}`);
      expect(String(calls[2][0])).toBe('/api/v1/daily-operations/leaves/leave-7/events/event-2/candidates');
      expect(ui.probe.dayCoverage.assignmentId).toBe('asg-9');
    });

    it('stamps the eligibility blocking state when the server has not finalized candidates', async () => {
      const ui = signedIn();
      ui.fetch.mockResolvedValueOnce(response({ eligibilityFinalized: false }));

      await ui.probe.loadDayCoverage('leave-7', 'event-2', 'W/"7"', 'Türkçe · 7-B');

      expect(ui.element('#day-rail').dataset.state).toBe('eligibility_not_ready');
    });

    it('keeps coverage controls disabled (not hidden) without the decision keys', async () => {
      const ui = runtime(PROBE, NO_COVERAGE_KEYS);
      ui.probe.state.accessToken = 'token';
      ui.probe.state.branchId = BRANCH;
      ui.probe.state.date = DATE;
      ui.fetch.mockResolvedValueOnce(response(dayBody([lessonWithoutTeacher()])));

      await ui.probe.loadDayBoard();

      const lessonsHtml = ui.element('#day-lessons').innerHTML;
      expect(lessonsHtml).toMatch(/data-action="day-coverage"[^>]*disabled/);
    });
  });

  describe('no close-the-day, ever', () => {
    it('renders no close-the-day action anywhere on the day screen or its module source', async () => {
      const ui = signedIn();
      ui.fetch.mockResolvedValueOnce(response(dayBody([dayLesson()])));
      ui.fetch.mockResolvedValueOnce(
        response(rosterBody([rosterRow()])),
      );

      await ui.probe.loadDayBoard();
      await ui.probe.openDayRoster(SID);

      expect(ui.renderedStrings()).not.toMatch(/kapat/i);
      const daySource = fs.readFileSync(
        path.join(process.cwd(), 'frontend', 'runtime', 'screens', 'day.js'),
        'utf8',
      );
      expect(daySource).not.toMatch(/kapat/i);
    });
  });
});
