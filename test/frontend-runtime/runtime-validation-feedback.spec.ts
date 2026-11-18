import {
  runtime,
  TENANT_ADMIN_PERMISSION_KEYS,
} from './runtime-harness';

const PROBE =
  'state, loadScheduleDetail, validateSchedule, renderConflictResolution, renderValidationSummary, canPublishNow';

/** Yalnızca görünen metin: öznitelik değerleri hariç. */
function renderedText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const etagResponse = (body: unknown, etag: string, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(body),
  headers: { get: (name: string) => (String(name).toLowerCase() === 'etag' ? etag : null) },
});

const SCHEDULE_ID = '11111111-1111-4111-8111-111111111111';

const UUIDS = {
  teacherId: '22222222-2222-4222-8222-222222222221',
  teacherBranchId: '33333333-3333-4333-8333-333333333331',
  studentGroupId: '44444444-4444-4444-8444-444444444441',
  courseId: '55555555-5555-4555-8555-555555555551',
  roomId: '66666666-6666-4666-8666-666666666661',
  timeSlotId: '77777777-7777-4777-8777-777777777771',
};

const eventFor = (overrides: Record<string, unknown> = {}) => ({
  eventId: 'ev-1',
  ...UUIDS,
  dayOfWeek: 1,
  startTime: '09:00',
  endTime: '09:40',
  timeSlotLabel: null,
  ...overrides,
});

const readFor = (overrides: Record<string, unknown> = {}) => ({
  contractId: 'M3_SCHEDULE_CONTRACT_V2',
  contractVersion: '2.0.0',
  scheduleId: SCHEDULE_ID,
  branchId: '88888888-8888-4888-8888-888888888888',
  status: 'draft',
  projection: 'management_draft',
  gridState: 'weekly_grid_ready_draft',
  readOnly: false,
  revision: 1,
  effectiveFrom: '2026-01-01',
  effectiveTo: '2026-06-30',
  version: null,
  eventCount: 2,
  events: [
    eventFor(),
    eventFor({ eventId: 'ev-2', dayOfWeek: 2, startTime: '13:10', endTime: '13:50' }),
  ],
  ...overrides,
});

const evidenceFor = (overrides: Record<string, unknown> = {}) => ({
  mode: 'FULL',
  evidenceStatus: 'authoritative',
  status: 'invalid',
  canPublish: false,
  hardConflictCount: 1,
  scheduleRevision: 1,
  inputFingerprint: 'fp-0000abcdef',
  reasons: [],
  ...overrides,
});

function signedIn() {
  const ui = runtime(PROBE, TENANT_ADMIN_PERMISSION_KEYS);
  ui.probe.state.accessToken = 'token';
  ui.probe.state.branchId = 'ANKARA';
  ui.probe.state.scheduleId = SCHEDULE_ID;
  ui.probe.state.scheduleRevision = 1;
  ui.probe.state.scheduleEtag = `"schedule:${SCHEDULE_ID}:v1"`;
  ui.probe.state.scheduleRead = readFor();
  ui.probe.state.scheduleEvents = ui.probe.state.scheduleRead.events;
  ui.probe.state.scheduleDay = 1;
  return ui;
}

/** Sunucudan gelen neden kodlarını ve kanıt özetini validate üzerinden sür. */
async function validateWith(ui: ReturnType<typeof runtime>, evidence: Record<string, unknown>) {
  ui.fetch.mockResolvedValueOnce(etagResponse(evidence, `"schedule:${SCHEDULE_ID}:v1"`));
  await ui.probe.validateSchedule({ preventDefault: () => {} });
}

