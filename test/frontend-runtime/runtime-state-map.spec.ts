import * as fs from 'node:fs';
import * as path from 'node:path';
import { LEAVE_IMPACT_REASON_CODES } from '../../src/daily-operations/leave-impact.types';
import { runtime, response } from './runtime-harness';

const PROBE = 'state, applyCatalog, login, updateContext, apiRequest, loadQueue, loadCandidates, normalizeApiError';

function readAppSource(): string {
  return fs.readFileSync(path.join(process.cwd(), 'frontend/runtime/app.js'), 'utf8');
}

describe('canonical UI-state map (#443)', () => {
  describe('server-authored reason codes', () => {
    it('maps a server conflict code to its own state and copy', () => {
      const ui = runtime(PROBE);
      const error = ui.probe.normalizeApiError(
        { status: 409 },
        { message: 'SUBSTITUTE_LEAVE_OVERLAP', error: 'Conflict', statusCode: 409 },
      );
      expect(error.reasonCode).toBe('SUBSTITUTE_LEAVE_OVERLAP');
      expect(error.uiState).toBe('conflict_blocking');
      expect(error.message).toContain('onaylı izni');
    });

    it('keeps a known 409 code readable while it is on conflict state', () => {
      const ui = runtime(PROBE);
      const error = ui.probe.normalizeApiError(
        { status: 409 },
        { message: 'ASSIGNMENT_ALREADY_EXISTS', error: 'Conflict', statusCode: 409 },
      );
      expect(error.reasonCode).toBe('ASSIGNMENT_ALREADY_EXISTS');
      expect(error.uiState).toBe('locked_state');
      expect(error.message).toContain('aktif bir görevlendirme');
    });

    it('resolves an unknown 409 to the neutral conflict state without substitute copy', () => {
      const ui = runtime(PROBE);
      const error = ui.probe.normalizeApiError(
        { status: 409 },
        { message: 'Plan satırı değişti', error: 'Conflict', statusCode: 409 },
      );
      expect(error.reasonCode).toBe('');
      expect(error.uiState).toBe('conflict_blocking');
      expect(error.message).toMatch(/çakışıyor|güncel kaydı alıp/i);
      expect(error.message).not.toContain('program veya yedek görev');
    });

    it('resolves a notification-style stale-version conflict to the stale state', () => {
      const ui = runtime(PROBE);
      const error = ui.probe.normalizeApiError(
        { status: 409 },
        { message: 'Karar reddi başarısız: LEAVE_VERSION_MISMATCH', error: 'Conflict', statusCode: 409 },
      );
      expect(error.reasonCode).toBe('LEAVE_VERSION_MISMATCH');
      expect(error.uiState).toBe('stale_version');
      expect(error.message).toContain('güncel sürümü yükleyip');
      expect(error.message).not.toContain('onaylı izni');
    });

    it('resolves a 424 impact-not-ready and 428 version-required by status alone', () => {
      const ui = runtime(PROBE);
      const notReady = ui.probe.normalizeApiError(
        { status: 424 },
        { message: 'Eligibility authority not ready', error: 'Failed Precondition' },
      );
      expect(notReady.reasonCode).toBe('');
      expect(notReady.uiState).toBe('eligibility_not_ready');

      const versionRequired = ui.probe.normalizeApiError(
        { status: 428 },
        { message: 'If-Match header required', error: 'Precondition Required' },
      );
      expect(versionRequired.reasonCode).toBe('');
      expect(versionRequired.uiState).toBe('version_required');
    });

    it('never mints a code the server did not send', () => {
      const ui = runtime(PROBE);
      const cases: Array<[{ status: number }, { message?: string; error?: string }]> = [
        [{ status: 404 }, { message: 'Kayıt bulunamadı', error: 'Not Found' }],
        [{ status: 403 }, { message: 'Bu işlem için yetkiniz yok', error: 'Forbidden' }],
        [{ status: 401 }, { message: 'Oturum başlamış doğrulanamadı', error: 'Unauthorized' }],
        [{ status: 400 }, { message: 'Validation failed', error: 'Bad Request' }],
      ];
      for (const [responseArg, body] of cases) {
        const error = ui.probe.normalizeApiError(responseArg, body);
        expect(error.reasonCode).toBe('');
      }
    });

    it('keeps unknown transport and proxy messages behind the canonical copy', () => {
      const ui = runtime(PROBE);
      const proxy = ui.probe.normalizeApiError(
        { status: 502 },
        { message: '<html>Bad Gateway</html>' },
      );
      expect(proxy.message).not.toContain('Bad Gateway');
      expect(proxy.message).not.toContain('<');
      expect(proxy.uiState).toBe('error_retryable');

      const rateLimited = ui.probe.normalizeApiError(
        { status: 429 },
        { message: 'slow down please' },
      );
      expect(rateLimited.uiState).toBe('rate_limited');
      expect(rateLimited.message).not.toContain('slow down');
    });
  });

  describe('branch selection state', () => {
    it('renders the non-enumerating forbidden state for a 404 without minting a code', async () => {
      const ui = runtime(PROBE);
      ui.probe.state.accessToken = 'token';
      ui.probe.applyCatalog({ role: { label: 'Operasyon Yöneticisi' }, branches: [{ name: 'Merkez', code: 'ANKARA' }] });
      ui.element('#branch-id').value = 'ANKARA';
      ui.fetch.mockResolvedValueOnce(response({ message: 'Kayıt bulunamadı' }, 404));
      await ui.probe.updateContext({ preventDefault: () => {} });
      const output = ui.element('#queue-output').innerHTML;
      expect(output).toContain('forbidden_non_enumerating');
      expect(output).not.toContain('BRANCH_NOT_VISIBLE');
      expect(output).toMatch(/yetkiniz yok|görüntülenemiyor/i);
      expect(ui.probe.state.branchId).toBe('');
    });
  });

  describe('rate-limited retry gate', () => {
    it('renders the rate-limited state and blocks repeated actions for a short while', async () => {
      const ui = runtime(PROBE);
      ui.probe.state.accessToken = 'token';
      ui.probe.state.branchId = 'ANKARA';
      ui.fetch.mockResolvedValueOnce(response({}, 429));
      await ui.probe.loadQueue();
      const output = ui.element('#queue-output').innerHTML;
      expect(output).toContain('rate_limited');
      expect(output).toMatch(/bekleyip yeniden deneyin/i);

      const attempts = ui.fetch.mock.calls.length;
      await ui.probe.loadQueue();
      expect(ui.fetch.mock.calls.length).toBe(attempts);

      ui.probe.state.rateLimitedUntil = 0;
      await ui.probe.loadQueue();
      expect(ui.fetch.mock.calls.length).toBe(attempts + 1);
    });
  });

  describe('eligibility source readiness', () => {
    it('never renders an empty candidate list when the eligibility source is not final', async () => {
      const ui = runtime(PROBE);
      ui.probe.state.accessToken = 'token';
      ui.probe.state.activeLeaveId = 'leave-1';
      ui.probe.state.activeScheduleEventId = 'event-1';
      ui.fetch.mockResolvedValueOnce(response({ candidates: [] }));
      await ui.probe.loadCandidates('event-1', 'Matematik');
      const output = ui.element('#candidate-output').innerHTML;
      expect(output).toContain('error-state');
      expect(output).not.toContain('empty-state');
      expect(output).toMatch(/uygunluk/i);
    });
  });

  describe('map completeness', () => {
    it('defines a UI state for every backend reason code', () => {
      const app = readAppSource();
      for (const code of LEAVE_IMPACT_REASON_CODES) {
        expect(app).toMatch(new RegExp(`^\\s*${code}: \\[`, 'm'));
      }
    });

    it('defines canonical states for the observable HTTP statuses', () => {
      const app = readAppSource();
      for (const uiState of [
        'offline_or_unavailable',
        'auth_required',
        'forbidden_non_enumerating',
        'empty_or_not_found_same_scope',
        'conflict_blocking',
        'stale_version',
        'version_required',
        'eligibility_not_ready',
        'rate_limited',
      ]) {
        expect(app).toContain(`'${uiState}'`);
      }
    });

    it('removes the retired status-minted codes from the runtime', () => {
      const app = readAppSource();
      expect(app).not.toContain('SERVER_ERROR');
      expect(app).not.toContain('OFFLINE_OR_UNAVAILABLE');
      expect(app).not.toContain('VALIDATION_FAILED');
      expect(app).not.toContain('RESOURCE_NOT_VISIBLE');
      expect(app).not.toContain('AUTH_REQUIRED');
      expect(app).not.toContain('SUBSTITUTE_TIME_CONFLICT mint');
      expect(app).not.toMatch(/reasonCode = *'[A-Z_]+'/);
    });
  });
});
