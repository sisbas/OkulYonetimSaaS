import * as fs from 'node:fs';
import * as path from 'node:path';

describe('WP-07F runtime P0 flow and accessibility contract', () => {
  const runtimeDir = path.join(process.cwd(), 'frontend', 'runtime');
  const app = fs.readFileSync(path.join(runtimeDir, 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(runtimeDir, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(runtimeDir, 'styles.css'), 'utf8');

  it('defines Teacher and Operations Manager runtime panels', () => {
    expect(html).toContain('Teacher flow');
    expect(html).toContain('Operations Manager flow');
    expect(html).toContain('leave-form');
    expect(html).toContain('queue-output');
    expect(html).toContain('impact-output');
    expect(html).toContain('candidate-output');
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
    expect(app).toContain('Server-returned leaveEtag olmadan assignment yapılamaz');
    expect(app).toContain('Server-returned leaveEtag olmadan clear yapılamaz');
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

  it('covers responsive layout breakpoints without a new dashboard', () => {
    expect(css).toContain('@media (max-width: 820px)');
    expect(css).toContain('grid-template-columns: 1fr');
    expect(html.toLowerCase()).not.toContain('dashboard');
  });
});
