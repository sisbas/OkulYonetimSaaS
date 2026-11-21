import * as fs from 'node:fs';
import * as path from 'node:path';

import { runtime, TENANT_ADMIN_PERMISSION_KEYS } from './runtime-harness';

/**
 * #453 — yayın kapısı dört ayrı kapalı durum taşır ve kanıt kartı yayın
 * kontrolü göründüğü her durumda ekrandadır. Düzenleme son kanıtı geçersiz
 * işaretler, sessizce silmez.
 */

const PROBE =
  'state, renderProgramme, renderGate, renderScheduleActions, addScheduleEvent, validateSchedule, publishSchedule, canPublishNow';

const SCHEDULE_ID = '11111111-1111-4111-8111-111111111111';
const UUIDS = {
  teacherId: '22222222-2222-4222-8222-222222222221',
  teacherBranchId: '33333333-3333-4333-8333-333333333331',
  studentGroupId: '44444444-4444-4444-8444-444444444441',
  courseId: '55555555-5555-4555-8555-555555555551',
  roomId: '66666666-6666-4666-8666-666666666661',
  timeSlotId: '77777777-7777-4777-8777-777777777771',
};

const eventFor = (over: Record<string, unknown> = {}) => ({
  eventId: 'ev-1', ...UUIDS, dayOfWeek: 1, startTime: '09:00', endTime: '09:40', ...over,
});

const readFor = (over: Record<string, unknown> = {}) => ({
  contractId: 'M3_CONTRACT_V2',
  contractVersion: '2.0.0',
  scheduleId: SCHEDULE_ID,
  branchId: '88888888-8888-4888-8888-888888888888',
  status: 'draft',
  projection: 'management_draft',
  gridState: 'weekly_grid_ready_draft',
  readOnly: false,
  revision: 2,
  effectiveFrom: '2026-09-01',
  effectiveTo: '2026-12-20',
  version: {
    scheduleVersionId: 'v1', versionNo: 1, status: 'draft', publishedAt: null,
    validationMode: 'FULL', validationFingerprint: 'fp-from-read', validatedRevision: 2,
  },
  eventCount: 1,
  events: [eventFor()],
  ...over,
});

const evidenceFor = (over: Record<string, unknown> = {}) => ({
  mode: 'FULL',
  evidenceStatus: 'authoritative',
  status: 'invalid',
  canPublish: false,
  hardConflictCount: 1,
  scheduleRevision: 2,
  inputFingerprint: 'fp-current',
  reasons: [{ code: 'TEACHER_TIME_OVERLAP' }],
  ...over,
});

function signedIn(overrides: Record<string, unknown> = {}) {
  const ui = runtime(PROBE, TENANT_ADMIN_PERMISSION_KEYS);
  ui.probe.state.accessToken = 'token';
  ui.probe.state.branchId = 'ANKARA';
  ui.probe.state.scheduleId = SCHEDULE_ID;
  ui.probe.state.scheduleRevision = 2;
  ui.probe.state.scheduleIfMatch = `"schedule:${SCHEDULE_ID}:v2"`;
  ui.probe.state.scheduleRead = readFor();
  ui.probe.state.scheduleEvents = ui.probe.state.scheduleRead.events;
  ui.probe.state.scheduleBaseline = JSON.stringify(ui.probe.state.scheduleEvents.map((ev: unknown) => ev));
  ui.probe.state.scheduleEvidence = null;
  ui.probe.state.scheduleEvidenceInvalidated = false;
  Object.assign(ui.probe.state, overrides);
  return ui;
}

const gate = (ui: ReturnType<typeof signedIn>) => ui.element('#schedule-gate');
const summary = (ui: ReturnType<typeof signedIn>) => ui.element('#schedule-validation-summary');

