import * as fs from 'node:fs';
import * as path from 'node:path';
import { runtime, response, ALL_PERMISSION_KEYS } from './runtime-harness';

const runtimeDir = path.join(process.cwd(), 'frontend', 'runtime');
const html = fs.readFileSync(path.join(runtimeDir, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(runtimeDir, 'styles.css'), 'utf8');

describe('runtime shell layout and auth gate', () => {
  it('places the main region in its own wide grid column', () => {
    expect(css).toContain('grid-template-areas:');
    expect(css).toContain('"topbar topbar"');
    expect(css).toContain('"sidebar main"');
    expect(css).toContain('"footer footer"');
    expect(css).toContain('grid-area: sidebar');
    expect(css).toContain('grid-area: main');
    expect(css).toContain('minmax(0, 1fr)');
    expect(html.indexOf('id="runtime-sidebar"')).toBeLessThan(html.indexOf('id="runtime-main"'));
  });

  it('collapses the navigation into a drawer at the mobile breakpoint', () => {
    expect(css).toContain('@media (max-width: 820px)');
    expect(css).toContain('grid-template-columns: 1fr');
    expect(css).toContain('.shell.sidebar-open .sidebar');
    expect(html).toContain('id="nav-toggle"');
    expect(html).toContain('aria-controls="runtime-sidebar"');
    expect(html).toContain('data-action="toggle-nav"');
  });

  it('groups daily and management navigation without overflowing one tab strip', () => {
    expect(html).toContain('aria-label="Günlük işler"');
    expect(html).toContain('aria-label="Yönetim"');
    expect(html).toContain('class="sidebar-group"');
    for (const tab of [
      'bugun', 'teacher', 'ops', 'program', 'attendance', 'notifications',
      'tanimlar', 'raporlar', 'yonetim',
    ]) {
      expect(html).toContain(`class="tab" role="tab" data-tab="${tab}"`);
    }
  });

  it('keeps the message region from reserving empty space', () => {
    expect(css).toContain('.message-region:empty');
  });

  it('shows credentials only while signed out', async () => {
    const ui = runtime('state, applyCatalog, login, logout, setStatus, renderSessionSurface, renderNavigation');
    const catalog = {
      branches: [{ name: 'Merkez', code: 'ANKARA' }],
      activeBranch: null,
      permissions: ALL_PERMISSION_KEYS,
    };

    expect(ui.element('#auth-panel').hidden).toBe(false);
    expect(ui.element('.shell').dataset.session).toBe('signed-out');

    ui.fetch
      .mockResolvedValueOnce(response({ accessToken: 'token' }))
      .mockResolvedValueOnce(response(catalog));
    await ui.probe.login({ preventDefault: () => {} });

    expect(ui.probe.state.accessToken).toBe('token');
    expect(ui.element('#auth-panel').hidden).toBe(true);
    expect(ui.element('#context-form').hidden).toBe(false);
    expect(ui.element('.shell').dataset.session).toBe('signed-in');

    ui.probe.logout();

    expect(ui.element('#auth-panel').hidden).toBe(false);
    expect(ui.element('#context-form').hidden).toBe(true);
    expect(ui.element('.shell').dataset.session).toBe('signed-out');
  });
});
