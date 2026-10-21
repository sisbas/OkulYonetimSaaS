import * as fs from 'node:fs';
import * as path from 'node:path';
import { LEAVE_IMPACT_REASON_CODES } from '../../src/daily-operations/leave-impact.types';
import { CANONICAL_SCHEDULE_REASON_CODES } from '../../src/schedules/m3-schedule-contract';
import { ATTENDANCE_CORRECTION_REASON_CODES } from '../../src/attendance/attendance-correction';
import { LEAVE_REASON_CODES } from '../../src/leaves/leave-policy';
import { LeaveDecisionStatus, LeaveCoverageStatus } from '../../src/leaves/leave-request.entity';
import { runtime, response } from './runtime-harness';

const PROBE = 'state, renderLeaveCard, updateOperationalSnapshot, displayCanonical, displayLeaveReason, displayLeaveDuration, displayConsentType, displayStatus, normalizeApiError, loadCandidates';

const CONSENT_AND_NOTIFICATION_CODES = [
  'pending',
  'approved',
  'rejected',
  'revoked',
  'expired',
  'blocked_consent',
  'dispatched',
  'failed',
  'queued',
  'cancelled',
  'draft',
  'parent_notification',
  'sms_notification',
  'KVKK_CONSENT_REQUIRED',
];

const LEAVE_COPY_CODES = [
  ...(LEAVE_REASON_CODES as readonly string[]),
  'hourly',
  'full_day',
  'multi_day',
  ...(Object.values(LeaveDecisionStatus) as string[]),
  ...(Object.values(LeaveCoverageStatus) as string[]),
];

const BACKEND_IDENTIFIER_CODES: readonly string[] = [
  ...(LEAVE_IMPACT_REASON_CODES as readonly string[]),
  ...(CANONICAL_SCHEDULE_REASON_CODES as readonly string[]),
  ...(ATTENDANCE_CORRECTION_REASON_CODES as readonly string[]),
  ...LEAVE_COPY_CODES,
  ...CONSENT_AND_NOTIFICATION_CODES,
];

