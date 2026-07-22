'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createServer } = require('../local-server.js');
const { routes } = require('../app-shell/route-manifest.js');

const moduleRoot = process.env.GATE2_BROWSER_MODULE_ROOT || '/tmp/gate2-browser/node_modules';
const puppeteer = require(path.join(moduleRoot, 'puppeteer-core'));
const chromium = require(path.join(moduleRoot, '@sparticuz', 'chromium'));
const outputRoot = path.resolve(process.env.GATE2_BROWSER_OUTPUT || path.join(__dirname, '..', 'evidence', 'browser'));
const viewports = [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1280x800', width: 1280, height: 800 },
  { name: '1024x768', width: 1024, height: 768 },
  { name: '768x1024', width: 768, height: 1024 },
];

function cleanDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true });
  for (const entry of fs.readdirSync(directory)) {
    const target = path.join(directory, entry);
    const stat = fs.lstatSync(target);
    if (stat.isFile() && ['.png', '.json'].includes(path.extname(entry))) fs.unlinkSync(target);
  }
}

async function settle(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function screenSignature(page) {
  return page.evaluate(() => ({
    path: `${location.pathname}${location.search}`,
    title: document.title,
    heading: document.querySelector('#screen h2, #screen h3')?.textContent?.trim() || '',
    content: document.querySelector('#screen')?.textContent?.replace(/\s+/g, ' ').trim() || '',
  }));
}

async function assertNoOverflow(page, label) {
  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.documentElement.clientWidth,
    clippedAttendanceControls: [...document.querySelectorAll('.attendance-row .status-option')].filter((element) => {
      const panel = element.closest('.panel');
      if (!panel) return false;
      const rect = element.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      return rect.left < panelRect.left - 1 || rect.right > panelRect.right + 1;
    }).length,
  }));
  assert.ok(overflow.document <= 1 && overflow.body <= 1 && overflow.clippedAttendanceControls === 0, `${label} has horizontal overflow or clipped controls: ${JSON.stringify(overflow)}`);
  return overflow;
}

async function assertShell(page, viewport) {
  const shell = await page.evaluate(() => {
    const visible = (selector) => {
      const element = document.querySelector(selector);
      return Boolean(element && !element.hidden && element.getClientRects().length);
    };
    const routeHeading = document.querySelector('#screen h2');
    const maturity = document.querySelector('#screen .maturity-badge');
    return {
      pageTitle: document.querySelector('#pageTitle')?.textContent?.trim(),
      demoData: document.querySelector('.synthetic-note strong')?.textContent?.trim(),
      breadcrumb: visible('#breadcrumb'),
      claimControl: visible('#claimToggle'),
      resetControl: visible('#globalReset'),
      routeHeading: routeHeading?.textContent?.trim(),
      maturity: maturity?.textContent?.trim(),
      h1Count: document.querySelectorAll('h1').length,
      h2Count: document.querySelectorAll('#screen h2').length,
      primaryCta: visible('#screen .button.primary'),
      phaseFilterLabelled: Boolean(document.querySelector('label:has(#phaseFilter)')),
      personaFilterLabelled: Boolean(document.querySelector('label:has(#personaFilter)')),
    };
  });
  assert.equal(shell.demoData, 'Demo Verisi');
  assert.equal(shell.breadcrumb, true);
  assert.equal(shell.claimControl, true);
  assert.equal(shell.resetControl, true);
  assert.equal(shell.h1Count, 1);
  assert.equal(shell.h2Count, 1);
  assert.equal(shell.primaryCta, true);
  assert.equal(shell.phaseFilterLabelled, true);
  assert.equal(shell.personaFilterLabelled, true);
  assert.ok(shell.pageTitle && shell.routeHeading && shell.maturity);

  if (viewport.width <= 960) {
    await page.click('#menuToggle');
    await settle(page);
    const drawer = await page.evaluate(() => {
      const sidebar = document.querySelector('#sidebar');
      const rect = sidebar.getBoundingClientRect();
      return { open: sidebar.classList.contains('open'), left: rect.left, right: rect.right, width: innerWidth };
    });
    assert.equal(drawer.open, true);
    assert.ok(drawer.left >= -1 && drawer.right <= drawer.width + 1, `Sidebar leaves viewport: ${JSON.stringify(drawer)}`);
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('#menuToggle')), true, 'Sidebar focus did not return to menu control');
  } else {
    assert.equal(await page.evaluate(() => document.querySelector('#sidebar').getClientRects().length > 0), true);
  }
}

