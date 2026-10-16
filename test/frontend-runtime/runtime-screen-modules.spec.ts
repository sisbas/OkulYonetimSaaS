import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

/**
 * #442 — runtime frontend screen-module prefactor.
 *
 * The runtime is a shared core (app.js) plus per-area screen modules under
 * screens/, loaded as ordered deferred classic scripts under the existing
 * content security policy (no inline script, no inline style, no bundler).
 * The split itself is an implementation detail and is not asserted here;
 * what is guarded is the load contract, the hard boundaries, and the
 * byte-identical asset copy.
 */
describe('#442 runtime screen modules prefactor', () => {
  const root = process.cwd();
  const runtimeDir = path.join(root, 'frontend', 'runtime');
  const screensDir = path.join(runtimeDir, 'screens');
  const screenAssets = ['decisions.js', 'consents.js', 'notifications.js', 'schedule.js', 'attendance.js'];

  const html = fs.readFileSync(path.join(runtimeDir, 'index.html'), 'utf8');

  it('index.html loads core then screen modules as ordered deferred classic scripts', () => {
    const loadOrder = [
      '<script src="/runtime/app.js" defer></script>',
      ...screenAssets.map((asset) => `<script src="/runtime/screens/${asset}" defer></script>`),
    ];
    let previous = html.indexOf(loadOrder[0]);
    expect(previous).toBeGreaterThanOrEqual(0);
    for (const tag of loadOrder.slice(1)) {
      const next = html.indexOf(tag);
      expect(next).toBeGreaterThanOrEqual(0);
      expect(next).toBeGreaterThan(previous);
      previous = next;
    }
    expect(html).not.toContain('<script>');
  });

  it('introduces no inline style or inline script', () => {
    expect(html).not.toContain('style="');
    expect(html).not.toContain('<style');
  });

  it('keeps the hard boundaries across core and every screen module', () => {
    const app = fs.readFileSync(path.join(runtimeDir, 'app.js'), 'utf8');
    const screens = screenAssets.map((asset) => fs.readFileSync(path.join(screensDir, asset), 'utf8'));
    expect(app.length).toBeGreaterThan(0);
    for (const screen of screens) expect(screen.length).toBeGreaterThan(0);
    const everything = [...screens, app].join('\n').toLowerCase();
    for (const token of [
      'localstorage',
      'sessionstorage',
      'indexeddb',
      'document.cookie',
      'mockapi',
      'fakeapi',
      'fixture',
      'synthetic',
      'promise.resolve({',
      '?variant=',
      '?ops=',
      '?sched=',
      'demo-frontend',
      'full-vision',
      'builder.io',
    ]) {
      expect(everything).not.toContain(token);
    }
  });

  it('copies the runtime source tree byte-identically into the production build output', () => {
    execFileSync(process.execPath, [path.join(root, 'scripts', 'build-runtime-assets.js')], { cwd: root });
    const scriptAssets = [
      'app.js',
      ...screenAssets.map((asset) => path.join('screens', asset)),
    ];
    for (const asset of scriptAssets) {
      const source = fs.readFileSync(path.join(runtimeDir, asset));
      const built = fs.readFileSync(path.join(root, 'dist', 'runtime', asset));
      expect(built.equals(source)).toBe(true);
    }
  });
});
