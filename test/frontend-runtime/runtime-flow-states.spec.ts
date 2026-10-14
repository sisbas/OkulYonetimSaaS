import * as fs from 'fs';
import * as path from 'path';
import { runtime, response } from './runtime-harness';

function readShellHtml(): string {
  return fs.readFileSync(path.join(process.cwd(), 'frontend/runtime/index.html'), 'utf8');
}

const PROBE = 'state, applyCatalog, login, updateContext, apiRequest, renderNavigation, activateTab, loadQueue, loadImpact, loadCandidates, createAssignment, clearAssignment, createLeave, loadOwnLeave, renderError, recoveryHint, requireSession, getBranchId';

describe('runtime core flow state coverage (#400)', () => {
  describe('candidate eligibility separation', () => {
    it('separates course-eligibility from time-availability in candidate card', () => {
      const ui = runtime(PROBE);
      ui.probe.state.accessToken = 'token';
      ui.probe.state.activeLeaveId = 'leave-1';
      ui.probe.state.activeScheduleEventId = 'event-1';
      ui.probe.state.activeLeaveEtag = 'etag-1';
      const candidates = {
        candidates: [
          { teacherId: 't1', displayName: 'Ayşe Yılmaz', courseEligible: true, availabilityStatus: 'available' },
          { teacherId: 't2', displayName: 'Ali Veli', courseEligible: true, availabilityStatus: 'busy' },
          { teacherId: 't3', displayName: 'Fatma Demir', courseEligible: false, availabilityStatus: 'available' },
        ],
      };
      ui.fetch.mockResolvedValueOnce(response(candidates));
      return ui.probe.loadCandidates('event-1', 'Matematik').then(() => {
        const output = ui.element('#candidate-output').innerHTML;
        // Course-eligible + available → selectable
        expect(output).toContain('Ayşe Yılmaz');
        expect(output).toContain('dersi verebilir');
        expect(output).toMatch(/bu saat müsait/i);
        // Course-eligible but busy → not selectable at this time
        expect(output).toContain('Ali Veli');
        // Not course-eligible → clearly separated
        expect(output).toContain('Fatma Demir');
        expect(output).toMatch(/dersi veremez/i);
      });
    });

    it('eligibility-not-finalized renders blocking state, never empty list', () => {
      const ui = runtime(PROBE);
      ui.probe.state.accessToken = 'token';
      ui.probe.state.activeLeaveId = 'leave-1';
      ui.probe.state.activeScheduleEventId = 'event-1';
      ui.fetch.mockResolvedValueOnce(response({ eligibilityFinalized: false, candidates: [] }));
      return ui.probe.loadCandidates('event-1', 'Matematik').then(() => {
        const output = ui.element('#candidate-output').innerHTML;
        expect(output).toContain('error-state');
        expect(output).not.toContain('empty-state');
        expect(output).toMatch(/uygunluk|bekleniyor/i);
      });
    });
  });

  describe('attendance not-ready state', () => {
    it('attendance panel shows explicit not-ready when lifecycle unavailable', () => {
      const html = readShellHtml();
      expect(html).toContain('id="attendance-output"');
      // The attendance panel intro should mention lifecycle unavailability honestly
      expect(html).toMatch(/hazırlanıyor|yakında|kullanıma açılacak/i);
    });
  });

  describe('notification planning-only state', () => {
    it('notification panel shows planning-only state, no send button without backend path', () => {
      const html = readShellHtml();
      expect(html).toContain('id="notifications-output"');
      // Must NOT contain a send/submit button for notifications (no backend path)
      expect(html).not.toMatch(/<button[^>]*data-action="notification-send"/i);
      // Planning-only indicator
      expect(html).toMatch(/planlama|taslak|yakında/i);
    });
  });

  describe('empty states explain why and how to proceed', () => {
    it('daily-ops empty state includes next-action guidance', () => {
      const ui = runtime(PROBE);
      ui.probe.state.accessToken = 'token';
      ui.probe.state.branchId = 'ANKARA';
      ui.fetch.mockResolvedValueOnce(response({ items: [] }));
      return ui.probe.loadQueue().then(() => {
        const output = ui.element('#queue-output').innerHTML;
        expect(output).toContain('empty-state');
        // Empty state should mention how to proceed (change branch/date)
        expect(output).toMatch(/şube|tarih|deneyin|değiştirin/i);
      });
    });

    it('candidates empty state includes next-action guidance', () => {
      const ui = runtime(PROBE);
      ui.probe.state.accessToken = 'token';
      ui.probe.state.activeLeaveId = 'leave-1';
      ui.probe.state.activeScheduleEventId = 'event-1';
      ui.fetch.mockResolvedValueOnce(response({ eligibilityFinalized: true, candidates: [] }));
      return ui.probe.loadCandidates('event-1', 'Matematik').then(() => {
        const output = ui.element('#candidate-output').innerHTML;
        expect(output).toContain('empty-state');
        expect(output).toMatch(/ders|kapsam|farklı|deneyin/i);
      });
    });
  });

  describe('non-JSON server response handled gracefully', () => {
    it('apiRequest handles non-JSON error response without crashing', () => {
      expect.assertions(3);
      const ui = runtime(PROBE);
      ui.probe.state.accessToken = 'token';
      // Mock a non-JSON response (HTML error page)
      ui.fetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        text: async () => '<html>Bad Gateway</html>',
        headers: { get: () => null },
      });
      return ui.probe.apiRequest('/daily-operations/today').catch((error: { reasonCode?: string; message?: string }) => {
        // Should throw a normalized error, not crash on JSON.parse
        expect(error).toBeDefined();
        expect(error.reasonCode).toBeDefined();
        expect(error.message).toBeTruthy();
      });
    });

    it('apiRequest treats 200 non-JSON as server fault, not empty state', () => {
      expect.assertions(2);
      const ui = runtime(PROBE);
      ui.probe.state.accessToken = 'token';
      ui.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '<html>unexpected</html>',
        headers: { get: () => null },
      });
      return ui.probe.apiRequest('/daily-operations/today').catch((error: { reasonCode?: string; message?: string }) => {
        // A 200 with undecodable body is a server fault, never a fabricated empty state
        expect(error.reasonCode).toBe('SERVER_ERROR');
        expect(error.message).not.toMatch(/boş|bulunmuyor/i);
      });
    });
  });

  describe('edge: stale data / concurrent edit', () => {
    it('version mismatch error shows operational Turkish, preserves selection', () => {
      expect.assertions(6);
      const ui = runtime(PROBE);
      ui.probe.state.accessToken = 'token';
      ui.probe.state.activeLeaveId = 'leave-1';
      ui.probe.state.activeScheduleEventId = 'event-1';
      ui.probe.state.activeLeaveEtag = 'old-etag';
      ui.probe.state.activeLessonLabel = 'Matematik 9-A';
      ui.fetch.mockResolvedValueOnce(response({ message: 'Leave version mismatch' }, 412));
      return ui.probe.loadCandidates('event-1', 'Matematik 9-A').then(() => {
        // Selection preserved
        expect(ui.probe.state.activeLeaveId).toBe('leave-1');
        expect(ui.probe.state.activeScheduleEventId).toBe('event-1');
        expect(ui.probe.state.activeLessonLabel).toBe('Matematik 9-A');
        // Error rendered with operational Turkish
        const output = ui.element('#candidate-output').innerHTML;
        expect(output).toContain('error-state');
        expect(output).toMatch(/güncel|yenileyin|gözden geçirin/i);
        expect(output).not.toMatch(/412|version mismatch|etag/i);
      });
    });
  });

  describe('jargon assertions extended to all state surfaces', () => {
    it('no state surface exposes UUID, ETag, snake_case or English backend terms', () => {
      const html = readShellHtml();
      const ariaLabels = [...html.matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1]);
      const strongTexts = [...html.matchAll(/<strong>([^<]+)<\/strong>/g)].map((m) => m[1]);
      const smallTexts = [...html.matchAll(/<small>([^<]+)<\/small>/g)].map((m) => m[1]);
      const pTexts = [...html.matchAll(/<p[^>]*>([^<]+)<\/p>/g)].map((m) => m[1]);
      const allVisible = [...ariaLabels, ...strongTexts, ...smallTexts, ...pTexts].join(' ');
      expect(allVisible).not.toMatch(/\bqueue\b/i);
      expect(allVisible).not.toMatch(/kuyruk/i);
      expect(allVisible).not.toMatch(/coverage/i);
      expect(allVisible).not.toMatch(/etag/i);
      expect(allVisible).not.toMatch(/lifecycle/i);
      expect(allVisible).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      expect(allVisible).not.toMatch(/_[a-z]/); // snake_case
    });
  });
});