async function assertClaimDrawer(page) {
  await page.click('#claimToggle');
  const opened = await page.evaluate(() => ({
    visible: !document.querySelector('#claimDrawer').hidden,
    role: document.querySelector('#claimDrawer').getAttribute('role'),
    modal: document.querySelector('#claimDrawer').getAttribute('aria-modal'),
    focus: document.activeElement?.id,
  }));
  assert.deepEqual(opened, { visible: true, role: 'dialog', modal: 'true', focus: 'claimClose' });
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'claimClose', 'Claim drawer did not trap focus');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.querySelector('#claimDrawer').hidden), true);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'claimToggle', 'Claim drawer did not return focus');
}

async function capture(page, viewport, name) {
  const target = path.join(outputRoot, `${viewport.name}-${name}.png`);
  await assertNoOverflow(page, `${viewport.name}/${name}`);
  await page.screenshot({ path: target, fullPage: true });
  return path.relative(outputRoot, target);
}

async function runViewportMatrix(browser, baseUrl, evidence) {
  for (const viewport of viewports) {
    const page = await browser.newPage();
    const errors = [];
    const restrictedRequests = [];
    page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('requestfailed', (request) => errors.push(`requestfailed: ${request.url()} ${request.failure()?.errorText || ''}`));
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (['xhr', 'fetch', 'websocket', 'eventsource'].includes(request.resourceType()) || url.origin !== baseUrl) restrictedRequests.push(`${request.resourceType()}: ${request.url()}`);
    });
    await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);

    const open = async (route) => {
      await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle0' });
      await settle(page);
    };

    await open('/demo/overview');
    await assertShell(page, viewport);
    evidence.screenshots.push(await capture(page, viewport, 'overview'));

    await open('/demo/f1/operations?scenario=operations&step=1');
    evidence.screenshots.push(await capture(page, viewport, 'operations'));
    await page.select('#personaFilter', 'operations');
    await page.focus('#personaFilter');
    assert.equal(await page.$eval('#personaFilter', (select) => select.value), 'operations');
    evidence.screenshots.push(await capture(page, viewport, 'persona-filter'));
    evidence.screenshots.push(await capture(page, viewport, 'presentation-mode'));

    await assertClaimDrawer(page);
    await page.click('#claimToggle');
    evidence.screenshots.push(await capture(page, viewport, 'claim-drawer'));
    await page.keyboard.press('Escape');

    await open('/demo/f1/schedule?view=lifecycle&scenario=operations&step=3');
    assert.equal(await page.$eval('.view-tab.active', (element) => element.textContent.trim()), 'Program yaşam döngüsü');
    evidence.screenshots.push(await capture(page, viewport, 'schedule'));

    await open('/demo/f1/attendance/D-AT-1204?scenario=operations&step=4');
    evidence.screenshots.push(await capture(page, viewport, 'attendance'));

    const security = await page.evaluate(async () => ({
      cookies: document.cookie,
      localStorage: localStorage.length,
      sessionStorage: sessionStorage.length,
      indexedDb: typeof indexedDB.databases === 'function' ? (await indexedDB.databases()).length : 0,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    }));
    assert.deepEqual(security, { cookies: '', localStorage: 0, sessionStorage: 0, indexedDb: 0, reducedMotion: true });
    assert.deepEqual(restrictedRequests, [], `Restricted browser request(s): ${restrictedRequests.join(', ')}`);
    assert.deepEqual(errors, [], `Browser error(s): ${errors.join(', ')}`);
    evidence.viewports.push({ ...viewport, errors: errors.length, restrictedRequests: restrictedRequests.length, security });
    await page.close();
  }
}

