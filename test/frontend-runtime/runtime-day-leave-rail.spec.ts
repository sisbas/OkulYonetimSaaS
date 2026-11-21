import * as fs from 'node:fs';
import * as path from 'node:path';

import { OPS_PERMISSION_KEYS, response, runtime } from './runtime-harness';

/**
 * #455 — karar rayı: bekleyen izinler gün akışının yanında, etki önce,
 * karar sonra. Etki ve adaylar yalnız sunucudan gelir.
 */

const PROBE = [
  'state', 'loadDayLeaveRail', 'openDayLeaveDecision', 'renderDayLeaveDetail',
  'dayLeavePickSubstitute', 'dayLeaveApprove', 'dayLeaveReject',
  'loadDayLeaveCandidates', 'dayLeaveRailReset', 'substitutionsEntries',
  'dayLeaveImpactPath',
].join(', ');

const html = fs.readFileSync(path.join(process.cwd(), 'frontend/runtime/index.html'), 'utf8');

const LEAVE_ID = '22222222-2222-4222-8222-222222222222';
const EVENT_A = '33333333-3333-4333-8333-333333333331';
const EVENT_B = '33333333-3333-4333-8333-333333333332';

const pendingLeave = {
  id: LEAVE_ID,
  decisionStatus: 'pending',
  reasonCode: 'annual_leave',
  durationType: 'full_day',
  etag: `"leave:${LEAVE_ID}:v1"`,
};

function impactFor(overrides: Record<string, unknown> = {}) {
  return {
    leaveRequestId: LEAVE_ID,
    branchId: 'branch',
    leaveVersion: 1,
    leaveEtag: `"leave:${LEAVE_ID}:v1"`,
    coverageStatus: 'uncovered',
    impactedLessonCount: 2,
    resolvedLessonCount: 0,
    openLessonCount: 2,
    todayLessonCount: 1,
    events: [
      {
        scheduleEventId: EVENT_A, state: 'open', lessonLabel: 'Matematik · 5-A · 09:00',
        courseLabel: 'Matematik', occurrenceDate: '2026-11-23', occurrenceLabel: '23 Kasım 2026',
        timeLabel: '09:00–09:40', substituteTeacherId: null,
      },
      {
        scheduleEventId: EVENT_B, state: 'open', lessonLabel: 'Türkçe · 5-A · 10:00',
        courseLabel: 'Türkçe', occurrenceDate: '2026-11-24', occurrenceLabel: '24 Kasım 2026',
        timeLabel: '10:00–10:40', substituteTeacherId: null,
      },
    ],
    ...overrides,
  };
}

function setup(options: {
  leaves?: unknown[];
  impact?: Record<string, unknown>;
  candidates?: unknown[];
} = {}) {
  const ui = runtime(PROBE, OPS_PERMISSION_KEYS);
  ui.probe.state.accessToken = 'token';
  ui.probe.state.branchId = 'branch';
  ui.probe.state.date = '2026-11-23';
  const leaves = options.leaves ?? [pendingLeave];
  const impact = options.impact ?? impactFor();
  const candidates = options.candidates ?? [
    {
      teacherId: 'teacher-1', teacherLabel: 'Sunucu Adayı', branchLabel: 'Merkez',
      availabilityLabel: 'Müsait', eligible: true,
    },
  ];
  ui.fetch.mockImplementation(async (url: string) => {
    if (String(url).includes('/leaves?')) return response({ leaves });
    if (String(url).includes('/impact')) return response(impact);
    if (String(url).includes('/candidates')) return response({ candidates, eligibilityFinalized: true });
    if (String(url).includes('/approve') || String(url).includes('/reject')) {
      return response({ ...impact, decisionStatus: 'approved', events: [] });
    }
    return response({});
  });
  return ui;
}

