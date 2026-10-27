import * as fs from 'node:fs';
import * as path from 'node:path';

import { LEAVE_IMPACT_REASON_CODES } from '../../src/daily-operations/leave-impact.types';
import { CANONICAL_SCHEDULE_REASON_CODES } from '../../src/schedules/m3-schedule-contract';
import { ATTENDANCE_CORRECTION_REASON_CODES } from '../../src/attendance/attendance-correction';
import { LEAVE_REASON_CODES } from '../../src/leaves/leave-policy';
import { LeaveDecisionStatus, LeaveCoverageStatus } from '../../src/leaves/leave-request.entity';

/**
 * #446 — kopya hijyeni için STATİK sızıntı taraması.
 *
 * Davranış testleri main'deki `runtime-copy-hygiene.spec.ts` içinde. Bu spec
 * onları tamamlar: backend tanımlayıcıları görünür HTML metnine, styles.css'e
 * veya app.js'in kopya konumlarına sızmamalıdır. Amaç, yeni bir ekran/kopya
 * eklendiğinde ham enum/kod sızıntısını erken yakalamaktır.
 */
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
  // 'draft' ve 'parent_notification' aynı zamanda izin anahtarlarının parçası
  // (schedule:draft:create, parent_notification:send); statik tarama bunları
  // kopya sızıntısından ayıramaz. Davranış testleri kopyayı ayrıca doğrular.
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

const LOOKUP_CONTEXT =
  /renderBlockingState\(|reasonUi\[|stateMessages\[|statusLabels\.|statusTones\[|uiStateTitles\[|statusStates\[|displayStatus\(|displayTerm\(|displayCanonical\(|statusTone\(|findReasonInMessage\(|looksLikeBackendCode\(|GENERIC_NEST_/;
const MAP_ENTRY = /^\s*[A-Za-z_$][\w$]*\s*:\s*[\[{'"`]/;
const COMMENT_LINE = /^\s*\/\//;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readRuntimeAsset(name: string): string {
  return fs.readFileSync(path.join(process.cwd(), 'frontend', 'runtime', name), 'utf8');
}

function executableLines(source: string): string[] {
  const withoutRecognitionSets = source.replace(/GENERIC_NEST_\w+ = new Set\(\[[^\]]*\]\)/gs, '');
  return withoutRecognitionSets.split(/\r?\n/).filter((line) => !COMMENT_LINE.test(line));
}

/** HTML'de yalnız kullanıcının gördüğü metin taranır; value="" API girdisidir. */
function visibleHtmlText(html: string): string {
  const withoutTags = html.replace(/<[^>]*>/g, ' ');
  const ariaLabels = [...html.matchAll(/aria-label="([^"]*)"/g)].map((match) => match[1]).join(' ');
  const placeholders = [...html.matchAll(/placeholder="([^"]*)"/g)].map((match) => match[1]).join(' ');
  return `${withoutTags} ${ariaLabels} ${placeholders}`;
}

describe('#446 copy hygiene static leakage guard', () => {
  it('keeps governed backend codes out of visible runtime HTML text', () => {
    const visible = visibleHtmlText(readRuntimeAsset('index.html'));
    const violations = BACKEND_IDENTIFIER_CODES.filter((code) =>
      new RegExp(`\\b${escapeRegExp(code)}\\b`).test(visible),
    );
    expect(violations).toEqual([]);
  });

  it('keeps governed backend codes out of the stylesheet', () => {
    const css = readRuntimeAsset('styles.css');
    const violations = BACKEND_IDENTIFIER_CODES.filter((code) =>
      new RegExp(`\\b${escapeRegExp(code)}\\b`).test(css),
    );
    expect(violations).toEqual([]);
  });

  it('allows backend codes in app.js only as map keys or copy-selecting lookups', () => {
    const lines = executableLines(readRuntimeAsset('app.js'));
    const violations: string[] = [];
    for (const code of BACKEND_IDENTIFIER_CODES) {
      const pattern = new RegExp(`\\b${escapeRegExp(code)}\\b`);
      for (const line of lines) {
        if (!pattern.test(line)) continue;
        if (MAP_ENTRY.test(line) || LOOKUP_CONTEXT.test(line)) continue;
        violations.push(`'${code}' outside a mapping position: ${line.trim().slice(0, 120)}`);
      }
    }
    expect(violations).toEqual([]);
  });
});