const LOOKUP_CONTEXT = /renderBlockingState\(|reasonUi\[|stateMessages\[|statusLabels\.|statusTones\[|uiStateTitles\[|statusStates\[|displayStatus\(|displayCanonical\(|statusTone\(|displayLeaveReason\(|displayLeaveDuration\(|displayConsentType\(|findReasonInMessage\(|looksLikeBackendCode\(|GENERIC_NEST_/;
const MAP_ENTRY = /^\s*[A-Za-z_$][\w$]*\s*:\s*[\['"`]/;
const COMMENT_LINE = /^\s*\/\//;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readRuntimeAsset(name: string): string {
  return fs.readFileSync(path.join(process.cwd(), 'frontend', 'runtime', name), 'utf8');
}

function executableLines(source: string): string[] {
  // Tanıma kümeleri (GENERIC_NEST_*) kopya seçimine girdir; kopya konumu değildir.
  const withoutRecognitionSets = source.replace(/GENERIC_NEST_\w+ = new Set\(\[[^\]]*\]\)/gs, '');
  return withoutRecognitionSets.split(/\r?\n/).filter((line) => !COMMENT_LINE.test(line));
}

/** app.js'te bir backend tanımlayıcısı yalnız kanonik harita anahtarı ya da harita araması olarak geçebilir. */
function copyHygieneViolations(lines: string[], codes: readonly string[]): string[] {
  const violations: string[] = [];
  for (const code of codes) {
    const pattern = new RegExp(`\\b${escapeRegExp(code)}\\b`);
    for (const line of lines) {
      if (!pattern.test(line)) continue;
      if (MAP_ENTRY.test(line) || LOOKUP_CONTEXT.test(line)) continue;
      violations.push(`backend identifier '${code}' outside a mapping position: ${line.trim().slice(0, 120)}`);
    }
  }
  return violations;
}

/** HTML'de yalnız kullanıcının gördüğü metin taranır; API'ye giden value="" öznitelikleri kopya değildir. */
function visibleHtmlText(html: string): string {
  const withoutTags = html.replace(/<[^>]*>/g, ' ');
  const ariaLabels = [...html.matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1]).join(' ');
  const placeholders = [...html.matchAll(/placeholder="([^"]*)"/g)].map((m) => m[1]).join(' ');
  return `${withoutTags} ${ariaLabels} ${placeholders}`;
}

describe('runtime copy hygiene (#446)', () => {
  describe('static check: no backend identifier literal in a rendered-copy position', () => {
    it('keeps every known backend code out of the runtime HTML surface', () => {
      const html = readRuntimeAsset('index.html');
      const visible = visibleHtmlText(html);
      const violations: string[] = [];
      for (const code of BACKEND_IDENTIFIER_CODES) {
        const pattern = new RegExp(`\\b${escapeRegExp(code)}\\b`);
        if (pattern.test(visible)) violations.push(`'${code}' reaches visible runtime HTML text`);
      }
      expect(violations).toEqual([]);
    });

    it('allows backend codes in app.js only as canonical map keys or copy-selecting lookups', () => {
      const app = readRuntimeAsset('app.js');
      const violations = copyHygieneViolations(executableLines(app), BACKEND_IDENTIFIER_CODES);
      expect(violations).toEqual([]);
    });

    it('keeps backend codes out of the stylesheet copy surface', () => {
      const css = readRuntimeAsset('styles.css');
      const violations: string[] = [];
      for (const code of BACKEND_IDENTIFIER_CODES) {
        const pattern = new RegExp(`\\b${escapeRegExp(code)}\\b`);
        if (pattern.test(css)) violations.push(`'${code}' appears in styles.css`);
      }
      expect(violations).toEqual([]);
    });
  });

  describe('leave cards resolve canonical Turkish copy', () => {
    it('renders leave state, duration, reason and coverage without echoing backend codes', () => {
      const ui = runtime(PROBE);
      ui.probe.state.activeLeaveEtag = 'etag-1';
      const card = ui.probe.renderLeaveCard({
        leaveRequestId: '9b2c1a5e-0000-0000-0000-000000000001',
        decisionStatus: 'pending',
        coverageStatus: 'partially_covered',
        durationType: 'full_day',
        reasonCode: 'annual_leave',
      }, 'Kendi izin talebiniz');
      expect(card).toContain('Kendi izin talebiniz');
      expect(card).toContain('Beklemede');
      expect(card).toContain('Kısmen karşılandı');
      expect(card).toContain('Tam gün izin');
      expect(card).toContain('Yıllık izin');
      expect(card).toMatch(/data-leave-id="/);
      expect(card).toMatch(/data-reason-code="annual_leave"/);
      for (const raw of ['decisionStatus', 'coverageStatus', 'durationType', 'reasonCode', 'pending', 'partially_covered', 'full_day']) {
        const textOnly = card.replace(/data-[a-z-]+="[^"]*"/g, '');
        expect(textOnly).not.toMatch(new RegExp(`\\b${escapeRegExp(raw)}\\b`));
      }
    });

    it('falls back to neutral copy when the server sends an unrecognised reason or duration', () => {
      const ui = runtime(PROBE);
      expect(ui.probe.displayLeaveReason({ reasonCode: 'brand_new_reason_code' })).toBe('Gerekçe bilgisi çözümlenemedi');
      expect(ui.probe.displayLeaveDuration('mid_day_split')).toBe('Süre bilgisi çözümlenemedi');
      expect(ui.probe.displayLeaveReason({ reasonCode: 'health', reasonLabel: 'Sağlık raporlu izin' })).toBe('Sağlık raporlu izin');
    });
  });

  describe('consent and notification statuses resolve canonical copy', () => {
    it('maps consent type, delivery and consent-blocked statuses to Turkish copy', () => {
      const ui = runtime(PROBE);
      expect(ui.probe.displayConsentType('parent_notification')).toBe('Veli bilgilendirme izni');
      expect(ui.probe.displayConsentType('sms_notification')).toBe('SMS bilgilendirme izni');
      expect(ui.probe.displayConsentType('unheard_of_type')).toBe('Bilgilendirme izni');
      expect(ui.probe.displayStatus('dispatched')).toBe('Gönderildi');
      expect(ui.probe.displayStatus('failed')).toBe('Gönderilemedi');
      expect(ui.probe.displayStatus('blocked_consent')).toBe('İletişim izni yok');
      expect(ui.probe.displayStatus('queued')).toBe('Onaylandı · gönderim bekliyor');
      expect(ui.probe.displayStatus('revoked')).toBe('İzin geri alınmış');
      expect(ui.probe.displayStatus('expired')).toBe('İznin süresi geçmiş');
    });
  });

  describe('summary cockpit keeps identifiers in diagnostics, not rendered copy', () => {
    it('shows a human label for the selected leave and keeps the id as data', () => {
      const ui = runtime(PROBE);
      ui.probe.state.activeLeaveId = '9b2c1a5e-0000-0000-0000-000000000001';
      ui.probe.updateOperationalSnapshot();
      const summary = ui.element('#summary-leave');
      expect(summary.textContent).toBe('Seçili izin talebi');
      expect(summary.dataset.leaveId).toBe('9b2c1a5e-0000-0000-0000-000000000001');
      expect(summary.textContent).not.toContain('9b2c1a5e');

      ui.probe.state.activeLeaveId = '';
      ui.probe.updateOperationalSnapshot();
      expect(summary.textContent).toBe('Talep seçilmedi');
      expect(summary.dataset.leaveId).toBeUndefined();
    });
  });

  describe('unrecognised server states never echo an identifier', () => {
    it('a code-like server message falls back to the canonical neutral message', () => {
      const ui = runtime(PROBE);
      const error = ui.probe.normalizeApiError(
        { status: 409 },
        { message: 'KVKK_CONSENT_REQUIRED', error: 'Conflict', statusCode: 409 },
      );
      expect(error.reasonCode).toBe('');
      expect(error.uiState).toBe('conflict_blocking');
      expect(error.message).not.toContain('KVKK_CONSENT_REQUIRED');
      expect(error.message).toMatch(/çakışıyor|güncel kaydı alıp/i);
    });

    it('a snake_case server message falls back instead of being echoed', () => {
      const ui = runtime(PROBE);
      const error = ui.probe.normalizeApiError(
        { status: 500 },
        { message: 'some_new_backend_code' },
      );
      expect(error.reasonCode).toBe('');
      expect(error.message).toBe('İşlem tamamlanamadı. Kısa süre sonra tekrar deneyin.');
    });

    it('a single-token backend enum is never echoed as copy', () => {
      const ui = runtime(PROBE);
      for (const code of ['failed', 'pending', 'health', 'approved', 'blocked_consent']) {
        const error = ui.probe.normalizeApiError({ status: 409 }, { message: code });
        expect(error.reasonCode).toBe('');
        expect(error.message).not.toBe(code);
        expect(error.message).not.toMatch(new RegExp(`\\b${code}\\b`));
        expect(error.message.length).toBeGreaterThan(10);
      }
    });

    it('a human server message is preserved while known codes keep their own copy', () => {
      const ui = runtime(PROBE);
      const human = ui.probe.normalizeApiError(
        { status: 409 },
        { message: 'Karar reddi başarısız: LEAVE_VERSION_MISMATCH', error: 'Conflict', statusCode: 409 },
      );
      expect(human.message).toContain('güncel sürümü yükleyip');

      const freeText = ui.probe.normalizeApiError(
        { status: 422 },
        { message: 'Yoklama oturumu bu saatte kapatılamaz.' },
      );
      expect(freeText.message).toBe('Yoklama oturumu bu saatte kapatılamaz.');
    });
  });

  describe('rendered copy over driven flows stays clean', () => {
    it('an error path through loadCandidates renders canonical copy only', async () => {
      const ui = runtime(PROBE);
      ui.probe.state.accessToken = 'token';
      ui.probe.state.activeLeaveId = 'leave-1';
      ui.probe.state.activeScheduleEventId = 'event-1';
      ui.fetch.mockResolvedValueOnce(response({ message: 'ASSIGNMENT_ALREADY_EXISTS', error: 'Conflict', statusCode: 409 }, 409));
      await ui.probe.loadCandidates('event-1');
      const rendered = ui.renderedStrings();
      expect(rendered).toContain('aktif bir görevlendirme');
      expect(rendered).not.toContain('ASSIGNMENT_ALREADY_EXISTS');
    });
  });
});
