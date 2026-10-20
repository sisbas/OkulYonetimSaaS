import { runtime, response } from './runtime-harness';

const PROBE =
  'state, applyCatalog, login, updateContext, apiRequest, loadQueue, loadCandidates, loadLeaves, loadConsents, loadNotifications, renderError, handleNetworkError, loadAttendanceSessions, openAttendanceSession, loadImpact, renderScheduleStatus';

function signedIn() {
  const ui = runtime(PROBE);
  ui.probe.state.accessToken = 'token';
  ui.probe.state.branchId = 'ANKARA';
  return ui;
}

const STAMP = '2026-10-01T10:00:00.000Z';

describe('#444 shared region states', () => {
  describe('one shared path', () => {
    it('stamps the canonical state attribute on the region for empty, blocked and offline', async () => {
      const ui = signedIn();
      ui.fetch.mockResolvedValueOnce(response({ items: [] }));
      await ui.probe.loadQueue();
      expect(ui.element('#queue-output').dataset.state).toBe('same_scope_empty');

      const blocked = signedIn();
      blocked.fetch.mockResolvedValueOnce(response({ message: 'Too Many Requests' }, 429));
      await blocked.probe.loadQueue();
      expect(blocked.element('#queue-output').dataset.state).toBe('rate_limited');

      const offline = signedIn();
      offline.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      await offline.probe.loadQueue();
      expect(offline.element('#queue-output').dataset.state).toBe('offline_or_unavailable');
    });

    it('renders empty, blocked and offline through the same block renderer', async () => {
      const ui = signedIn();
      ui.fetch.mockResolvedValueOnce(response({ items: [] }));
      await ui.probe.loadQueue();
      const emptyHtml = ui.element('#queue-output').innerHTML;
      expect(emptyHtml).toContain('class="empty-state"');
      expect(emptyHtml).toContain('data-state="same_scope_empty"');

      const blocked = signedIn();
      blocked.fetch.mockResolvedValueOnce(response({ message: 'Too Many Requests' }, 429));
      await blocked.probe.loadQueue();
      const blockedHtml = blocked.element('#queue-output').innerHTML;
      expect(blockedHtml).toContain('class="error-state"');
      expect(blockedHtml).toContain('data-state="rate_limited"');
    });
  });

  describe('every area owns its empty state', () => {
    it('gives each area a distinct title instead of one unified empty screen', async () => {
      const areas: Array<[string, string, (ui: ReturnType<typeof signedIn>) => Promise<unknown>]> = [
        ['queue-output', 'Günlük iş listesi', (ui) => ui.probe.loadQueue()],
        ['candidate-output', 'Aday listesi', (ui) => { ui.probe.state.activeLeaveId = 'leave-1'; return ui.probe.loadCandidates('e1', 'Matematik'); }],
        ['leaves-output', 'İzin talebi', (ui) => ui.probe.loadLeaves()],
        ['consents-output', 'Onay kaydı', (ui) => ui.probe.loadConsents()],
        ['notifications-list', 'Bildirim', (ui) => ui.probe.loadNotifications()],
        ['attendance-sessions', 'Yoklama oturumu', (ui) => ui.probe.loadAttendanceSessions()],
      ];
      const titles = new Set<string>();
      for (const [region, expectedTitle, load] of areas) {
        const ui = signedIn();
        ui.fetch.mockResolvedValueOnce(response({ items: [], candidates: [], leaves: [], consents: [], notifications: [], sessions: [] }));
        await load(ui);
        const html = ui.element(`#${region}`).innerHTML;
        expect(html).toContain('data-state="same_scope_empty"');
        expect(html).toContain(expectedTitle);
        const match = html.match(/<strong>([^<]+)<\/strong>/);
        expect(match).not.toBeNull();
        titles.add(match![1]);
      }
      expect(titles.size).toBe(areas.length);
    });

    it('carries no action prompt inside an empty state', async () => {
      const ui = signedIn();
      ui.fetch.mockResolvedValueOnce(response({ items: [] }));
      await ui.probe.loadQueue();
      const html = ui.element('#queue-output').innerHTML;
      expect(html).not.toContain('<button');
      expect(html).not.toContain('data-action');
    });
  });

  describe('announced through the live region', () => {
    it('announces the empty state instead of swapping content silently', async () => {
      const ui = signedIn();
      ui.fetch.mockResolvedValueOnce(response({ items: [] }));
      await ui.probe.loadQueue();
      const live = ui.element('#message-region').innerHTML;
      expect(live).toContain('data-tone="neutral"');
      expect(live).toMatch(/Günlük iş listesi|açık ders yok/i);
    });

    it('announces a blocked state through the live region', async () => {
      const ui = signedIn();
      ui.fetch.mockResolvedValueOnce(response({ message: 'Too Many Requests' }, 429));
      await ui.probe.loadQueue();
      const live = ui.element('#message-region').innerHTML;
      expect(live).toContain('data-tone="warning"');
      expect(live).toMatch(/çok fazla istek|bekleyin/i);
    });
  });

  describe('empty reads differently from forbidden', () => {
    it('distinguishes genuinely empty same-scope data from a forbidden response', async () => {
      const empty = signedIn();
      empty.fetch.mockResolvedValueOnce(response({ items: [] }));
      await empty.probe.loadQueue();
      expect(empty.element('#queue-output').dataset.state).toBe('same_scope_empty');
      expect(empty.element('#queue-output').innerHTML).toContain('class="empty-state"');

      const forbidden = signedIn();
      forbidden.fetch.mockResolvedValueOnce(response({ message: 'Bu işlem için yetkiniz yok' }, 403));
      await forbidden.probe.loadQueue();
      expect(forbidden.element('#queue-output').dataset.state).toBe('forbidden_non_enumerating');
      expect(forbidden.element('#queue-output').innerHTML).toContain('class="error-state"');
    });
  });

  describe('no zero-valued panel', () => {
    it('does not render a zero count when an area has no data', async () => {
      const ui = signedIn();
      ui.fetch.mockResolvedValueOnce(response({ items: [] }));
      await ui.probe.loadQueue();
      const summary = ui.element('#summary-assignment').textContent;
      expect(summary).not.toMatch(/0 açık ders/);
      expect(summary).toMatch(/Henüz iş yok|seçilmedi/i);
    });

    it('resets stale counts when a different area is loaded', async () => {
      const ui = signedIn();
      ui.probe.state.activeLeaveId = 'leave-1';
      ui.probe.state.activeScheduleEventId = 'event-1';
      ui.fetch.mockResolvedValueOnce(response({ candidates: [{ teacherId: 't1', displayName: 'Ayşe' }] }));
      await ui.probe.loadCandidates('event-1', 'Matematik');
      expect(ui.element('#summary-assignment').textContent).toContain('1 aday');

      ui.fetch.mockResolvedValueOnce(response({ items: [] }));
      await ui.probe.loadQueue();
      const summary = ui.element('#summary-assignment').textContent;
      expect(summary).not.toMatch(/1 aday/);
      expect(summary).toMatch(/Henüz iş yok/);
    });

    it('does not render a zero roster count on the attendance detail', async () => {
      const ui = signedIn();
      ui.probe.state.activeAttendanceSessionId = 's1';
      ui.fetch.mockResolvedValueOnce(response({ id: 's1', status: 'draft', version: 1, rosterSnapshot: [] }));
      await ui.probe.openAttendanceSession('s1');
      const html = ui.element('#attendance-detail').innerHTML;
      expect(html).not.toMatch(/Öğrenci: 0/);
      expect(html).not.toMatch(/Roster: 0/);
      expect(html).toMatch(/Öğrenci yok|Roster boş/);
    });
  });

  describe('every empty area goes through the shared path', () => {
    it('renders the schedule empty state through the shared path', async () => {
      const ui = signedIn();
      ui.probe.state.scheduleId = '';
      ui.probe.renderScheduleStatus();
      const target = ui.element('#schedule-status');
      expect(target.dataset.state).toBe('same_scope_empty');
      expect(target.innerHTML).toContain('data-state="same_scope_empty"');
      expect(target.innerHTML).toContain('Çizelge yok');
    });

    it('renders the impact empty state through the shared path', async () => {
      const ui = signedIn();
      ui.probe.state.activeLeaveId = 'leave-1';
      ui.probe.state.activeScheduleEventId = 'event-1';
      ui.fetch.mockResolvedValueOnce(response({ coverageStatus: 'not_required', events: [] }));
      await ui.probe.loadImpact('leave-1', 'event-1');
      const target = ui.element('#impact-output');
      expect(target.dataset.state).toBe('same_scope_empty');
      expect(target.innerHTML).toContain('data-state="same_scope_empty"');
      expect(target.innerHTML).toContain('Etki yok');
    });
  });

  describe('empty state carries no action prompt', () => {
    it('omits the recovery hint from empty states', async () => {
      const ui = signedIn();
      ui.fetch.mockResolvedValueOnce(response({ items: [] }));
      await ui.probe.loadQueue();
      const html = ui.element('#queue-output').innerHTML;
      expect(html).not.toContain('recovery-hint');
      expect(html).not.toContain('Kapsamı değiştirip');
    });
  });
});