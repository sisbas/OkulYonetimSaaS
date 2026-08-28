import * as fs from 'node:fs';
import * as path from 'node:path';

describe('WP-07F runtime P0 flow and accessibility contract', () => {
  const runtimeDir = path.join(process.cwd(), 'frontend', 'runtime');
  const app = fs.readFileSync(path.join(runtimeDir, 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(runtimeDir, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(runtimeDir, 'styles.css'), 'utf8');

  it('defines role-aware Turkish runtime panels', () => {
    expect(html).toContain('Öğretmen işlemleri');
    expect(html).toContain('Operasyon yöneticisi işlemleri');
    expect(html).toContain('leave-form');
    expect(html).toContain('queue-output');
    expect(html).toContain('impact-output');
    expect(html).toContain('candidate-output');
  });

  it('maps the Daily Operations queue through backend leaveRequestId', () => {
    expect(app).toContain("pick(item, ['leaveRequestId'])");
    expect(app).not.toContain('linkedLeaveId');
  });

  it('renders LeaveImpactResponse events and opens candidate flow from events', () => {
    expect(app).toContain("asArray(body, ['events', 'affectedLessons', 'lessons', 'items'])");
    expect(app).toContain('function eventIdentity(event)');
    expect(app).toContain('data-action="candidates"');
    expect(app).toContain('data-event-id="${escapeHtml(eventIdentity(event))}"');
  });

  it('derives assignment clear state from returned impact events', () => {
    expect(app).toContain('function updateAssignmentStateFromEvents(events)');
    expect(app).toContain("pick(activeEvent, ['substituteAssignmentId'], '')");
    expect(app).not.toContain("pick(body, ['assignmentId']");
  });

  it('normalizes Nest error envelopes into canonical UI states', () => {
    expect(app).toContain("if (response.status === 403 && genericError && !messageReason) reasonCode = 'FORBIDDEN'");
    expect(app).toContain("if (response.status === 412) reasonCode = 'LEAVE_VERSION_MISMATCH'");
    expect(app).toContain("if (response.status === 409 && !reasonUi[reasonCode]) reasonCode = 'SUBSTITUTE_TIME_CONFLICT'");
    expect(app).toContain('forbidden_non_enumerating');
    expect(app).toContain('stale_version');
    expect(app).toContain('conflict_blocking');
  });

  it('treats unfinished candidate eligibility as a blocking state', () => {
    expect(app).toContain('body?.eligibilityFinalized === false');
    expect(app).toContain("renderBlockingState(target, 'TEACHER_COURSE_ELIGIBILITY_NOT_READY')");
    expect(app).toContain('eligibility_not_ready');
  });

  it('maps canonical stale, forbidden, conflict and empty states', () => {
    for (const code of [
      'FORBIDDEN',
      'RESOURCE_NOT_VISIBLE',
      'BRANCH_NOT_VISIBLE',
      'LEAVE_VERSION_MISMATCH',
      'TEACHER_COURSE_ELIGIBILITY_NOT_READY',
      'SUBSTITUTE_TIME_CONFLICT',
      'ASSIGNMENT_NOT_FOUND',
      'OFFLINE_OR_UNAVAILABLE',
    ]) {
      expect(app).toContain(code);
    }
    expect(app).toContain('forbidden_non_enumerating');
    expect(app).toContain('stale_version');
    expect(app).toContain('conflict_blocking');
  });

  it('keeps assignment create and clear server-confirmed with refetch', () => {
    expect(app).toContain('async function createAssignment');
    expect(app).toContain("method: 'POST'");
    expect(app).toContain('async function clearAssignment');
    expect(app).toContain("method: 'DELETE'");
    expect(app.match(/await loadImpact/g)?.length).toBeGreaterThanOrEqual(2);
    expect(app.match(/await loadQueue/g)?.length).toBeGreaterThanOrEqual(2);
    expect(app).toContain('Güncel izin kaydı alınmadan görevlendirme yapılamaz');
    expect(app).toContain('Güncel izin kaydı alınmadan görevlendirme temizlenemez');
  });

  it('has keyboard and focus affordances', () => {
    expect(html).toContain('skip-link');
    expect(html).toContain('href="#runtime-main"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-controls="teacher-panel"');
    expect(html).toContain('aria-controls="ops-panel"');
    expect(css).toContain(':focus-visible');
    expect(app).toContain("$('#runtime-main').focus()");
  });

  it('has accessible loading, empty and error regions', () => {
    expect(app).toContain('role="status"');
    expect(app).toContain('empty-state');
    expect(app).toContain('error-state');
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="Günlük operasyon kuyruğu"');
  });

  it('does not expose internal labels, transport versions or backend jargon in visible runtime copy', () => {
    for (const forbidden of [
      'Tenant ID',
      'Branch ID',
      'ETag',
      'Version:',
      'Queue getir',
      'Queue yenile',
      'Teacher flow',
      'Operations Manager flow',
      'Daily Operations queue',
      'server response',
      'server projection',
      'branchId gerekir',
      'leaveId gerekir',
      'scheduleEventId gerekir',
      'assignment yapılamaz',
      'Coverage:',
    ]) {
      expect(html).not.toContain(forbidden);
      expect(app).not.toContain(forbidden);
    }
  });

  it('maps raw status and reason codes to Turkish operational copy before display', () => {
    expect(app).toContain('const uiStateTitles');
    expect(app).toContain('const statusLabels');
    expect(app).toContain('function displayStatus');
    expect(app).toContain('Güncel kayıt alındı');
    expect(app).toContain('Bu işlem için yetkiniz yok');
  });

  it('covers responsive layout breakpoints without a new dashboard', () => {
    expect(css).toContain('@media (max-width: 820px)');
    expect(css).toContain('grid-template-columns: 1fr');
    expect(html.toLowerCase()).not.toContain('dashboard');
  });
});
