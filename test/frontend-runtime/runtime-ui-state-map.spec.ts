import * as fs from 'node:fs';
import * as path from 'node:path';
import { runtime, response } from './runtime-harness';

const PROBE = 'state, applyCatalog, login, updateContext, apiRequest, loadQueue, loadCandidates, createAssignment, runNotificationAction, openNotificationDetail';

const catalog = { branches: [{ name: 'Merkez', code: 'ANKARA' }, { name: 'Merkez', code: 'IZMIR' }], activeBranch: null };

function signedIn() {
  const ui = runtime(PROBE);
  ui.probe.state.accessToken = 'token';
  ui.probe.state.branchId = 'ANKARA';
  return ui;
}

describe('#443 canonical UI-state map', () => {
  describe('branch selection', () => {
    it('maps a not-found branch selection straight to the forbidden state without deriving a code', async () => {
      const ui = signedIn();
      ui.probe.applyCatalog(catalog);
      ui.element('#branch-id').value = 'IZMIR';
      ui.fetch.mockResolvedValueOnce(response({ message: 'Kayıt bulunamadı' }, 404));
      await ui.probe.updateContext({ preventDefault: () => {} });
      const target = ui.element('#queue-output');
      expect(target.dataset.state).toBe('forbidden_non_enumerating');
      expect(target.innerHTML).toContain('Bu işlem için yetkiniz yok.');
      expect(target.innerHTML).not.toMatch(/IZMIR|Kayıt bulunamadı/);
    });

    it('keeps the forbidden state even when the server sends its cross-tenant code', async () => {
      const ui = signedIn();
      ui.probe.applyCatalog(catalog);
      ui.element('#branch-id').value = 'IZMIR';
      ui.fetch.mockResolvedValueOnce(
        response({ reasonCode: 'cross_tenant_or_unknown_resource', message: 'Kayıt bulunamadı' }, 404),
      );
      await ui.probe.updateContext({ preventDefault: () => {} });
      expect(ui.element('#queue-output').dataset.state).toBe('forbidden_non_enumerating');
    });
  });

  describe('unknown server codes never crash the runtime', () => {
    it('falls back to a canonical state for a code the map does not know', async () => {
      const ui = signedIn();
      ui.fetch.mockResolvedValueOnce(response({ reasonCode: 'SOME_FUTURE_CODE', message: 'Conflict' }, 409));
      const error = await ui.probe.apiRequest('/x', { versioned: false }).catch((caught: any) => caught);
      expect(error.uiState).toBe('conflict_blocking');
      expect(error.serverCode).toBe('SOME_FUTURE_CODE');
    });

    it('renders the detail region as ready once the record loads again', async () => {
      const ui = signedIn();
      ui.probe.state.activeNotificationId = 'n1';
      ui.probe.state.activeNotificationVersion = 0;
      ui.fetch.mockResolvedValueOnce(response({ message: 'Too Many Requests' }, 429));
      await ui.probe.runNotificationAction('approve');
      expect(ui.element('#notification-detail').dataset.state).toBe('rate_limited');
      ui.fetch.mockResolvedValue(
        response({ row: { id: 'n1', status: 'pending', version: 0 }, availableActions: ['approve'] }),
      );
      await ui.probe.openNotificationDetail('n1');
      expect(ui.element('#notification-detail').dataset.state).toBe('record_ready');
    });
  });

  describe('conflict codes each select their own copy', () => {
    it('never resolves an unrecognised 409 to the substitute-teacher conflict message', async () => {
      const ui = signedIn();
      ui.probe.state.activeLeaveId = 'leave-1';
      ui.probe.state.activeScheduleEventId = 'event-1';
      ui.probe.state.activeLeaveEtag = 'etag-1';
      ui.fetch.mockResolvedValueOnce(response({ message: 'Notification draft version conflict' }, 409));
      await ui.probe.apiRequest('/x').catch((error: any) => {
        expect(error.message).not.toMatch(/Görevlendirme mevcut program/);
      });
    });

    it('gives SUBSTITUTE_TIME_CONFLICT and SUBSTITUTE_LEAVE_OVERLAP distinct copy', async () => {
      const ui = signedIn();
      ui.fetch.mockResolvedValueOnce(response({ message: 'SUBSTITUTE_TIME_CONFLICT:event-1' }, 409));
      const time = await ui.probe.apiRequest('/x').catch((error: any) => error);
      ui.fetch.mockResolvedValueOnce(response({ message: 'SUBSTITUTE_LEAVE_OVERLAP:event-1' }, 409));
      const leave = await ui.probe.apiRequest('/x').catch((error: any) => error);
      expect(time.uiState).toBe('conflict_blocking');
      expect(leave.uiState).toBe('conflict_blocking');
      expect(time.message).not.toBe(leave.message);
      expect(time.message).toBe('Görevlendirme mevcut program veya yedek görevle çakışıyor.');
      expect(leave.message).toBe('Seçilen öğretmenin aynı zamanda onaylı izni var.');
    });
  });

  describe('notification stale version', () => {
    it('renders the canonical stale state instead of the substitute-teacher conflict copy', async () => {
      const ui = signedIn();
      ui.probe.state.activeNotificationId = 'n1';
      ui.probe.state.activeNotificationVersion = 0;
      ui.fetch.mockResolvedValueOnce(
        response(
          { message: 'Notification draft version conflict, not found, or in invalid status', error: 'Conflict' },
          409,
        ),
      );
      ui.fetch.mockResolvedValue(response({ row: { id: 'n1', status: 'approved', version: 1 }, availableActions: [] }));
      await ui.probe.runNotificationAction('approve');
      const target = ui.element('#notification-detail');
      expect(target.innerHTML).toContain('data-state="stale_version"');
      expect(target.innerHTML).toContain('Kayıt güncellendi');
      expect(target.innerHTML).not.toMatch(/Görevlendirme mevcut program/);
    });
  });

  describe('states added to the map', () => {
    it('renders same-scope empty as its own state, distinct from forbidden', async () => {
      const ui = signedIn();
      ui.fetch.mockResolvedValueOnce(response({ items: [] }));
      await ui.probe.loadQueue();
      expect(ui.element('#queue-output').innerHTML).toContain('data-state="same_scope_empty"');
    });

    it('renders impact-not-ready for a dependency authority that is not ready', async () => {
      const ui = signedIn();
      ui.probe.state.activeLeaveId = 'leave-1';
      ui.probe.state.activeScheduleEventId = 'event-1';
      ui.fetch.mockResolvedValueOnce(
        response({ message: 'TeacherCourse eligibility authority is not ready' }, 424),
      );
      await ui.probe.loadCandidates('event-1', 'Matematik');
      const target = ui.element('#candidate-output');
      expect(target.innerHTML).toContain('data-state="impact_not_ready"');
      expect(target.innerHTML).not.toContain('empty-state');
    });

    it('renders a reachable locked state for an existing active assignment', async () => {
      const ui = signedIn();
      ui.probe.state.activeLeaveId = 'leave-1';
      ui.probe.state.activeScheduleEventId = 'event-1';
      ui.probe.state.activeLeaveEtag = 'etag-1';
      ui.fetch.mockResolvedValueOnce(response({ message: 'ASSIGNMENT_ALREADY_EXISTS:event-1' }, 409));
      await ui.probe.createAssignment('teacher-1');
      const target = ui.element('#candidate-output');
      expect(target.innerHTML).toContain('data-state="locked_state"');
      expect(target.innerHTML).toContain('Bu ders için aktif görevlendirme var.');
    });

    it('renders rate-limited rather than a retryable server error and disables the repeat action', async () => {
      const ui = signedIn();
      ui.probe.state.activeNotificationId = 'n1';
      ui.probe.state.activeNotificationVersion = 0;
      ui.fetch.mockResolvedValueOnce(response({ message: 'Too Many Requests', error: 'Too Many Requests' }, 429));
      await ui.probe.runNotificationAction('approve');
      expect(ui.element('#notification-detail').innerHTML).toContain('data-state="rate_limited"');

      ui.fetch.mockResolvedValue(
        response({ row: { id: 'n1', status: 'pending', version: 0 }, availableActions: ['approve'] }),
      );
      await ui.probe.openNotificationDetail('n1');
      expect(ui.element('#notification-detail').innerHTML).toMatch(/data-action="notification-run"[^>]*disabled/);

      ui.probe.state.rateLimitedUntil = 0;
      await ui.probe.openNotificationDetail('n1');
      expect(ui.element('#notification-detail').innerHTML).not.toMatch(/data-action="notification-run"[^>]*disabled/);
    });
  });

  describe('no client-minted reason codes', () => {
    it('reports an empty server code when the response carries none', async () => {
      const ui = signedIn();
      ui.fetch.mockResolvedValueOnce(response({ message: 'Conflict' }, 409));
      const error = await ui.probe.apiRequest('/x').catch((caught: any) => caught);
      expect(error.serverCode).toBe('');
      expect(error.uiState).toBe('conflict_blocking');
    });

    // The core classifies every failure through the two maps; none of the codes it
// used to derive locally survives anywhere in the runtime.
    it('keeps locally derived reason codes out of the runtime', () => {
      const runtimeDir = path.join(process.cwd(), 'frontend', 'runtime');
      const sources = [
        fs.readFileSync(path.join(runtimeDir, 'app.js'), 'utf8'),
        ...['decisions', 'consents', 'notifications', 'schedule', 'attendance'].map((name) =>
          fs.readFileSync(path.join(runtimeDir, 'screens', `${name}.js`), 'utf8'),
        ),
      ];
      const everything = sources.join('\n');
      expect(everything).toContain('SERVER_REASON_UI');
      expect(everything).toContain('HTTP_STATUS_UI_STATE');
      for (const invented of [
        'AUTH_REQUIRED',
        'FORBIDDEN',
        'RESOURCE_NOT_VISIBLE',
        'RESOURCE_NOT_FOUND_SAME_SCOPE',
        'VALIDATION_FAILED',
        'BRANCH_NOT_VISIBLE',
        'SERVER_ERROR',
        'OFFLINE_OR_UNAVAILABLE',
        'ATTENDANCE_SESSION_CONFLICT',
        'ATTENDANCE_OPTIMISTIC_CONFLICT',
        'NOTIFICATION_OUTBOX_SCOPE_REQUIRED',
        'NOTIFICATION_STATUS_FILTER_INVALID',
      ]) {
        expect(everything).not.toContain(invented);
      }
      expect(everything).not.toContain('reasonUi');
      expect(everything).not.toContain('uiStateTitles');
      for (const source of sources.slice(1)) {
        expect(source).not.toMatch(/renderBlockingState\(target, '[A-Z_]/);
      }
    });
  });
});