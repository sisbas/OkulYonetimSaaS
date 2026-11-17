import { runtime, response, ALL_PERMISSION_KEYS, TEACHER_PERMISSION_KEYS, TENANT_ADMIN_PERMISSION_KEYS } from './runtime-harness';

const PROBE =
  'state, canRequest, hasCapability, navSectionsFor, loadProgramme, loadScheduleDetail, createSchedule, addScheduleEvent, saveScheduleDraft, validateSchedule, publishSchedule, canPublishNow, renderProgramme, renderScheduleStatus, renderDayStrip, renderAgenda, renderGate, renderScheduleEditor, renderScheduleActions, selectScheduleDay';

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
  eventCount: 0,
  events: [],
  ...overrides,
});

const summaryFor = (overrides: Record<string, unknown> = {}) => ({
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
  eventCount: 0,
  ...overrides,
});

const evidenceFor = (overrides: Record<string, unknown> = {}) => ({
  mode: 'FULL',
  evidenceStatus: 'authoritative',
  status: 'valid',
  canPublish: true,
  hardConflictCount: 0,
  reasons: [],
  scheduleRevision: 2,
  inputFingerprint: 'abc',
  ...overrides,
});

function signedIn(permissions: string[], label = 'Referans Şube · DEMO') {
  const ui = runtime(PROBE, permissions);
  ui.probe.state.accessToken = 'token';
  ui.probe.state.branchId = 'DEMO';
  ui.probe.state.branchLabel = label;
  return ui;
}

function lastCallTo(ui: ReturnType<typeof runtime>, fragment: string) {
  const calls = ui.fetch.mock.calls as Array<[string, { method?: string; headers?: Record<string, string>; body?: string }]>;
  return [...calls].reverse().find(([url]) => String(url).includes(fragment));
}

/** drafts → published → GET detail (bu sırayı uygular). */
function mockProgrammeFetch(ui: ReturnType<typeof runtime>, { draft = false, published = false, read }: {
  draft?: unknown;
  published?: unknown;
  read: unknown;
}) {
  ui.fetch.mockResolvedValueOnce(response(draft ? [draft] : []));
  ui.fetch.mockResolvedValueOnce(response(published ? [published] : []));
  ui.fetch.mockResolvedValueOnce(response(read));
}

const twoEvents = [
  eventFor({ eventId: 'ev-1', startTime: '10:00', endTime: '10:40', dayOfWeek: 1 }),
  eventFor({ eventId: 'ev-2', startTime: '09:00', endTime: '09:40', dayOfWeek: 1 }),
  eventFor({ eventId: 'ev-3', startTime: '11:00', endTime: '11:40', dayOfWeek: 6 }),
];