describe('#453 yayın kapısı ve kanıt kartı', () => {
  it('yayın kontrolü göründüğünde kanıt yoksa da kart görünür', () => {
    const ui = signedIn();
    ui.probe.renderProgramme();

    expect(ui.element('#schedule-actions').innerHTML).toContain('publish-schedule');
    expect(summary(ui).hidden).toBe(false);
    expect(String(summary(ui).dataset.mode)).toBe('FULL');
    expect(String(summary(ui).dataset.publishability)).toBe('not_evidence');
    expect(summary(ui).innerHTML).toContain('Kanıt parmak izi');
    expect(summary(ui).innerHTML).toContain('fp-from-read');
    expect(String(gate(ui).dataset.gateState)).toBe('closed_stale');
  });

  it('dört kapalı kapı ayrı metin ve ayrı gate durumu üretir', () => {
    const cases: Array<[string, unknown, string]> = [
      ['empty', null, 'closed_empty'],
      ['stale', evidenceFor({ scheduleRevision: 1 }), 'closed_stale'],
      ['conflicts', evidenceFor(), 'closed_conflicts'],
      ['period', evidenceFor({
        reasons: [{ code: 'PUBLISHED_SCHEDULE_PERIOD_CONFLICT' }],
        hardConflictCount: 0,
      }), 'closed_period'],
    ];
    const texts = new Set<string>();
    for (const [name, evidence, expected] of cases) {
      const ui = signedIn();
      if (name === 'empty') {
        ui.probe.state.scheduleEvents = [];
        ui.probe.state.scheduleRows = [];
        ui.probe.state.scheduleBaseline = '[]';
      } else {
        ui.probe.state.scheduleEvidence = evidence;
      }
      ui.probe.renderProgramme();
      expect(String(gate(ui).dataset.gateState)).toBe(expected);
      expect(gate(ui).textContent.length).toBeGreaterThan(10);
      expect(ui.element('#schedule-actions').innerHTML).toContain('disabled');
      texts.add(gate(ui).textContent);
      expect(summary(ui).hidden).toBe(false);
    }
    expect(texts.size).toBe(4);
  });

  it('düzenleme kanıtı geçersiz işaretler, silmez ve yayını kapalı tutar', () => {
    const ui = signedIn();
    ui.probe.state.scheduleEvidence = evidenceFor({ canPublish: true, hardConflictCount: 0, reasons: [] });
    ui.probe.renderProgramme();
    expect(ui.probe.canPublishNow()).toBe(true);
    expect(String(gate(ui).dataset.gateState)).toBe('ready');

    ui.probe.addScheduleEvent();
    // Yeni satır kaydedilmiş gibi kabul edilirse tek neden kanıt geçersizliğidir.
    ui.probe.state.scheduleDirty = false;
    ui.probe.renderProgramme();

    expect(String(summary(ui).dataset.invalidated)).toBe('true');
    expect(summary(ui).innerHTML).toContain('geçersiz');
    expect(summary(ui).innerHTML).toContain('fp-current');
    expect(ui.probe.state.scheduleEvidence).not.toBeNull();
    expect(ui.probe.canPublishNow()).toBe(false);
    expect(ui.element('#schedule-actions').innerHTML).toContain('disabled');
    expect(String(gate(ui).dataset.gateState)).toBe('closed_stale');
  });

  it('sunucu neden kodları ayrı kanonik durumlara eşlenir', async () => {
    const cases: Array<[number, string, string, string]> = [
      [422, 'SCHEDULE_EMPTY', 'publish_blocked_empty', 'Program boş'],
      [422, 'SCHEDULE_VALIDATION_STALE', 'publish_blocked_stale', 'Doğrulama güncel değil'],
      [422, 'SCHEDULE_HARD_CONFLICTS_PRESENT', 'publish_blocked_conflicts', 'Çatışmalar çözülmemiş'],
      [409, 'PUBLISHED_SCHEDULE_PERIOD_CONFLICT', 'publish_blocked_period', 'Dönem çakışması'],
    ];
    for (const [status, code, expected, title] of cases) {
      const ui = signedIn();
      ui.probe.state.scheduleEvidence = evidenceFor({ canPublish: true, hardConflictCount: 0, reasons: [] });
      ui.probe.renderProgramme();
      ui.fetch.mockResolvedValue({
        ok: false,
        status,
        text: async () => JSON.stringify({ statusCode: status, code, message: `sunucu: ${code}` }),
        headers: { get: () => null },
      });
      await ui.probe.publishSchedule();
      const statusBox = ui.element('#schedule-status');
      expect(statusBox.dataset.state).toBe(expected);
      expect(statusBox.innerHTML).toContain(title);
    }
  });
});
