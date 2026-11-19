import * as fs from 'node:fs';
import * as path from 'node:path';

import { runtime, response, TENANT_ADMIN_PERMISSION_KEYS } from './runtime-harness';

/**
 * #452 — sürüm otoritesi ve 412/428/offline kilitleri.
 *
 * `If-Match` yalnız sunucunun read-back gövdesindeki revision'dan kurulur;
 * eksik sürüm ile bayat sürüm ayrı yüzey, ayrı metin ve ayrı kontrol
 * davranışıdır. Hiçbir koşulda otomatik mutation retry yoktur.
 */
const PROBE =
  'state, isOffline, mutationDisabled, mutationToken, loadProgramme, addScheduleEvent, recomputeScheduleDirty, saveScheduleDraft, validateSchedule, scheduleMutationLocked, renderProgramme, renderAgenda, renderGate, renderScheduleEditor, renderScheduleActions';

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
  eventCount: 1,
  events: [eventFor()],
  ...overrides,
});
const summaryFor = () => ({
  scheduleId: SCHEDULE_ID,
  status: 'draft',
  projection: 'management_draft',
  gridState: 'weekly_grid_ready_draft',
  readOnly: false,
  revision: 1,
  eventCount: 1,
});

function signedIn() {
  const ui = runtime(PROBE, TENANT_ADMIN_PERMISSION_KEYS);
  ui.probe.state.accessToken = 'token';
  ui.probe.state.branchId = 'DEMO';
  return ui;
}

function mockProgrammeFetch(ui: ReturnType<typeof runtime>, read: unknown) {
  ui.fetch.mockResolvedValueOnce(response([summaryFor()]));
  ui.fetch.mockResolvedValueOnce(response([]));
  ui.fetch.mockResolvedValueOnce(etagResponse(read, '"schedule:content-addressed-read-hash"'));
}