// Sözleşme v2 §9: kod → kanonik UI durumu.
const CONTRACT_MAP: Array<[string, string]> = [
  ['TEACHER_TIME_OVERLAP', 'event_conflict_teacher'],
  ['STUDENT_GROUP_TIME_OVERLAP', 'event_conflict_group'],
  ['ROOM_TIME_OVERLAP', 'event_conflict_room'],
  ['TIMESLOT_INACTIVE', 'reference_timeslot_inactive'],
  ['TEACHER_INACTIVE', 'reference_teacher_inactive'],
  ['STUDENT_GROUP_INACTIVE', 'reference_group_inactive'],
  ['TEACHER_BRANCH_ASSIGNMENT_MISSING', 'reference_teacher_branch_missing'],
  ['TEACHER_COURSE_MISMATCH', 'reference_teacher_course_mismatch'],
  // Güvenlik kodları: kanonda ortak durum (non-enumerating) — ayrı durumlar açılamaz.
  ['TENANT_REFERENCE_MISMATCH', 'reference_not_found'],
  ['BRANCH_REFERENCE_MISMATCH', 'reference_not_found'],
  ['PUBLISHED_SCHEDULE_IMMUTABLE', 'published_read_only'],
  ['SCHEDULE_EMPTY', 'publish_blocked_empty'],
  ['SCHEDULE_VALIDATION_STALE', 'publish_blocked_stale'],
  ['SCHEDULE_HARD_CONFLICTS_PRESENT', 'publish_blocked_conflicts'],
  ['PUBLISHED_SCHEDULE_PERIOD_CONFLICT', 'publish_blocked_period'],
  ['SCHEDULE_VERSION_MISMATCH', 'stale_version'],
  ['SCHEDULE_VERSION_REQUIRED', 'version_required'],
];

