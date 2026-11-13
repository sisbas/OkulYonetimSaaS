import * as fs from 'node:fs';
import { runtime, response, ALL_PERMISSION_KEYS, OPS_PERMISSION_KEYS, TEACHER_PERMISSION_KEYS, VIEWER_PERMISSION_KEYS } from './runtime-harness';

/**
 * #489 — Bugün ekranı kod portu (mock-up bugun.html → runtime screens/bugun.js).
 *
 * Dışsal sözleşme pinlenir: istatistik şeridi (Açık iş / Karar bekleyen izin /
 * Bugünün oturumları), izin-projeksiyonu kuyruğu (K-47), ikincil bugün yoklama
 * oturumları (K-48/K-50), rol/aktör kesitleri ve tek durum yolu (renderRegionState,
 * K-40/K-41) + fail-closed izin kapısı (#445).
 */

const PROBE =
  'state, applyCatalog, login, updateContext, apiRequest, loadQueue, loadCandidates, loadLeaves, loadConsents, loadNotifications, renderError, handleNetworkError, loadAttendanceSessions, loadTodayDashboard, loadTodaySessions, openAttendanceSession, loadImpact, renderBugunQueueItem, renderBugunSessionCard, renderBugunKesit';

function signedIn(permissions = ALL_PERMISSION_KEYS) {
  const ui = runtime(PROBE, permissions);
  ui.probe.state.accessToken = 'token';
  ui.probe.state.branchId = 'ANKARA';
  return ui;
}

function todayResponse(items: unknown[]) {
  return response({ lessons: items });
}

function leavesResponse(leaves: unknown[]) {
  return response({ leaves });
}

function sessionsResponse(sessions: unknown[]) {
  return response({ sessions });
}