function renderedText(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

describe('#452 sunucu sürümü tek otoritedir', () => {
  const schedule = fs.readFileSync(path.join(process.cwd(), 'frontend/runtime/screens/schedule.js'), 'utf8');

  it('mutationToken invents no version: no || 1, no client arithmetic, positive integer only', () => {
    const body = schedule.match(/function mutationToken\([\s\S]*?\n\}/)?.[0] ?? '';
    expect(body).toContain('Number.isInteger');
    expect(body).not.toContain('|| 1');
    expect(body).not.toContain('+ 1');
    expect(schedule).not.toContain('state.scheduleEtag');
  });

  it('builds If-Match from the revision the server issued, not the GET ETag', async () => {
    const ui = signedIn();
    mockProgrammeFetch(ui, readFor({ revision: 7 }));
    await ui.probe.loadProgramme();
    expect(ui.probe.state.scheduleRevision).toBe(7);
    expect(ui.probe.state.scheduleIfMatch).toBe(`"schedule:${SCHEDULE_ID}:v7"`);
    expect(ui.probe.state.scheduleEtag).toBeUndefined();
  });

  it('locks writes and hides the editor when the read carries no revision', async () => {
    const ui = signedIn();
    mockProgrammeFetch(ui, readFor({ revision: undefined }));
    await ui.probe.loadProgramme();
    expect(ui.probe.state.scheduleRevision).toBe(0);
    expect(ui.probe.state.scheduleIfMatch).toBe('');
    expect(ui.probe.state.scheduleVersionState).toBe('version_required');
    expect(ui.probe.scheduleMutationLocked()).toBe(true);
    expect(ui.element('#schedule-editor').classList.contains('hidden')).toBe(true);
    expect(ui.element('#schedule-status').dataset.state).toBe('version_required');
    expect(ui.element('#schedule-gate').dataset.gateState).toBe('version_missing');
    expect(ui.element('#schedule-actions').innerHTML).toContain('disabled');
    const before = ui.fetch.mock.calls.length;
    await ui.probe.saveScheduleDraft();
    expect(ui.fetch.mock.calls.length).toBe(before);
  });

  it('re-reads after a successful save and builds the next If-Match from that read-back', async () => {
    const ui = signedIn();
    mockProgrammeFetch(ui, readFor({ revision: 1, events: [], eventCount: 0 }));
    await ui.probe.loadProgramme();
    ui.probe.addScheduleEvent();
    ui.probe.state.scheduleRows[0] = {
      ...eventFor({ eventId: '' }),
      dayOfWeek: '1',
    };
    ui.fetch.mockResolvedValueOnce(etagResponse({ id: SCHEDULE_ID }, '"schedule:write-response"'));
    ui.fetch.mockResolvedValueOnce(etagResponse(readFor({ revision: 8, events: [eventFor()], eventCount: 1 }), '"schedule:readback"'));
    await ui.probe.saveScheduleDraft();
    const calls = ui.fetch.mock.calls as Array<[string, { headers?: Record<string, string> }]>;
    const save = calls.find(([url]) => String(url).includes('/draft') && !String(url).includes('/drafts'));
    expect(save?.[1].headers?.['If-Match']).toBe(`"schedule:${SCHEDULE_ID}:v1"`);
    const detailCalls = calls.filter(([url]) => String(url).endsWith(`/schedules/${SCHEDULE_ID}`));
    expect(detailCalls.length).toBe(2);
    expect(ui.probe.state.scheduleIfMatch).toBe(`"schedule:${SCHEDULE_ID}:v8"`);
    ui.fetch.mockResolvedValueOnce(etagResponse({ mode: 'FULL' }, '"schedule:validate"'));
    await ui.probe.validateSchedule({ preventDefault: () => {} });
    const validate = (ui.fetch.mock.calls as Array<[string, { headers?: Record<string, string> }]>)
      .find(([url]) => String(url).includes('/validate'));
    expect(validate?.[1].headers?.['If-Match']).toBe(`"schedule:${SCHEDULE_ID}:v8"`);
  });
});

describe('#452 412 ve 428 ayrı yüzeylerdir ve otomatik yeniden deneme yapmaz', () => {
  async function lockedSave(ui: ReturnType<typeof runtime>, status: number, code: string) {
    mockProgrammeFetch(ui, readFor({ revision: 2, events: [eventFor()], eventCount: 1 }));
    await ui.probe.loadProgramme();
    ui.probe.state.scheduleRows = [{ ...eventFor({ eventId: '' }), dayOfWeek: '1' }];
    ui.probe.recomputeScheduleDirty();
    const before = ui.fetch.mock.calls.length;
    ui.fetch.mockResolvedValueOnce(response({ code, message: 'sunucu reddi' }, status));
    await ui.probe.saveScheduleDraft();
    return { before, after: ui.fetch.mock.calls.length };
  }

  it('412 keeps the staged work visible and disabled, with its own copy, and never retries', async () => {
    const ui = signedIn();
    const { before, after } = await lockedSave(ui, 412, 'SCHEDULE_VERSION_MISMATCH');
    expect(after - before).toBe(1);
    expect(ui.probe.state.scheduleVersionState).toBe('stale_version');
    expect(ui.probe.scheduleMutationLocked()).toBe(true);
    expect(ui.element('#schedule-status').dataset.state).toBe('stale_version');
    expect(renderedText(ui.element('#schedule-status').innerHTML)).toContain('başka bir işlemle güncellendi');
    expect(ui.element('#schedule-gate').dataset.gateState).toBe('version_stale');
    expect(renderedText(ui.element('#schedule-gate').innerHTML + ui.element('#schedule-gate').textContent))
      .toContain('değişiklikleriniz korunuyor');
    // Editör görünür ama tüm kontroller disabled; çalışma kopyası duruyor.
    expect(ui.element('#schedule-editor').classList.contains('hidden')).toBe(false);
    expect(ui.element('#schedule-events').innerHTML).toContain('disabled');
    expect(ui.element('#add-schedule-event').disabled).toBe(true);
    expect(ui.element('#save-schedule-draft').disabled).toBe(true);
    expect(ui.probe.state.scheduleRows.length).toBe(1);
    expect(ui.probe.state.scheduleEvents[0].startTime).toBe('09:00');
    expect(ui.element('#schedule-agenda').innerHTML).toContain('data-action="schedule-event-edit"');
    expect(renderedText(ui.element('#schedule-status').innerHTML)).not.toMatch(/412|SCHEDULE_VERSION/);
  });

  it('428 hides the editor and the edit controls, with different copy, and never retries', async () => {
    const ui = signedIn();
    const { before, after } = await lockedSave(ui, 428, 'SCHEDULE_VERSION_REQUIRED');
    expect(after - before).toBe(1);
    expect(ui.probe.state.scheduleVersionState).toBe('version_required');
    expect(ui.probe.scheduleMutationLocked()).toBe(true);
    expect(ui.element('#schedule-status').dataset.state).toBe('version_required');
    expect(renderedText(ui.element('#schedule-status').innerHTML)).toContain('sürümü doğrulanamadı');
    expect(ui.element('#schedule-gate').dataset.gateState).toBe('version_missing');
    expect(ui.element('#schedule-editor').classList.contains('hidden')).toBe(true);
    expect(ui.element('#schedule-agenda').innerHTML).not.toContain('data-action="schedule-event-edit"');
    expect(ui.element('#schedule-actions').innerHTML).toContain('disabled');
    expect(renderedText(ui.element('#schedule-status').innerHTML)).not.toMatch(/428|SCHEDULE_VERSION/);
  });

  it('a manual refresh is the only unlock and it reissues the token from the server', async () => {
    const ui = signedIn();
    await lockedSave(ui, 412, 'SCHEDULE_VERSION_MISMATCH');
    expect(ui.probe.scheduleMutationLocked()).toBe(true);
    mockProgrammeFetch(ui, readFor({ revision: 3 }));
    await ui.probe.loadProgramme();
    expect(ui.probe.state.scheduleVersionState).toBe('');
    expect(ui.probe.scheduleMutationLocked()).toBe(false);
    expect(ui.probe.state.scheduleIfMatch).toBe(`"schedule:${SCHEDULE_ID}:v3"`);
    expect(ui.element('#schedule-editor').classList.contains('hidden')).toBe(false);
    expect(ui.element('#schedule-actions').innerHTML).not.toContain('id="validate-schedule" disabled');
  });
});

describe('#452 offline istemci okur ama yazmaz ve depolanan veriye düşmez', () => {
  it('keeps the last server read on screen, blocks writes with zero requests, and uses no storage', async () => {
    const root = path.join(process.cwd(), 'frontend/runtime');
    const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
    const schedule = fs.readFileSync(path.join(root, 'screens/schedule.js'), 'utf8');
    for (const token of ['localStorage', 'sessionStorage', 'indexedDB', 'document.cookie']) {
      expect(app).not.toContain(token);
      expect(schedule).not.toContain(token);
    }

    const ui = signedIn();
    mockProgrammeFetch(ui, readFor({ revision: 4 }));
    await ui.probe.loadProgramme();
    expect(ui.element('#schedule-agenda').innerHTML).toContain('agenda-item');

    ui.fetch.mockRejectedValue(new Error('network down'));
    await ui.probe.loadProgramme();
    expect(ui.probe.isOffline()).toBe(true);
    expect(ui.probe.mutationDisabled()).toBe(true);
    expect(ui.element('#schedule-status').dataset.state).toBe('offline_or_unavailable');
    expect(ui.element('#schedule-agenda').innerHTML).toContain('agenda-item');

    const before = ui.fetch.mock.calls.length;
    await ui.probe.saveScheduleDraft();
    expect(ui.fetch.mock.calls.length).toBe(before);
    expect(renderedText(ui.element('#message-region').innerHTML)).toContain('Bağlantı');
  });
});