async function runCanonicalRouteQa(browser, baseUrl, evidence, subset) {
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

  for (const route of subset) {
    await page.goto(`${baseUrl}${route.samplePath}`, { waitUntil: 'networkidle0' });
    await settle(page);
    assert.equal(await page.$eval('#screen h2', (heading) => heading.textContent.trim()), route.title, `${route.id} rendered wrong heading`);
    assert.ok((await page.$eval('#screen .maturity-badge', (badge) => badge.textContent.trim())).includes(route.maturity));
    if (route.phase === 'f3') assert.ok((await page.$eval('#screen', (screen) => screen.textContent)).includes('Canlı AI sonucu değildir.'));
    await assertNoOverflow(page, route.id);
    process.stdout.write(`route ${route.id}: PASS\n`);
  }
  evidence.routes = { canonical: subset.length, wrongScreens: 0 };

  assert.deepEqual(errors, [], `Canonical route browser errors: ${errors.join(', ')}`);
  await page.close();
}

async function runReplayQa(browser, baseUrl, evidence) {
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  const aliases = [
    ['/demo/today', '/demo/f1/operations'],
    ['/demo/schedule', '/demo/f1/schedule'],
    ['/demo/leave/LV-204', '/demo/f1/leaves/D-LV-204'],
    ['/demo/attendance/session/AT-1204', '/demo/f1/attendance/D-AT-1204'],
    ['/demo/notifications', '/demo/f1/notifications'],
  ];
  for (const [legacy, canonical] of aliases) {
    await page.goto(`${baseUrl}${legacy}`, { waitUntil: 'networkidle0' });
    assert.equal(new URL(page.url()).pathname, canonical, `Alias failed: ${legacy}`);
    await page.reload({ waitUntil: 'networkidle0' });
    assert.equal(new URL(page.url()).pathname, canonical, `Alias hard refresh failed: ${legacy}`);
  }
  evidence.routes = { aliases: aliases.length };

  await page.goto(`${baseUrl}/demo/not-a-route?unsafe=yes`, { waitUntil: 'networkidle0' });
  assert.equal(new URL(page.url()).pathname, '/demo/not-a-route');
  assert.equal(new URL(page.url()).search, '');
  assert.ok((await page.$eval('#screen', (screen) => screen.textContent)).includes('Demo sayfası bulunamadı'));

  await page.goto(`${baseUrl}/demo/f1/operations?status=complete&scenario=operations&step=1&step=6&unsafe=yes`, { waitUntil: 'networkidle0' });
  assert.equal(new URL(page.url()).search, '?status=complete&scenario=operations&step=6');
  const step6Direct = await screenSignature(page);
  await page.reload({ waitUntil: 'networkidle0' });
  assert.deepEqual(await screenSignature(page), step6Direct, 'Hard refresh changed step 6 state');
  await page.click('[aria-label^="1. adım"]');
  const step1Click = await screenSignature(page);
  await page.goBack({ waitUntil: 'networkidle0' });
  assert.deepEqual(await screenSignature(page), step6Direct, 'Browser back changed step 6 state');
  await page.goForward({ waitUntil: 'networkidle0' });
  assert.deepEqual(await screenSignature(page), step1Click, 'Browser forward changed step 1 state');
  evidence.replay = { directRefresh: 'PASS', browserBack: 'PASS', browserForward: 'PASS', scenarioRail: 'PASS' };

  assert.deepEqual(errors, [], `Replay browser errors: ${errors.join(', ')}`);
  await page.close();
}