describe('#489 Bugün ekranı kod portu (mock-up bugun → runtime)', () => {
  const root = process.cwd();
  const runtimeDir = `${root}/frontend/runtime`;
  const screensDir = `${runtimeDir}/screens`;
  const designDir = `${root}/frontend/design`;

  const app = fs.readFileSync(`${runtimeDir}/app.js`, 'utf8');
  const html = fs.readFileSync(`${runtimeDir}/index.html`, 'utf8');
  const bugun = fs.readFileSync(`${screensDir}/bugun.js`, 'utf8');
  const mockup = fs.readFileSync(`${designDir}/bugun.html`, 'utf8');

  describe('statistik şeridi ve bölge isimleri', () => {
    it('bugun paneli istatistik + kuyruk + oturum + kesit bölgelerini taşır', () => {
      expect(html).toContain('id="bugun-panel"');
      expect(html).toContain('id="bugun-stats"');
      expect(html).toContain('id="bugun-open-work-value"');
      expect(html).toContain('id="bugun-awaiting-leave-value"');
      expect(html).toContain('id="bugun-sessions-open-value"');
      expect(html).toContain('id="bugun-queue-output"');
      expect(html).toContain('id="bugun-sessions-output"');
      expect(html).toContain('id="bugun-roles-output"');
      expect(html).toContain('id="bugun-refresh"');
      for (const metric of ['open-work', 'awaiting-leave', 'sessions-open']) {
        expect(html).toContain(`data-metric="${metric}"`);
      }
      expect(html).toContain('id="attendance-event-id"');
    });

    it('loadTodayDashboard statik sözleşmeleri taşır (canRequest + fail-closed)', () => {
      expect(bugun).toContain('async function loadTodayDashboard');
      expect(bugun).toContain("canRequest('GET', '/daily-operations/today')");
      expect(bugun).toContain("canRequest('GET', '/leaves')");
      expect(bugun).toContain("canRequest('GET', '/attendance/sessions')");
      expect(bugun).toContain('setBugunOpenWorkValue');
      expect(bugun).toContain('setBugunPendingLeaveValue');
      expect(bugun).toContain('setBugunSessionsValue');
      expect(bugun).toContain('await loadTodaySessions()');
      expect(bugun).toContain('updateWorkflowProgress()');
    });
  });

  describe('kanonik durum yolu (tek renderRegionState)', () => {
    it('bugun bölgelerinde hand-rolled hata/empty blok yok', () => {
      expect(bugun).toContain('function loadTodayDashboard');
      expect(bugun).toContain('renderRegionState');
      expect(bugun).toContain('empty(queueTarget');
      expect(bugun).toContain('renderError');
      expect(bugun).not.toContain("target.innerHTML = `<div class=\"error-state\"");
      expect(bugun).not.toContain("target.innerHTML = `<div class=\"empty-state\"");
    });
  });

  describe('durum kesitleri', () => {
    it('durum kesitleri renderRegionState üzerinden gelir (blocked/offline/empty)', () => {
      expect(bugun).toContain('renderRegionState');
      expect(bugun).toContain("forbidden_non_enumerating");
      expect(bugun).toContain("'Bugünün iş listesi için yetkiniz bulunmuyor.'");
      expect(bugun).toContain("'Günlük işler için şube seçin.'");
    });
  });

  describe('yolculuk: istatistik + kuyruk + oturumlar tek yükleme', () => {
    it('açık iş sayarını kapsam ve coverage durumuyla hesaplar', async () => {
      const ui = signedIn();
      ui.fetch.mockResolvedValueOnce(todayResponse([
        { courseLabel: 'Matematik', studentGroupLabel: '9-A', startsAt: '2026-11-08T09:40:00.000Z', endsAt: '2026-11-08T10:20:00.000Z', coverageStatus: 'unresolved', state: 'open', leaveRequestId: 'leave-1', scheduleEventId: 'event-1' },
        { courseLabel: 'Fen Bilimleri', studentGroupLabel: '11-C', startsAt: '2026-11-08T11:20:00.000Z', endsAt: '2026-11-08T12:00:00.000Z', coverageStatus: 'covered', state: 'covered', leaveRequestId: 'leave-2', scheduleEventId: 'event-2' },
      ]));
      ui.fetch.mockResolvedValueOnce(leavesResponse([{ id: 'l1', status: 'pending' }]));
      ui.fetch.mockResolvedValueOnce(sessionsResponse([{ id: 's1', status: 'draft', sessionDate: '2026-10-01T08:50:00.000Z', rosterSnapshot: [] }]));
      await ui.probe.loadTodayDashboard();

      expect(ui.element('#bugun-open-work-value').textContent).toBe('1');
      expect(ui.element('#bugun-awaiting-leave-value').textContent).toBe('1');
      expect(ui.element('#bugun-sessions-open-value').textContent).toBe('1');
      expect(ui.element('#bugun-queue-output').innerHTML).toContain('queue-card');
      expect(ui.element('#bugun-queue-output').innerHTML).toContain('Karşılık bekliyor');
      expect(ui.element('#bugun-queue-output').innerHTML).toContain('Henüz atanmadı');
      expect(ui.element('#bugun-queue-output').innerHTML).toContain('09:40 - 10:20');
      expect(ui.element('#bugun-sessions-output').innerHTML).toContain('data-attendance-state="open"');
      expect(ui.element('#bugun-roles-output').innerHTML).toContain('Günlük işler');
    });
  });

  describe('boş kapsam: tek yoldan empty state', () => {
    it('açık iş listesi boşsa aynı renderRegionState yolundan empty döner', async () => {
      const ui = signedIn();
      ui.fetch.mockResolvedValueOnce(todayResponse([]));
      ui.fetch.mockResolvedValueOnce(leavesResponse([]));
      ui.fetch.mockResolvedValueOnce(sessionsResponse([]));
      await ui.probe.loadTodayDashboard();
      expect(ui.element('#bugun-queue-output').dataset.state).toBe('same_scope_empty');
      expect(ui.element('#bugun-queue-output').innerHTML).toContain('Günlük iş listesi boş');
      expect(ui.element('#bugun-open-work-value').textContent).toBe('0');
    });
  });

  describe('fail-closed: yetki olmadan kuyruk bölmü boş', () => {
    it('öğretmen persona ile kuyruk bölgesi forbidden_non_enumerating üzerinden açılır', async () => {
      const ui = signedIn(TEACHER_PERMISSION_KEYS);
      ui.fetch.mockResolvedValueOnce(sessionsResponse([{ id: 's1', status: 'draft', sessionDate: '2026-10-01T08:50:00.000Z', rosterSnapshot: [] }]));
      await ui.probe.loadTodayDashboard();
      expect(ui.element('#bugun-queue-output').dataset.state).toBe('forbidden_non_enumerating');
      expect(ui.element('#bugun-open-work-value').textContent).toBe('');
      expect(ui.element('#bugun-queue-output').innerHTML).toContain('error-state');
    });
  });

  describe('rol kesitleri: aktör kapsamı', () => {
    it('operasyon persona ile kuyruk/karar/yoklama kesitleri açık yazar', async () => {
      const ui = signedIn(OPS_PERMISSION_KEYS);
      ui.fetch.mockResolvedValueOnce(todayResponse([]));
      ui.fetch.mockResolvedValueOnce(leavesResponse([]));
      ui.fetch.mockResolvedValueOnce(sessionsResponse([]));
      await ui.probe.loadTodayDashboard();
      const htmlOut = ui.element('#bugun-roles-output').innerHTML;
      expect(htmlOut).toContain('data-kesit="queue"');
      expect(htmlOut).toContain('data-kesit="decision"');
      expect(htmlOut).toContain('data-kesit="attendance"');
      expect(htmlOut).toContain('Açık');
    });
  });

  describe('mock-up kabuğu', () => {
    it('mockup bugun.html ile port kontratı uyumlu kalır', () => {
      expect(mockup).toContain('data-metric="open-work"');
      expect(mockup).toContain('data-metric="awaiting-leave"');
      expect(mockup).toContain('data-metric="sessions-open"');
      expect(mockup).toContain('data-attendance-state="open"');
      expect(mockup).toContain('data-attendance-state="completed"');
      expect(mockup).toContain('data-attendance-state="locked"');
      expect(mockup).toContain('Henüz karşılanmadı');
      expect(mockup).toContain('Henüz atanmadı');
      expect(mockup).toContain('Etki hazır değil');
    });
  });

  describe('viewer: mutasyon/karar/yoklama ölçümleri gizli', () => {
    it('salt-okunur persona ile karar kesiti kapalı görünür', async () => {
      const ui = signedIn(VIEWER_PERMISSION_KEYS);
      await ui.probe.loadTodayDashboard();
      const htmlOut = ui.element('#bugun-roles-output').innerHTML;
      expect(htmlOut).toContain('data-kesit="decision"');
      expect(htmlOut).toContain('Kapalı');
    });
  });
});