describe('#451 doğrulama geri bildirimi — her neden kodunun kendi durumu', () => {
  it('renders each of the 17 canonical codes with its contract UI state; the two security codes hold one state', async () => {
    const ui = signedIn();
    await validateWith(
      ui,
      evidenceFor({
        hardConflictCount: 2,
        reasons: [
          { code: 'TEACHER_TIME_OVERLAP', eventId: 'ev-1', conflictingEventId: 'ev-2' },
          { code: 'STUDENT_GROUP_TIME_OVERLAP', eventId: 'ev-1', conflictingEventId: 'ev-2' },
          { code: 'ROOM_TIME_OVERLAP', eventId: 'ev-1', conflictingEventId: 'ev-2' },
          { code: 'TIMESLOT_INACTIVE', eventId: 'ev-1' },
          { code: 'TEACHER_INACTIVE', eventId: 'ev-1' },
          { code: 'STUDENT_GROUP_INACTIVE', eventId: 'ev-2' },
          { code: 'TEACHER_BRANCH_ASSIGNMENT_MISSING', eventId: 'ev-1' },
          { code: 'TEACHER_COURSE_MISMATCH', eventId: 'ev-2' },
          { code: 'TENANT_REFERENCE_MISMATCH' },
          { code: 'BRANCH_REFERENCE_MISMATCH' },
          { code: 'PUBLISHED_SCHEDULE_IMMUTABLE' },
          { code: 'SCHEDULE_EMPTY' },
          { code: 'SCHEDULE_VALIDATION_STALE' },
          { code: 'SCHEDULE_HARD_CONFLICTS_PRESENT' },
          { code: 'PUBLISHED_SCHEDULE_PERIOD_CONFLICT' },
          { code: 'SCHEDULE_VERSION_MISMATCH', eventId: 'ev-1' },
          { code: 'SCHEDULE_VERSION_REQUIRED' },
        ],
      }),
    );
    const findings = ui.element('#schedule-conflicts').innerHTML;
    for (const [code, expected] of CONTRACT_MAP) {
      // Tanımsız kalan kod, geri halkası yerine kanonik durumu taşır.
      const row = findings.match(
        new RegExp(`data-schedule-reason="${code}"[^>]*`, 'm'),
      );
      expect(row).not.toBeNull();
      expect(row![0]).toContain(`data-state="${expected}"`);
    }
    // İki güvenlik kodu kanonda paylaşılan tek durumu kullanır (sözleşme §9);
    // diğer 15 kod ikili olarak ayrık türetilir.
    const securityStates = [...findings.matchAll(
      /data-schedule-reason="(?:TENANT|BRANCH)_REFERENCE_MISMATCH" data-state="([a-z_]+)"/g,
    )].map((m) => m[1]);
    expect(securityStates).toEqual(['reference_not_found', 'reference_not_found']);
    const others = [...findings.matchAll(/data-schedule-reason="([A-Z_]+)" data-state="([a-z_]+)"/g)]
      .map((m) => m[2])
      .filter((state) => state !== 'reference_not_found');
    expect(new Set(others).size).toBe(others.length);
  });

  it('renders reference problems in their own words', async () => {
    const ui = signedIn();
    await validateWith(
      ui,
      evidenceFor({
        canPublish: false,
        hardConflictCount: 0,
        reasons: [
          { code: 'TIMESLOT_INACTIVE', eventId: 'ev-1' },
          { code: 'TEACHER_INACTIVE', eventId: 'ev-1' },
          { code: 'STUDENT_GROUP_INACTIVE', eventId: 'ev-2' },
          { code: 'TEACHER_BRANCH_ASSIGNMENT_MISSING', eventId: 'ev-1' },
          { code: 'TEACHER_COURSE_MISMATCH', eventId: 'ev-2' },
        ],
      }),
    );
    const text = renderedText(ui.element('#schedule-conflicts').innerHTML);
    expect(text).toContain('Ders saati aktif değil');
    expect(text).toContain('Öğretmen aktif değil');
    expect(text).toContain('Sınıf aktif değil');
    expect(text).toContain('Öğretmenin bu şubeye görevlendirmesi yok');
    expect(text).toContain('Öğretmen bu dersi veremiyor');
  });

  it('renders an unresolvable record as not found, with no resource, branch or tenant hint', async () => {
    const ui = signedIn();
    await validateWith(
      ui,
      evidenceFor({
        canPublish: false,
        hardConflictCount: 0,
        reasons: [{ code: 'TENANT_REFERENCE_MISMATCH' }, { code: 'BRANCH_REFERENCE_MISMATCH' }],
      }),
    );
    const text = renderedText(ui.element('#schedule-conflicts').innerHTML);
    expect(text).toContain('İlgili kayıt bulunamadı');
    expect(text).not.toMatch(/tenant|kurum|şube|kaynak türü|resource/i);
  });

  it('names the other lesson a conflict clashes with', async () => {
    const ui = signedIn();
    await validateWith(
      ui,
      evidenceFor({
        canPublish: false,
        hardConflictCount: 1,
        reasons: [{ code: 'TEACHER_TIME_OVERLAP', eventId: 'ev-1', conflictingEventId: 'ev-2' }],
      }),
    );
    const html = ui.element('#schedule-conflicts').innerHTML;
    const text = renderedText(html);
    expect(text).toContain('Çakıştığı ders');
    expect(text).toContain('Salı');
    expect(text).toContain('13:10');
    // Çakıştığı derse gitme köprüsü teşhis kanalında kalır.
    expect(html).toContain('data-action="schedule-conflict-show"');
    expect(html).toContain('data-event-id="ev-2"');
  });

  it('groups findings by day and never merges one into another', async () => {
    const ui = signedIn();
    await validateWith(
      ui,
      evidenceFor({
        canPublish: false,
        hardConflictCount: 2,
        reasons: [
          { code: 'TEACHER_TIME_OVERLAP', eventId: 'ev-1', conflictingEventId: 'ev-2' },
          { code: 'TEACHER_INACTIVE', eventId: 'ev-2' },
          { code: 'ROOM_TIME_OVERLAP', eventId: 'ev-2', conflictingEventId: 'ev-1' },
          { code: 'SCHEDULE_EMPTY' },
        ],
      }),
    );
    const html = ui.element('#schedule-conflicts').innerHTML;
    expect(html).toContain('data-finding-day="1"');
    expect(html).toContain('data-finding-day="2"');
    expect(html).toContain('data-finding-day="genel"');
    expect(html).toContain('data-finding-count="1"');
    expect(html).toContain('data-finding-count="2"');
    expect((html.match(/<li /g) || []).length).toBe(4);
    const text = renderedText(html);
    expect(text).toContain('Pazartesi');
    expect(text).toContain('Salı');
    expect(text).toContain('Genel');
  });
});