describe('#455 gün akışının yanındaki izin karar rayı', () => {
  it('ray gün akışının yanında, ders kararından önce yer alır', () => {
    const split = html.slice(html.indexOf('<div class="day-split">'));
    expect(split.indexOf('id="day-leave-rail"')).toBeGreaterThan(-1);
    expect(split.indexOf('id="day-leave-rail"')).toBeLessThan(split.indexOf('id="day-rail"'));
    expect(html).toContain('aria-label="Karar bekleyen izinler"');
  });

  it('bekleyen izinleri sunucu etkisiyle birlikte rayda listeler', async () => {
    const ui = setup();
    await ui.probe.loadDayLeaveRail();
    const rail = ui.element('#day-leave-rail').innerHTML;
    expect(rail).toContain('Karar bekleyen izin');
    expect(rail).toContain('Etkilenen: 2 ders');
    expect(rail).toContain('Bugün: 1 ders');
    expect(rail).toContain('Açık: 2 ders');
    expect(rail).toContain('data-day-leave-state="coverage_required"');
    expect(ui.fetch.mock.calls.some((call) => String(call[0]).includes('decisionStatus=pending'))).toBe(true);
  });

  it('operasyon gününü etki isteğine sunucuya taşır', () => {
    const ui = setup();
    expect(ui.probe.dayLeaveImpactPath(LEAVE_ID)).toBe(
      `/daily-operations/leaves/${LEAVE_ID}/impact?date=2026-11-23`,
    );
  });

  it('etki projeksiyonu karar kontrollerinden önce çizilir', async () => {
    const ui = setup();
    await ui.probe.openDayLeaveDecision(LEAVE_ID);
    const detail = ui.element(`#day-leave-detail-${LEAVE_ID}`).innerHTML;
    const impactAt = detail.indexOf('id="day-leave-impact-summary"');
    const approveAt = detail.indexOf('data-action="day-leave-approve"');
    expect(impactAt).toBeGreaterThan(-1);
    expect(approveAt).toBeGreaterThan(impactAt);
    expect(detail).toContain('Bugün: 1 ders');
  });

  it('açık ders varken onay kapalıdır ve eksik yedeği söyler', async () => {
    const ui = setup();
    await ui.probe.openDayLeaveDecision(LEAVE_ID);
    const detail = ui.element(`#day-leave-detail-${LEAVE_ID}`).innerHTML;
    expect(detail).toContain('2 ders için yedek seçilmedi');
    expect(detail).toContain('aria-describedby="day-leave-block"');
    expect(ui.probe.substitutionsEntries()).toHaveLength(0);
  });

  it('sunucu adayı seçilip tüm açık dersler kapanınca onay açılır', async () => {
    const ui = setup();
    await ui.probe.openDayLeaveDecision(LEAVE_ID);
    await ui.probe.loadDayLeaveCandidates(EVENT_A);
    ui.probe.dayLeavePickSubstitute('teacher-1', EVENT_A);
    expect(ui.probe.substitutionsEntries()).toHaveLength(1);
    await ui.probe.loadDayLeaveCandidates(EVENT_B);
    ui.probe.dayLeavePickSubstitute('teacher-1', EVENT_B);
    const entries = ui.probe.substitutionsEntries();
    expect(entries).toHaveLength(2);
    expect(entries.map((entry: { scheduleEventId: string }) => entry.scheduleEventId).sort())
      .toEqual([EVENT_A, EVENT_B].sort());
    const summary = ui.element('#day-leave-substitutions-summary').innerHTML;
    expect(summary).toContain('2/2 açık ders için yedek seçildi');
  });

  it('aday etiketi yalnız sunucu yanıtından gelir', async () => {
    const ui = setup({ candidates: [{ teacherId: 'teacher-9', teacherLabel: 'Yalnız Sunucudan', eligible: true }] });
    await ui.probe.openDayLeaveDecision(LEAVE_ID);
    await ui.probe.loadDayLeaveCandidates(EVENT_A);
    const rendered = ui.element(`#day-leave-candidates-${EVENT_A}`).innerHTML;
    expect(rendered).toContain('<strong>Yalnız Sunucudan</strong>');
    // Ham kimlik yalnız data-* özniteliğinde taşınır; görünen kopyada yer almaz.
    expect(rendered.replace(/data-[a-z-]+="[^"]*"/g, '')).not.toContain('teacher-9');
  });

  it('son yüklenen ders, başka bir karttaki aday seçimini değiştirmez', async () => {
    const ui = setup();
    await ui.probe.openDayLeaveDecision(LEAVE_ID);
    await ui.probe.loadDayLeaveCandidates(EVENT_A);
    await ui.probe.loadDayLeaveCandidates(EVENT_B);
    // A kartında görünen düğme kendi dersini taşır; B son yüklenmiş olsa bile
    // seçim A'ya yazılır.
    const markupA = ui.element(`#day-leave-candidates-${EVENT_A}`).innerHTML;
    expect(markupA).toContain(`data-event-id="${EVENT_A}"`);
    ui.probe.dayLeavePickSubstitute('teacher-1', EVENT_A);
    const entries = ui.probe.substitutionsEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].scheduleEventId).toBe(EVENT_A);
  });

  it('açık ders yoksa yedek gerekmeden doğrudan onay açıktır', async () => {
    const impact = impactFor({
      openLessonCount: 0,
      resolvedLessonCount: 2,
      coverageStatus: 'covered',
      events: [
        { scheduleEventId: EVENT_A, state: 'resolved', lessonLabel: 'Matematik', occurrenceDate: '2026-11-23' },
        { scheduleEventId: EVENT_B, state: 'resolved', lessonLabel: 'Türkçe', occurrenceDate: '2026-11-24' },
      ],
    });
    const ui = setup({ impact });
    await ui.probe.openDayLeaveDecision(LEAVE_ID);
    const detail = ui.element(`#day-leave-detail-${LEAVE_ID}`).innerHTML;
    expect(detail).toContain('>Onayla</button>');
    expect(detail).not.toContain('yedek seçilmedi');
    expect(detail).not.toContain('aria-describedby="day-leave-block"');
  });

  it('karar verilen izin raydan çıkar ve kendi boş durumu görünür', async () => {
    const ui = setup({ leaves: [pendingLeave] });
    let decided = false;
    ui.fetch.mockImplementation(async (url: string) => {
      if (String(url).includes('/leaves?')) {
        return response({ leaves: decided ? [] : [pendingLeave] });
      }
      if (String(url).includes('/impact')) return response(impactFor());
      if (String(url).includes('/approve')) {
        decided = true;
        return response({ decisionStatus: 'approved' });
      }
      return response({});
    });
    await ui.probe.openDayLeaveDecision(LEAVE_ID);
    await ui.probe.loadDayLeaveCandidates(EVENT_A);
    ui.probe.dayLeavePickSubstitute('teacher-1', EVENT_A);
    await ui.probe.loadDayLeaveCandidates(EVENT_B);
    ui.probe.dayLeavePickSubstitute('teacher-1', EVENT_B);
    await ui.probe.dayLeaveApprove();
    expect(decided).toBe(true);
    const rail = ui.element('#day-leave-rail').innerHTML;
    expect(rail).toContain('Karar bekleyen izin yok');
    expect(rail).not.toContain(LEAVE_ID);
  });
});