describe('#450 haftalık program — yükleme ve hafta görünümü', () => {
  it('management persona loads the draft list + published list + detail, in that order', async () => {
    const ui = signedIn(TENANT_ADMIN_PERMISSION_KEYS);
    mockProgrammeFetch(ui, { draft: summaryFor({ revision: 2 }), read: readFor({ events: twoEvents, eventCount: 3, revision: 1 }) });
    await ui.probe.loadProgramme();
    const urls = (ui.fetch.mock.calls as Array<[string]>).map(([url]) => String(url));
    expect(urls[0]).toContain('/schedules/drafts');
    expect(urls[1]).toContain('/schedules/published');
    expect(urls[2]).toContain(`/schedules/${SCHEDULE_ID}`);
    expect(ui.probe.state.scheduleId).toBe(SCHEDULE_ID);
    expect(ui.element('#schedule-status').innerHTML).toContain('Taslak program');
    expect(ui.element('#schedule-status').dataset.gridState).toBe('weekly_grid_ready_draft');
  });

  it('renders the week strip with weekday counts, weekend only with events', async () => {
    const ui = signedIn(TENANT_ADMIN_PERMISSION_KEYS);
    mockProgrammeFetch(ui, { draft: summaryFor(), read: readFor({ events: twoEvents, eventCount: 3, revision: 1 }) });
    await ui.probe.loadProgramme();
    const strip = ui.element('#schedule-daystrip').innerHTML;
    expect(strip).toContain('Pazartesi');
    expect(strip).toContain('Cumartesi'); // dayOfWeek 6, olay var
    expect(strip).not.toContain('data-day="0"'); // Pazar: olay yok, çizilmez
    expect(strip).toContain('data-day="1"');
    expect(strip).toContain('data-day="6"');
    expect(ui.element('#schedule-daystrip').classList.contains('hidden')).toBe(false);
  });

  it('defaults the agenda to the first weekday with events and to time order', async () => {
    const ui = signedIn(TENANT_ADMIN_PERMISSION_KEYS);
    mockProgrammeFetch(ui, { draft: summaryFor(), read: readFor({ events: twoEvents, eventCount: 3, revision: 1 }) });
    await ui.probe.loadProgramme();
    expect(ui.probe.state.scheduleDay).toBe(1);
    const html = ui.element('#schedule-agenda').innerHTML;
    expect(html.indexOf('09:00')).toBeGreaterThan(0);
    expect(html.indexOf('09:00')).toBeLessThan(html.indexOf('10:00'));
    expect(html).toContain('agenda-item');
  });

  it('selecting a day re-renders the agenda without a network call; the day can be emptied', async () => {
    const ui = signedIn(TENANT_ADMIN_PERMISSION_KEYS);
    mockProgrammeFetch(ui, { draft: summaryFor(), read: readFor({ events: twoEvents, eventCount: 3, revision: 1 }) });
    await ui.probe.loadProgramme();
    const fetchCount = ui.fetch.mock.calls.length;
    ui.probe.selectScheduleDay(6);
    expect(ui.probe.state.scheduleDay).toBe(6);
    expect(ui.element('#schedule-agenda').innerHTML).toContain('11:00');
    expect(ui.fetch.mock.calls.length).toBe(fetchCount);
    ui.probe.selectScheduleDay(2);
    expect(ui.element('#schedule-agenda').dataset.state).toBe('same_scope_empty');
  });

  it('keeps raw identifiers out of visible copy (K-35)', async () => {
    const ui = signedIn(TENANT_ADMIN_PERMISSION_KEYS);
    mockProgrammeFetch(ui, { draft: summaryFor(), read: readFor({ events: twoEvents, eventCount: 3, revision: 1 }) });
    await ui.probe.loadProgramme();
    const visible = renderedText(
      ['#schedule-status', '#schedule-agenda', '#schedule-gate', '#schedule-daystrip']
        .map((sel) => ui.element(sel).innerHTML)
        .join(' '),
    );
    for (const ident of [SCHEDULE_ID, EVENT_ID, ...Object.values(UUIDS), 'weekly_grid_ready_draft', 'management_draft']) {
      expect(visible).not.toContain(ident);
    }
  });
});