describe('#451 doğrulama geri bildirimi — kısmi vs tam doğrulama', () => {
  it('renders partial validation as editor feedback, never as publish evidence', async () => {
    const ui = signedIn();
    await validateWith(
      ui,
      evidenceFor({
        mode: 'INCREMENTAL',
        evidenceStatus: 'editor_feedback',
        canPublish: true, // sunucu contağı olsa bile kısmi doğrulama yayın izni değildir.
        hardConflictCount: 0,
        reasons: [],
      }),
    );
    const summary = ui.element('#schedule-validation-summary');
    const text = renderedText(summary.innerHTML);
    expect(String(summary.dataset.mode)).toBe('INCREMENTAL');
    expect(String(summary.dataset.evidenceStatus)).toBe('editor_feedback');
    expect(String(summary.dataset.publishability)).toBe('not_evidence');
    expect(text).toContain('Editör geri bildirimi');
    expect(text).toContain('yayın kararı değildir');
    expect(text).not.toContain('Yayın izni: Evet');
    expect(ui.probe.canPublishNow()).toBe(false);
    expect(ui.element('#schedule-actions').innerHTML).toContain('disabled');
  });

  it('renders a full validation with its mode, evidence status, publishability, revision, fingerprint and conflict count', async () => {
    const ui = signedIn();
    ui.probe.state.scheduleRevision = 2;
    ui.probe.state.scheduleRead = { ...ui.probe.state.scheduleRead, revision: 2 };
    ui.probe.state.scheduleEtag = `"schedule:${SCHEDULE_ID}:v2"`;
    await validateWith(
      ui,
      evidenceFor({
        canPublish: false,
        hardConflictCount: 3,
        scheduleRevision: 2,
        inputFingerprint: 'fp-deadbeef9876543210',
        reasons: [{ code: 'TEACHER_TIME_OVERLAP', eventId: 'ev-1', conflictingEventId: 'ev-2' }],
      }),
    );
    const summary = ui.element('#schedule-validation-summary');
    const text = renderedText(summary.innerHTML);
    expect(summary.hidden).toBe(false);
    expect(String(summary.dataset.mode)).toBe('FULL');
    expect(String(summary.dataset.evidenceStatus)).toBe('authoritative');
    expect(String(summary.dataset.publishability)).toBe('no');
    expect(text).toContain('Tam doğrulama');
    expect(text).toContain('Kanıt durumu: Güncel');
    expect(text).toContain('Yayın izni: Hayır');
    expect(text).toContain('Revizyon: 2');
    expect(text).toContain('fp-deadbeef9876543210');
    expect(text).toContain('Yayın engelleyici çatışma: 3');
  });
});

describe('#451 doğrulama geri bildirimi — yayınlanabilir tam doğrulama', () => {
  it('marks a clean full run as publishable without leaking the fingerprint into diagnostics', async () => {
    const ui = signedIn();
    await validateWith(
      ui,
      evidenceFor({
        canPublish: true,
        hardConflictCount: 0,
        reasons: [],
      }),
    );
    const summary = ui.element('#schedule-validation-summary');
    const text = renderedText(summary.innerHTML);
    expect(summary.hidden).toBe(false);
    expect(String(summary.dataset.publishability)).toBe('yes');
    expect(text).toContain('Yayın izni: Evet');
    expect(text).toContain('Yayın engelleyici çatışma: 0');
  });
});
