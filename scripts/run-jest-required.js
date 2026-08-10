#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const [outputFile = 'artifacts/jest-required.json', ...jestArgs] = process.argv.slice(2);
fs.mkdirSync(path.dirname(outputFile), { recursive: true });

const jestBin = require.resolve('jest/bin/jest');
const result = spawnSync(
  process.execPath,
  [jestBin, '--json', `--outputFile=${outputFile}`, ...jestArgs],
  { stdio: 'inherit' },
);

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const report = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
const skippedSuites = report.numPendingTestSuites ?? 0;
const skippedTests = report.numPendingTests ?? 0;

if (skippedSuites > 0 || skippedTests > 0) {
  throw new Error(
    `Required Jest run had skipped coverage: suites=${skippedSuites}, tests=${skippedTests}`,
  );
}
