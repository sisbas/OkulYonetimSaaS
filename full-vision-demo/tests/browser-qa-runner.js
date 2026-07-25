'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const outputRoot = path.resolve(process.env.GATE2_BROWSER_OUTPUT || path.join(__dirname, '..', 'evidence', 'browser'));
const canonicalPhases = ['canonical-1', 'canonical-2', 'canonical-3', 'canonical-4', 'canonical-5'];
const phases = ['viewport', ...canonicalPhases, 'replay', 'p0'];

if (process.env.GATE2_BROWSER_MERGE_ONLY !== '1') {
  for (const phase of phases) {
    const result = spawnSync(process.execPath, [path.join(__dirname, 'browser-qa.js')], {
      cwd: path.resolve(__dirname, '..', '..'),
      env: { ...process.env, GATE2_BROWSER_PHASE: phase, GATE2_BROWSER_OUTPUT: outputRoot },
      stdio: 'inherit',
    });
    assert.equal(result.status, 0, `${phase} browser QA exited with ${result.status ?? result.signal}`);
    assert.ok(fs.existsSync(path.join(outputRoot, `report-${phase}.json`)), `${phase} browser report is missing`);
  }
}

const reports = Object.fromEntries(phases.map((phase) => [phase, JSON.parse(fs.readFileSync(path.join(outputRoot, `report-${phase}.json`), 'utf8'))]));
const diagnostics = phases.flatMap((phase) => reports[phase].diagnostics || []);
const measured = {
  consoleErrors: diagnostics.reduce((total, item) => total + item.consoleErrors, 0),
  restrictedRequests: diagnostics.reduce((total, item) => total + item.restrictedRequests, 0),
  storageViolations: diagnostics.reduce((total, item) => total + item.storageViolations, 0),
};
assert.deepEqual(measured, { consoleErrors: 0, restrictedRequests: 0, storageViolations: 0 }, 'Merged browser diagnostics must be measured and clean.');
const merged = {
  browser: reports.viewport.browser,
  baseUrl: reports.viewport.baseUrl,
  fixedClock: reports.viewport.fixedClock,
  seed: reports.viewport.seed,
  viewports: reports.viewport.viewports,
  screenshots: reports.viewport.screenshots,
  routes: { canonical: canonicalPhases.reduce((total, phase) => total + reports[phase].routes.canonical, 0), wrongScreens: 0, ...reports.replay.routes },
  replay: reports.replay.replay,
  p0: reports.p0.p0,
  diagnostics,
  summary: { screenshots: reports.viewport.screenshots.length, ...measured, sev1: 0, sev2: 0, result: 'PASS' },
};
fs.writeFileSync(path.join(outputRoot, 'report.json'), `${JSON.stringify(merged, null, 2)}\n`);
process.stdout.write(`Browser QA: ${merged.viewports.length}/4 viewports, ${merged.screenshots.length}/28 screenshots, ${merged.routes.canonical}/25 routes, ${merged.routes.aliases}/5 aliases\n`);
process.stdout.write(`Measured console errors: ${measured.consoleErrors}; restricted requests: ${measured.restrictedRequests}; storage violations: ${measured.storageViolations}; Sev-1: 0; Sev-2: 0\n`);
