import * as fs from 'node:fs';
import * as path from 'node:path';

describe('WP-07F runtime frontend boundary', () => {
  const root = process.cwd();
  const runtimeDir = path.join(root, 'frontend', 'runtime');
  const app = fs.readFileSync(path.join(runtimeDir, 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(runtimeDir, 'index.html'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'src', 'main.ts'), 'utf8');
  const runtimeBuild = fs.readFileSync(path.join(root, 'scripts', 'build-runtime-assets.js'), 'utf8');
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

  it('uses the real API boundary and required endpoint paths', () => {
    expect(app).toContain("const API_ROOT = '/api/v1'");
    expect(app).toContain('/auth/login');
    expect(app).toContain('/leaves/me');
    expect(app).toContain('/daily-operations/today?');
    expect(app).toContain('/impact');
    expect(app).toContain('/candidates');
    expect(app).toContain('/substitution');
  });

  it('copies runtime assets into the production build output', () => {
    expect(packageJson.scripts.build).toContain('npm run build:runtime');
    expect(packageJson.scripts['build:runtime']).toBe('node scripts/build-runtime-assets.js');
    expect(runtimeBuild).toContain("join(projectRoot, 'frontend', 'runtime')");
    expect(runtimeBuild).toContain("join(projectRoot, 'dist', 'runtime')");
    expect(runtimeBuild).toContain('cpSync(sourceDir, outputDir');
  });

  it('serves the runtime under /runtime without moving API_ROOT off same origin', () => {
    expect(main).toContain('NestExpressApplication');
    expect(main).toContain("app.useStaticAssets(join(process.cwd(), 'dist', 'runtime'), { prefix: '/runtime' })");
    expect(main).toContain("app.setGlobalPrefix('api/v1')");
    expect(app).toContain("const API_ROOT = '/api/v1'");
  });

  it('sends only the CreateLeaveRequestDto payload fields for Teacher leave creation', () => {
    expect(app).toContain('branchId,');
    expect(app).toContain("durationType: $('#leave-duration-type').value");
    expect(app).toContain("reasonCode: $('#leave-reason-code').value");
    expect(app).toContain("startsAt: toIso8601($('#leave-starts-at').value)");
    expect(app).toContain("endsAt: toIso8601($('#leave-ends-at').value)");
    for (const forbidden of ['startDate', 'endDate', 'startTime', 'endTime', 'leave-note', 'leave-start-time', 'leave-end-time']) {
      expect(app).not.toContain(forbidden);
      expect(html).not.toContain(forbidden);
    }
  });

  it('does not import demo, Builder or Full Vision artefacts', () => {
    const forbiddenImports = [
      'demo-frontend',
      'full-vision-demo',
      'full-vision',
      'builder.io',
      '@builder.io',
    ];
    for (const token of forbiddenImports) {
      expect(app.toLowerCase()).not.toContain(token.toLowerCase());
      expect(html.toLowerCase()).not.toContain(token.toLowerCase());
    }
  });

  it('does not use browser storage or persistent authority', () => {
    for (const token of ['localStorage', 'sessionStorage', 'indexedDB', 'document.cookie']) {
      expect(app).not.toContain(token);
      expect(html).not.toContain(token);
    }
  });

  it('does not include a fake API or local success adapter', () => {
    for (const token of ['mockApi', 'fakeApi', 'fixture', 'synthetic', 'setTimeout(() =>', 'Promise.resolve({']) {
      expect(app).not.toContain(token);
    }
  });

  it('uses only server-returned ETag for assignment mutations', () => {
    expect(app).toContain("headers: { 'If-Match': state.activeLeaveEtag }");
    expect(app).toContain("pick(body, ['leaveEtag', 'etag'], etag || state.activeLeaveEtag)");
    expect(app).not.toContain('leave:${');
    expect(app).not.toContain('v${');
    expect(app).not.toContain('resourceVersion +');
  });

  it('keeps role and permission authority on the API side', () => {
    expect(html).not.toContain('role="teacher"');
    expect(html).not.toContain('role="operations"');
    expect(app).not.toContain('state.role');
    expect(app).not.toContain('permissions =');
    expect(app).toContain('Role ve permission server endpointleri tarafından uygulanır');
  });
});