describe('#450 haftalık program — kaydet → doğrula → yayınla', () => {
  const draftWithOneEvent = readFor({ events: [eventFor()], eventCount: 1, revision: 2 });

  it('keeps the publish gate closed until a save→validate cycle completes', async () => {
    const ui = signedIn(TENANT_ADMIN_PERMISSION_KEYS);
    mockProgrammeFetch(ui, { draft: summaryFor(), read: readFor() }); // boş taslak
    await ui.probe.loadProgramme();
    expect(ui.probe.canPublishNow()).toBe(false);
    expect(ui.element('#schedule-gate').textContent).toContain('Yayın için en az bir ders gerekli.');

    // Ders ekle (yerel satır) — kapı kapanır, doğrulama devre dışı kalır.
    ui.probe.addScheduleEvent();
    expect(ui.probe.state.scheduleDirty).toBe(true);
    expect(ui.element('#schedule-gate').textContent).toContain('Kaydedilmemiş değişiklik');
    expect(ui.element('#schedule-actions').innerHTML).toContain('disabled');
    expect(ui.probe.canPublishNow()).toBe(false);

    // Satırı doldur ve kaydet: taze revision okunur.
    ui.probe.state.scheduleRows = [eventFor({ eventId: '' })].map((row) => ({ ...row, dayOfWeek: '1' }));
    ui.fetch.mockResolvedValueOnce(etagResponse({ id: SCHEDULE_ID }, '"schedule:11111111-1111-4111-8111-111111111111:v2"'));
    ui.fetch.mockResolvedValueOnce(etagResponse(draftWithOneEvent, '"schedule:readbackhash"'));
    await ui.probe.saveScheduleDraft();
    expect(ui.probe.state.scheduleRevision).toBe(2);
    expect(ui.probe.state.scheduleRows).toEqual([]);
    expect(ui.probe.state.scheduleDirty).toBe(false);
    expect(ui.element('#schedule-gate').textContent).toContain('Yayın için güncel doğrulama gerekli.');
    expect(ui.probe.canPublishNow()).toBe(false);

    // Güncel kanıt: FULL + authoritative + canPublish + mevcut revision.
    ui.fetch.mockResolvedValueOnce(etagResponse({ ...evidenceFor() }, '"schedule:11111111-1111-4111-8111-111111111111:v2"'));
    await ui.probe.validateSchedule({ preventDefault: () => {} });
    expect(ui.element('#schedule-gate').textContent).toContain('Doğrulama güncel; program yayınlanabilir.');
    expect(ui.element('#schedule-actions').innerHTML).toContain('id="publish-schedule"');
    expect(ui.probe.canPublishNow()).toBe(true);

    // Yayın: yanıt sonrası read-after-write published grid state'ine geçer.
    ui.fetch.mockResolvedValueOnce(etagResponse({ id: SCHEDULE_ID, versionNo: 1 }, '"schedule:11111111-1111-4111-8111-111111111111:v2"'));
    ui.fetch.mockResolvedValueOnce(etagResponse(
      readFor({ status: 'published', projection: 'published_branch', gridState: 'weekly_grid_ready_published', readOnly: true, revision: 2, version: { scheduleVersionId: 'v1', versionNo: 1, status: 'published', publishedAt: '2026-11-17T10:00:00.000Z' }, events: [eventFor()], eventCount: 1 }),
      '"schedule:publishedhash"',
    ));
    await ui.probe.publishSchedule();
    expect(ui.element('#schedule-status').innerHTML).toContain('Yayınlanmış program');
    expect(ui.element('#schedule-status').dataset.gridState).toBe('weekly_grid_ready_published');
    expect(ui.element('#schedule-editor').classList.contains('hidden')).toBe(true);
    expect(ui.element('#schedule-actions').innerHTML).toContain('new-schedule-draft');
    expect(ui.element('#schedule-actions').innerHTML).not.toContain('publish-schedule');
    expect(ui.probe.canPublishNow()).toBe(false);
  });

  it('sends persisted events + new rows, with the documented If-Match (never the read ETag)', async () => {
    const ui = signedIn(TENANT_ADMIN_PERMISSION_KEYS);
    mockProgrammeFetch(ui, { draft: summaryFor(), read: readFor({ revision: 1 }) });
    await ui.probe.loadProgramme();
    // GET yanıtının ETag'i content-addressed'dir (sha256 benzeri) — asla If-Match değil.
    expect(ui.probe.state.scheduleEtag).toBe('"schedule:11111111-1111-4111-8111-111111111111:v1"');

    ui.probe.state.scheduleRows = [{ ...eventFor({ eventId: '' }), dayOfWeek: '1' }].map((row) => ({ ...row }));
    ui.fetch.mockResolvedValueOnce(etagResponse({ id: SCHEDULE_ID }, '"schedule:11111111-1111-4111-8111-111111111111:v2"'));
    ui.fetch.mockResolvedValueOnce(etagResponse(draftWithOneEvent, '"schedule:readbackhash"'));
    await ui.probe.saveScheduleDraft();

    const save = lastCallTo(ui, '/schedules/11111111-1111-4111-8111-111111111111/draft');
    expect(save).toBeDefined();
    expect(save![1].method).toBe('POST');
    expect(save![1].headers?.['If-Match']).toBe('"schedule:11111111-1111-4111-8111-111111111111:v1"');
    expect(JSON.parse(save![1].body ?? '{}').events.length).toBe(1);
    // Read-back sonrası jeton taze revision'dan yeniden kurulur.
    expect(ui.probe.state.scheduleEtag).toBe('"schedule:11111111-1111-4111-8111-111111111111:v2"');
  });

  it('keeps publish disabled when the evidence is stale or conflicting', async () => {
    const ui = signedIn(TENANT_ADMIN_PERMISSION_KEYS);
    mockProgrammeFetch(ui, { draft: summaryFor(), read: draftWithOneEvent });
    await ui.probe.loadProgramme();

    // Kanıt yok: kapı kapalı.
    expect(ui.probe.canPublishNow()).toBe(false);

    // Çatışmalı kanıt: kapı kapalı, bulgular görünür.
    ui.fetch.mockResolvedValueOnce(etagResponse(
      { ...evidenceFor({ canPublish: false, hardConflictCount: 2, reasons: [{ code: 'TEACHER_TIME_OVERLAP' }] }) },
      '"schedule:11111111-1111-4111-8111-111111111111:v2"',
    ));
    await ui.probe.validateSchedule({ preventDefault: () => {} });
    expect(ui.probe.canPublishNow()).toBe(false);
    expect(ui.element('#schedule-gate').textContent).toContain('Doğrulama yayın engelleri buldu.');
    expect(ui.element('#schedule-conflicts').innerHTML).toContain('data-schedule-reason="TEACHER_TIME_OVERLAP"');

    // Kanıt bir önceki revision'a aitse stale sayılır.
    ui.fetch.mockResolvedValueOnce(etagResponse(
      { ...evidenceFor({ scheduleRevision: 1 }) },
      '"schedule:11111111-1111-4111-8111-111111111111:v2"',
    ));
    await ui.probe.validateSchedule({ preventDefault: () => {} });
    expect(ui.probe.canPublishNow()).toBe(false);
    expect(ui.element('#schedule-gate').textContent).toContain('Yayın için güncel doğrulama gerekli.');
  });

  it('a 412 on save renders the canonical stale surface and never retries', async () => {
    const ui = signedIn(TENANT_ADMIN_PERMISSION_KEYS);
    mockProgrammeFetch(ui, { draft: summaryFor(), read: readFor() });
    await ui.probe.loadProgramme();
    ui.probe.state.scheduleRows = [{ ...eventFor({ eventId: '' }), dayOfWeek: '1' }];
    const callsBefore = ui.fetch.mock.calls.length;
    ui.fetch.mockResolvedValueOnce(response({ code: 'SCHEDULE_VERSION_MISMATCH', message: 'Kayıt güncellendi' }, 412));
    await ui.probe.saveScheduleDraft();
    expect(ui.fetch.mock.calls.length - callsBefore).toBe(1);
    expect(ui.element('#schedule-status').dataset.state).toBe('stale_version');
    expect(ui.probe.state.scheduleRows.length).toBe(1); // satırlar korunur
  });
});

