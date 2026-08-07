import * as fs from 'node:fs';
import * as path from 'node:path';

describe('WP-07F browser runner reproducibility contract', () => {
  const root = process.cwd();
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const packageLock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'wp07f-p0-browser-e2e.yml'), 'utf8');
  const runner = fs.readFileSync(path.join(root, 'scripts', 'qa-p0-browser-e2e.js'), 'utf8');

  it('pins browser runner packages exactly under package-lock authority', () => {
    expect(packageJson.devDependencies['@sparticuz/chromium']).toBe('138.0.2');
    expect(packageJson.devDependencies['puppeteer-core']).toBe('24.16.0');
    expect(packageLock.packages[''].devDependencies['@sparticuz/chromium']).toBe('138.0.2');
    expect(packageLock.packages[''].devDependencies['puppeteer-core']).toBe('24.16.0');
    expect(packageLock.packages['node_modules/@sparticuz/chromium'].version).toBe('138.0.2');
    expect(packageLock.packages['node_modules/puppeteer-core'].version).toBe('24.16.0');
  });

  it('keeps the P0 workflow lockfile-only after npm ci', () => {
    expect(workflow).toContain('run: npm ci');
    expect(workflow).not.toContain('npm install --no-save');
    expect(workflow).not.toContain('apt-get install');
    expect(workflow).toContain('PUPPETEER_EXECUTABLE_STRATEGY: sparticuz');
  });

  it('smoke-tests Sparticuz launch without swallowing resolution or launch failures', () => {
    expect(workflow).toContain("import puppeteer from 'puppeteer-core'");
    expect(workflow).toContain("import chromium from '@sparticuz/chromium'");
    expect(workflow).toContain('await chromium.executablePath()');
    expect(workflow).toContain('await puppeteer.launch');
    expect(workflow).toContain('await page.goto');
    expect(workflow).not.toContain('executablePath warning');
  });

  it('uses Sparticuz as the single executable authority for the P0 runner', () => {
    expect(runner).toContain("const PUPPETEER_EXECUTABLE_STRATEGY = process.env.PUPPETEER_EXECUTABLE_STRATEGY || 'sparticuz'");
    expect(runner).toContain('async function resolveChromiumLaunchOptions()');
    expect(runner).toContain('await sparticuzChromium.executablePath()');
    expect(runner).not.toContain('/usr/bin/chromium');
    expect(runner).not.toContain('CHROMIUM_EXECUTABLE_PATH');
    expect(runner).not.toContain('buildSystemChromiumCandidate');
  });
});
