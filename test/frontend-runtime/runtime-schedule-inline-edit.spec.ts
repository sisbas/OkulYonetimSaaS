import { runtime, response, TENANT_ADMIN_PERMISSION_KEYS } from './runtime-harness';

/**
 * #452 — gün ajandasında yerinde ekleme/düzenleme/silme.
 *
 * Kalıcı ders çalışma kopyasında sahnelenir; tüm değişiklikler tek
 * `Taslağı kaydet` ile tek `If-Match` üzerinden kalıcılaşır. Yeni satırlar
 * mevcut `#schedule-events` editöründe kalır (Stage 5 journey sözleşmesi).
 */
const PROBE =
  'state, loadProgramme, selectScheduleDay, renderProgramme, renderAgenda, renderGate, renderScheduleEditor, addScheduleEvent, removeScheduleRow, openScheduleEventEditor, applyScheduleEventField, commitScheduleEventEdit, cancelScheduleEventEdit, removeScheduleEvent, saveScheduleDraft, validateSchedule';

const etagResponse = (body: unknown, etag: string, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(body),
  headers: { get: (name: string) => (String(name).toLowerCase() === 'etag' ? etag : null) },
});

const SCHEDULE_ID = '11111111-1111-4111-8111-111111111111';
const EVENT_ID = 'ev-1';
const UUIDS = {
  teacherId: '22222222-2222-4222-8222-222222222221',
  teacherBranchId: '33333333-3333-4333-8333-333333333331',
  studentGroupId: '44444444-4444-4444-8444-444444444441',
  courseId: '55555555-5555-4555-8555-555555555551',
  roomId: '66666666-6666-4666-8666-666666666661',
  timeSlotId: '77777777-7777-4777-8777-777777777771',
};
const eventFor = (overrides: Record<string, unknown> = {}) => ({
  eventId: EVENT_ID,
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

async function loadDraft(ui: ReturnType<typeof runtime>, read = readFor()) {
  ui.fetch.mockResolvedValueOnce(response([summaryFor()]));
  ui.fetch.mockResolvedValueOnce(response([]));
  ui.fetch.mockResolvedValueOnce(etagResponse(read, '"schedule:read-hash"'));
  await ui.probe.loadProgramme();
}

function lastCallTo(ui: ReturnType<typeof runtime>, fragment: string) {
  const calls = ui.fetch.mock.calls as Array<[string, { method?: string; headers?: Record<string, string>; body?: string }]>;
  return [...calls].reverse().find(([url]) => String(url).includes(fragment)
    && !(fragment === '/draft' && String(url).includes('/drafts')));
}

function visible(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

describe('#452 gün ajandası yerinde düzenleme yüzeyi', () => {
  it('exposes edit and delete on draft lessons, with no raw identifiers in visible copy', async () => {
    const ui = signedIn();
    await loadDraft(ui);
    const agenda = ui.element('#schedule-agenda').innerHTML;
    expect(agenda).toContain('data-action="schedule-event-edit"');
    expect(agenda).toContain('data-action="schedule-event-delete"');
    for (const ident of [SCHEDULE_ID, EVENT_ID, ...Object.values(UUIDS)]) {
      expect(visible(agenda)).not.toContain(ident);
    }
  });

  it('never offers edit or delete on a published programme', async () => {
    const ui = signedIn();
    await loadDraft(ui, readFor({
      status: 'published',
      projection: 'published_branch',
      gridState: 'weekly_grid_ready_published',
      readOnly: true,
      version: { scheduleVersionId: 'v1', versionNo: 1, status: 'published', publishedAt: '2026-11-17T10:00:00.000Z' },
    }));
    const agenda = ui.element('#schedule-agenda').innerHTML;
    expect(agenda).toContain('agenda-item');
    expect(agenda).not.toContain('data-action="schedule-event-edit"');
    expect(agenda).not.toContain('data-action="schedule-event-delete"');
  });

  it('stages an inline edit in the working copy, invalidates evidence and closes the publish gate', async () => {
    const ui = signedIn();
    await loadDraft(ui);
    const fetchCount = ui.fetch.mock.calls.length;
    ui.probe.state.scheduleEvidence = { mode: 'FULL', evidenceStatus: 'authoritative', canPublish: true, scheduleRevision: 1 };
    ui.probe.openScheduleEventEditor(EVENT_ID);
    expect(ui.element('#schedule-agenda').innerHTML).toContain('data-schedule-edit-event-id');
    ui.probe.applyScheduleEventField(EVENT_ID, 'startTime', '11:00');
    ui.probe.commitScheduleEventEdit();
    expect(ui.probe.state.scheduleEvents[0].startTime).toBe('11:00');
    expect(ui.probe.state.scheduleDirty).toBe(true);
    // #453 — kanıt silinmez; geçersiz işaretlenir ve kartta görünür kalır.
    expect(ui.probe.state.scheduleEvidence).not.toBeNull();
    expect(ui.probe.state.scheduleEvidenceInvalidated).toBe(true);
    expect(ui.element('#schedule-validation-summary').dataset.invalidated).toBe('true');
    expect(ui.fetch.mock.calls.length).toBe(fetchCount);
    expect(ui.element('#schedule-agenda').innerHTML).toContain('11:00');
    expect(ui.element('#schedule-gate').textContent).toContain('Kaydedilmemiş değişiklik');
  });

  it('cancel restores the original lesson and clears the staged change', async () => {
    const ui = signedIn();
    await loadDraft(ui);
    ui.probe.openScheduleEventEditor(EVENT_ID);
    ui.probe.applyScheduleEventField(EVENT_ID, 'startTime', '13:00');
    expect(ui.probe.state.scheduleDirty).toBe(true);
    ui.probe.cancelScheduleEventEdit();
    expect(ui.probe.state.scheduleEvents[0].startTime).toBe('09:00');
    expect(ui.probe.state.scheduleDirty).toBe(false);
    expect(ui.element('#schedule-agenda').innerHTML).not.toContain('data-schedule-edit-event-id');
  });

  it('deleting every persisted lesson leaves save open and persists an empty event list', async () => {
    const ui = signedIn();
    await loadDraft(ui);
    ui.probe.removeScheduleEvent(EVENT_ID);
    expect(ui.probe.state.scheduleEvents).toEqual([]);
    expect(ui.probe.state.scheduleDirty).toBe(true);
    expect(ui.element('#schedule-gate').textContent).toContain('en az bir ders');
    expect(ui.element('#schedule-editor').classList.contains('hidden')).toBe(false);
    expect(ui.element('#save-schedule-draft').disabled).toBe(false);

    ui.fetch.mockResolvedValueOnce(etagResponse({ id: SCHEDULE_ID }, '"schedule:write"'));
    ui.fetch.mockResolvedValueOnce(etagResponse(readFor({ events: [], eventCount: 0, revision: 2 }), '"schedule:readback"'));
    await ui.probe.saveScheduleDraft();
    const save = lastCallTo(ui, '/draft');
    expect(save?.[1].method).toBe('POST');
    expect(save?.[1].headers?.['If-Match']).toBe(`"schedule:${SCHEDULE_ID}:v1"`);
    expect(JSON.parse(save?.[1].body ?? '{}').events).toEqual([]);
    expect(ui.probe.state.scheduleDirty).toBe(false);
  });

  it('adds a lesson on the selected day, weekends included, without leaving the day view', async () => {
    const ui = signedIn();
    await loadDraft(ui);
    ui.probe.selectScheduleDay(6);
    ui.probe.addScheduleEvent();
    expect(Number(ui.probe.state.scheduleRows[0].dayOfWeek)).toBe(6);
    expect(ui.probe.state.scheduleDirty).toBe(true);
    ui.probe.selectScheduleDay(0);
    ui.probe.addScheduleEvent();
    expect(Number(ui.probe.state.scheduleRows[1].dayOfWeek)).toBe(0);
  });

  it('sends one merged write with a single If-Match for staged edits, deletes and new rows', async () => {
    const ui = signedIn();
    await loadDraft(ui);
    ui.probe.openScheduleEventEditor(EVENT_ID);
    ui.probe.applyScheduleEventField(EVENT_ID, 'endTime', '10:40');
    ui.probe.commitScheduleEventEdit();
    ui.probe.addScheduleEvent();
    ui.probe.state.scheduleRows[0] = {
      ...eventFor({ eventId: '' }),
      dayOfWeek: '6',
    };
    ui.fetch.mockResolvedValueOnce(etagResponse({ id: SCHEDULE_ID }, '"schedule:write"'));
    ui.fetch.mockResolvedValueOnce(etagResponse(readFor({
      revision: 2,
      events: [eventFor({ endTime: '10:40' }), eventFor({ eventId: 'ev-2', dayOfWeek: 6 })],
      eventCount: 2,
    }), '"schedule:readback"'));
    await ui.probe.saveScheduleDraft();
    const draftCalls = (ui.fetch.mock.calls as Array<[string]>).filter(([url]) => String(url).includes('/draft') && !String(url).includes('/drafts'));
    expect(draftCalls.length).toBe(1);
    const save = lastCallTo(ui, '/draft');
    const body = JSON.parse(save?.[1].body ?? '{}');
    expect(body.events.length).toBe(2);
    expect(body.events.find((e: { eventId: string }) => e.eventId === EVENT_ID).endTime).toBe('10:40');
    expect(save?.[1].headers?.['If-Match']).toBe(`"schedule:${SCHEDULE_ID}:v1"`);
    expect(ui.probe.state.scheduleRevision).toBe(2);
    expect(ui.probe.state.scheduleDirty).toBe(false);
  });
});