describe('#450 haftalık program — oluşturma akışı', () => {
  const validEvent = { ...eventFor({ eventId: '' }), dayOfWeek: '1' };

  it('refuses to create without a branch, or without both dates, without hitting the network', async () => {
    const ui = signedIn(TENANT_ADMIN_PERMISSION_KEYS);
    ui.probe.state.branchId = '';
    ui.probe.state.branchLabel = '';
    ui.element('#schedule-effective-from').value = '2026-01-01';
    ui.element('#schedule-effective-to').value = '2026-06-30';
    await ui.probe.createSchedule({ preventDefault: () => {} });
    expect(ui.fetch).not.toHaveBeenCalled();

    ui.probe.state.branchId = 'DEMO';
    ui.probe.state.branchLabel = 'Referans Şube · DEMO';
    ui.element('#schedule-effective-from').value = '2026-06-30';
    ui.element('#schedule-effective-to').value = '2026-01-01';
    await ui.probe.createSchedule({ preventDefault: () => {} });
    expect(ui.fetch).not.toHaveBeenCalled();
  });

  it('creates a draft from the UI and reads it back with no If-Match on the create', async () => {
    const ui = signedIn(TENANT_ADMIN_PERMISSION_KEYS);
    ui.element('#schedule-effective-from').value = '2026-01-01';
    ui.element('#schedule-effective-to').value = '2026-06-30';
    ui.fetch.mockResolvedValueOnce(etagResponse({ id: SCHEDULE_ID, revision: 1 }, '"schedule:11111111-1111-4111-8111-111111111111:v1"'));
    ui.fetch.mockResolvedValueOnce(etagResponse(readFor(), '"schedule:readbackhash"'));
    await ui.probe.createSchedule({ preventDefault: () => {} });

    const create = lastCallTo(ui, '/schedules/drafts');
    expect(create).toBeDefined();
    expect(create![1].method).toBe('POST');
    expect(create![1].headers?.['If-Match']).toBeUndefined();
    expect(JSON.parse(create![1].body ?? '{}')).toMatchObject({ branchId: 'DEMO', effectiveFrom: '2026-01-01', effectiveTo: '2026-06-30' });
    expect(ui.probe.state.scheduleId).toBe(SCHEDULE_ID);
    expect(ui.element('#schedule-status').innerHTML).toContain('Taslak program');
  });
});

