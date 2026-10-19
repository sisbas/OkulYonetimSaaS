import * as fs from 'node:fs';
import * as path from 'node:path';
import { runtime, response } from './runtime-harness';

const PROBE =
  'state, applyCatalog, login, updateContext, apiRequest, loadQueue, loadLeaves, loadConsents, loadNotifications, openNotificationDetail, validateSchedule';

/** Yalnızca görünen metin: öznitelik değerleri (tanılama için tutulan kimlikler) hariç. */
function renderedText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** `escapeHtml(` çağrısının gerçek argümanını parantez dengesiyle çıkarır. */
function balancedArgument(source: string, openIndex: number): string {
  const start = openIndex + 'escapeHtml('.length;
  let depth = 1;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === '(') depth += 1;
    else if (source[i] === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i);
    }
  }
  return source.slice(start, start + 200);
}

function signedIn() {
  const ui = runtime(PROBE);
  ui.probe.state.accessToken = 'token';
  ui.probe.state.branchId = 'ANKARA';
  return ui;
}

const STAMP = '2026-10-01T10:00:00.000Z';

describe('#446 copy hygiene', () => {
  describe('leave cards', () => {
    it('shows a human reason and duration instead of the backend codes', async () => {
      const ui = signedIn();
      ui.fetch.mockResolvedValueOnce(
        response({
          leaves: [
            {
              id: 'l1',
              decisionStatus: 'pending',
              coverageStatus: 'uncovered',
              reasonCode: 'health',
              durationType: 'full_day',
              etag: 'e1',
              createdAt: STAMP,
            },
          ],
        }),
      );
      await ui.probe.loadLeaves();
      const text = renderedText(ui.element('#leaves-output').innerHTML);
      expect(text).toContain('Sağlık izni');
      expect(text).toContain('Tam gün');
      expect(text).not.toContain('health');
      expect(text).not.toContain('full_day');
      expect(text).not.toContain('uncovered');
      expect(text).not.toContain('pending');
      expect(ui.element('#leaves-output').innerHTML).toContain('data-reason-code="health"');
    });

    it('falls back to a neutral phrase for a reason code the map does not know', async () => {
      const ui = signedIn();
      ui.fetch.mockResolvedValueOnce(
        response({ leaves: [{ id: 'l1', decisionStatus: 'pending', reasonCode: 'annual_leave_v2', etag: 'e1' }] }),
      );
      await ui.probe.loadLeaves();
      const text = renderedText(ui.element('#leaves-output').innerHTML);
      expect(text).not.toContain('annual_leave_v2');
      expect(text).toMatch(/Belirtilmemiş/i);
    });
  });

  describe('consent cards', () => {
    it('shows a human consent type and subject instead of the backend codes', async () => {
      const ui = signedIn();
      ui.fetch.mockResolvedValueOnce(
        response({
          consents: [
            {
              id: 'c1',
              subjectType: 'student',
              subjectRefId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
              consentType: 'parent_notification',
              status: 'approved',
              version: 2,
              legalBasis: 'consent',
              retentionDays: 3650,
              createdAt: STAMP,
            },
          ],
        }),
      );
      await ui.probe.loadConsents();
      const html = ui.element('#consents-output').innerHTML;
      const text = renderedText(html);
      expect(text).toContain('Veli bilgilendirmesi');
      expect(text).toContain('Öğrenci');
      expect(text).not.toContain('parent_notification');
      expect(text).not.toContain('student');
      expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
      expect(html).toContain('data-consent-type="parent_notification"');
    });
  });

  describe('notification cards and receipts', () => {
    it('shows a human event name and channel instead of the backend identifiers', async () => {
      const ui = signedIn();
      ui.fetch.mockResolvedValueOnce(
        response({
          notifications: [
            {
              id: 'n1',
              eventType: 'attendance.absent.locked',
              channel: 'sms',
              status: 'delivered',
              attempts: 1,
              createdAt: STAMP,
            },
          ],
        }),
      );
      await ui.probe.loadNotifications();
      const text = renderedText(ui.element('#notifications-list').innerHTML);
      expect(text).toContain('Devamsızlık bildirimi');
      expect(text).toContain('SMS');
      expect(text).not.toContain('attendance.absent.locked');
    });

    it('shows a human dispatch outcome and keeps provider references out of the copy', async () => {
      const ui = signedIn();
      ui.probe.state.activeNotificationId = 'n1';
      ui.fetch.mockResolvedValueOnce(
        response({
          row: {
            id: 'n1',
            eventType: 'attendance.absent.locked',
            channel: 'sms',
            status: 'delivered',
            version: 2,
            attempts: 1,
            reason: 'blocked_consent',
            createdAt: STAMP,
          },
          availableActions: [],
          receipts: [
            {
              attempt: 1,
              outcome: 'provider_delivered',
              createdAt: STAMP,
              providerRef: 'sim:9f3ac1',
              simulated: true,
              errorCode: 'SIMULATED_REJECTION',
            },
          ],
        }),
      );
      await ui.probe.openNotificationDetail('n1');
      const html = ui.element('#notification-detail').innerHTML;
      const text = renderedText(html);
      expect(text).toContain('Sağlayıcı teslim etti');
      expect(text).toContain('simüle');
      expect(text).not.toContain('provider_delivered');
      expect(text).not.toContain('sim:9f3ac1');
      expect(text).not.toContain('SIMULATED_REJECTION');
      expect(text).not.toContain('blocked_consent');
      expect(text).not.toContain('attendance.absent.locked');
      expect(html).toContain('data-provider-outcome="provider_delivered"');
      expect(html).toContain('data-provider-ref="sim:9f3ac1"');
      expect(html).toContain('data-receipt-error="SIMULATED_REJECTION"');
    });

    it('never writes a missing dispatch outcome into the diagnostics channel', async () => {
      const ui = signedIn();
      ui.probe.state.activeNotificationId = 'n1';
      ui.fetch.mockResolvedValueOnce(
        response({
          row: { id: 'n1', eventType: 'attendance.absent.locked', status: 'dispatched', version: 1 },
          availableActions: [],
          receipts: [{ attempt: 1, createdAt: STAMP, simulated: true }],
        }),
      );
      await ui.probe.openNotificationDetail('n1');
      const html = ui.element('#notification-detail').innerHTML;
      expect(html).toContain('data-provider-outcome=""');
      expect(renderedText(html)).not.toMatch(/undefined|null/);
      expect(renderedText(html)).toContain('Sonuç okunamadı');
    });
  });

  describe('internal identifiers stay available to diagnostics', () => {
    it('keeps the notification identifier on the control that needs it', async () => {
      const ui = signedIn();
      ui.fetch.mockResolvedValueOnce(
        response({ notifications: [{ id: 'n1', eventType: 'attendance.absent.locked', status: 'pending', attempts: 0 }] }),
      );
      await ui.probe.loadNotifications();
      const html = ui.element('#notifications-list').innerHTML;
      expect(html).toContain('data-notification-id="n1"');
      expect(renderedText(html)).not.toContain('n1');
    });
  });

  describe('schedule validation findings', () => {
    const CANONICAL_CODES = [
      'TEACHER_TIME_OVERLAP',
      'STUDENT_GROUP_TIME_OVERLAP',
      'ROOM_TIME_OVERLAP',
      'TIMESLOT_INACTIVE',
      'TEACHER_INACTIVE',
      'STUDENT_GROUP_INACTIVE',
      'TEACHER_BRANCH_ASSIGNMENT_MISSING',
      'TEACHER_COURSE_MISMATCH',
      'TENANT_REFERENCE_MISMATCH',
      'BRANCH_REFERENCE_MISMATCH',
      'PUBLISHED_SCHEDULE_IMMUTABLE',
      'SCHEDULE_EMPTY',
      'SCHEDULE_VALIDATION_STALE',
      'SCHEDULE_HARD_CONFLICTS_PRESENT',
      'PUBLISHED_SCHEDULE_PERIOD_CONFLICT',
      'SCHEDULE_VERSION_MISMATCH',
      'SCHEDULE_VERSION_REQUIRED',
    ];

    it('renders every canonical finding in human copy, never the raw code', async () => {
      const ui = signedIn();
      ui.probe.state.scheduleId = 'sch-1';
      ui.probe.state.scheduleRevision = 1;
      ui.fetch.mockResolvedValueOnce(
        response({
          status: 'invalid',
          canPublish: false,
          hardConflictCount: 3,
          reasons: CANONICAL_CODES.map((code) => ({ code })),
        }),
      );
      await ui.probe.validateSchedule({ preventDefault: () => {} });
      const html = ui.element('#schedule-status').innerHTML;
      const text = renderedText(html);
      for (const code of CANONICAL_CODES) {
        expect(text).not.toContain(code);
        expect(html).toContain(`data-schedule-reason="${code}"`);
      }
      expect(text).toContain('Öğretmenin aynı saatte başka dersi var');
      expect(text).toContain('Programda ders yok');
    });
  });

  describe('static copy-hygiene guard', () => {
    const runtimeDir = path.join(process.cwd(), 'frontend', 'runtime');
    const sources = [
      fs.readFileSync(path.join(runtimeDir, 'app.js'), 'utf8'),
      ...['decisions', 'consents', 'notifications', 'schedule', 'attendance'].map((name) =>
        fs.readFileSync(path.join(runtimeDir, 'screens', `${name}.js`), 'utf8'),
      ),
    ];
const GOVERNED = [
      'reasonCode',
      'reason',
      'consentType',
      'subjectType',
      'eventType',
      'channel',
      'outcome',
      'errorCode',
      'providerRef',
      'studentId',
    ];
    const MAPPERS = ['displayTerm(', 'displayStatus('];

    // A governed identifier may reach rendered copy only through a display
    // mapper. Raw `escapeHtml(field)`, `escapeHtml(pick(x, ['field']))` and any
    // concatenation are violations. A `data-*` attribute is the diagnostics
    // channel, not rendered copy, so those call sites are exempt.
    it('lets a governed identifier reach copy only through a display mapper', () => {
      const offenders: string[] = [];
      for (const source of sources) {
        for (const escape of source.matchAll(/escapeHtml\(/g)) {
          const index = escape.index ?? 0;
          const before = source.slice(Math.max(0, index - 48), index);
          if (/data-[\w-]*="\$\{\s*$/.test(before)) continue;
          const argument = balancedArgument(source, index);
          if (MAPPERS.some((mapper) => argument.includes(mapper))) continue;
          for (const field of GOVERNED) {
            if (new RegExp(`\\b${field}\\b`).test(argument)) {
              offenders.push(`${escape[0]}${argument.slice(0, 56)} (${field})`);
            }
          }
        }
      }
      expect(offenders).toEqual([]);
    });
  });
});