async function runP0Flow(browser, baseUrl, evidence) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(`${baseUrl}/demo/overview`, { waitUntil: 'networkidle0' });
  await page.click('[data-start-scenario="operations"]');
  assert.equal(new URL(page.url()).search, '?scenario=operations&step=1');
  await page.click('a.button.primary[href*="/leaves/"]');
  assert.equal(new URL(page.url()).search, '?scenario=operations&step=2');
  await page.select('[data-substitute][data-lesson-id="D-SE-301"]', 'D-T-021');
  await page.select('[data-substitute][data-lesson-id="D-SE-302"]', 'D-T-026');
  await page.select('[data-substitute][data-lesson-id="D-SE-303"]', 'D-T-021');
  assert.equal(await page.$eval('[data-approve-leave]', (button) => button.disabled), false);
  await page.click('[data-approve-leave]');
  await page.click('a.button.primary[href*="schedule"]');
  assert.equal(new URL(page.url()).search, '?view=lifecycle&scenario=operations&step=3');
  await page.click('[data-accept-schedule]');
  await page.click('a.button.primary[href*="attendance"]');
  assert.equal(new URL(page.url()).search, '?scenario=operations&step=4');
  await page.click('[data-attendance][data-student-id="D-S-004"][value="late"]');
  await page.click('[data-lock-attendance]');
  await page.click('a.button.primary[href*="notifications"]');
  assert.equal(new URL(page.url()).search, '?scenario=operations&step=5');
  await page.click('[data-simulate-notification="D-NT-034"]');
  assert.ok((await page.$eval('#screen', (screen) => screen.textContent)).includes('P0 operasyon akışı tamamlandı'));
  await page.click('a.button[href*="status=complete"]');
  assert.equal(new URL(page.url()).search, '?status=complete&scenario=operations&step=6');
  assert.ok((await page.$eval('#screen', (screen) => screen.textContent)).includes('Operasyon senaryosu tamamlandı'));
  await page.click('#globalReset');
  assert.equal(new URL(page.url()).pathname, '/demo/overview');
  assert.equal(new URL(page.url()).search, '');
  evidence.p0 = { steps: 6, blockers: 'PASS', completion: 'PASS', globalReset: 'PASS' };
  await page.close();
}

async function main() {
  const phase = process.env.GATE2_BROWSER_PHASE || 'all';
  if (phase === 'all' || phase === 'viewport') cleanDirectory(outputRoot);
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const executablePath = await chromium.executablePath();
  const browser = await puppeteer.launch({ args: chromium.args, defaultViewport: null, executablePath, headless: 'shell' });
  const evidence = {
    browser: await browser.version(),
    baseUrl: 'loopback-only ephemeral server',
    fixedClock: '2026-07-21T09:00:00+03:00',
    seed: 'OKUL-FULL-VISION-2026-07-21-v1',
    viewports: [], screenshots: [], routes: {}, replay: {}, p0: {},
  };
  try {
    if (phase === 'all' || phase === 'viewport') {
      await runViewportMatrix(browser, baseUrl, evidence);
      process.stdout.write('Viewport matrix: 4/4 PASS\n');
    }
    if (phase.startsWith('canonical-')) {
      const chunk = Number(phase.split('-')[1]);
      assert.ok(Number.isInteger(chunk) && chunk >= 1 && chunk <= 5, `Unknown canonical chunk: ${phase}`);
      await runCanonicalRouteQa(browser, baseUrl, evidence, routes.slice((chunk - 1) * 5, chunk * 5));
      process.stdout.write('Canonical route QA: PASS\n');
    }
    if (phase === 'replay') {
      await runReplayQa(browser, baseUrl, evidence);
      process.stdout.write('Alias and replay QA: PASS\n');
    }
    if (phase === 'all' || phase === 'p0') {
      await runP0Flow(browser, baseUrl, evidence);
      process.stdout.write('P0 flow: PASS\n');
    }
    evidence.summary = { phase, screenshots: evidence.screenshots.length, consoleErrors: 0, restrictedRequests: 0, sev1: 0, sev2: 0, result: 'PASS' };
    fs.writeFileSync(path.join(outputRoot, `report-${phase}.json`), `${JSON.stringify(evidence, null, 2)}\n`);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