describe('#450 haftalık program — yayınlanmış salt-okur görünüm', () => {
  it('teacher persona loads only the published own projection, with no draft endpoints', async () => {
    const ui = signedIn(TEACHER_PERMISSION_KEYS, 'Referans Şube · DEMO');
    ui.fetch.mockResolvedValueOnce(response([summaryFor({ status: 'published', projection: 'published_own', gridState: 'weekly_grid_ready_published', readOnly: true, revision: 2, version: { scheduleVersionId: 'v1', versionNo: 1, status: 'published', publishedAt: '2026-11-17T09:00:00.000Z' }, eventCount: 1 })]));
    ui.fetch.mockResolvedValueOnce(etagResponse(
      readFor({ status: 'published', projection: 'published_own', gridState: 'weekly_grid_ready_published', readOnly: true, revision: 2, version: { scheduleVersionId: 'v1', versionNo: 1, status: 'published', publishedAt: '2026-11-17T09:00:00.000Z' }, events: [eventFor()], eventCount: 1 }),
      '"schedule:publishedhash"',
    ));
    await ui.probe.loadProgramme();
    const urls = (ui.fetch.mock.calls as Array<[string]>).map(([url]) => String(url));
    expect(urls.some((url) => url.includes('/schedules/drafts'))).toBe(false);
    expect(ui.element('#schedule-status').innerHTML).toContain('Yayınlanmış program');
    expect(ui.element('#schedule-status').innerHTML).toContain('Salt okunur');
    expect(ui.element('#schedule-agenda').innerHTML).toContain('agenda-item');
    expect(ui.element('#schedule-editor').classList.contains('hidden')).toBe(true);
    expect(ui.element('#schedule-actions').innerHTML).not.toContain('new-schedule-draft'); // öğretmen taslak açamaz
    expect(ui.element('#schedule-gate').textContent).toContain('salt okunur');
    expect(ui.probe.state.scheduleRows).toEqual([]);
  });

  it('shows the programme picker only when more than one programme exists', async () => {
    const ui = signedIn(TENANT_ADMIN_PERMISSION_KEYS);
    const publishedSummary = summaryFor({
      scheduleId: '99999999-9999-4999-8999-999999999999',
      status: 'published', projection: 'published_branch', gridState: 'weekly_grid_ready_published',
      readOnly: true, revision: 3, version: { scheduleVersionId: 'v1', versionNo: 1, status: 'published', publishedAt: '2026-11-17T09:00:00.000Z' }, eventCount: 1,
    });
    ui.fetch.mockResolvedValueOnce(response([summaryFor()]));
    ui.fetch.mockResolvedValueOnce(response([publishedSummary]));
    ui.fetch.mockResolvedValueOnce(etagResponse(readFor(), '"schedule:readbackhash"'));
    await ui.probe.loadProgramme();
    const picker = ui.element('#schedule-programme-picker');
    expect(picker.classList.contains('hidden')).toBe(false);
    const options = ui.element('#schedule-programme-select').innerHTML;
    expect(options).toContain(SCHEDULE_ID);
    expect(options).toContain('99999999-9999-4999-8999-999999999999');
    expect(options).toContain('Taslak');
    expect(options).toContain('Yayınlandı');
  });
});
