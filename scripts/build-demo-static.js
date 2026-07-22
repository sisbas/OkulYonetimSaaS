'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');
const sourceRoot = path.join(repositoryRoot, 'demo-frontend');
const outputRoot = path.join(repositoryRoot, 'demo-static-dist');
const outputAssets = path.join(outputRoot, 'demo-frontend');
const runtimeFiles = [
  'index.html',
  'styles.css',
  'app.js',
  'conflict-engine.js',
  'demo-state.js',
];

for (const file of runtimeFiles) {
  const source = path.join(sourceRoot, file);
  assert(fs.existsSync(source), `Required static demo file is missing: demo-frontend/${file}`);
  assert(fs.statSync(source).isFile(), `Static demo input is not a file: demo-frontend/${file}`);
}

fs.rmSync(outputRoot, { recursive: true, force: true });
fs.mkdirSync(outputAssets, { recursive: true });

for (const file of runtimeFiles) {
  fs.copyFileSync(path.join(sourceRoot, file), path.join(outputAssets, file));
}

const emittedFiles = fs.readdirSync(outputAssets).sort();
assert.deepEqual(emittedFiles, [...runtimeFiles].sort(), 'Static output contains an unexpected file.');

const index = fs.readFileSync(path.join(outputAssets, 'index.html'), 'utf8');
for (const asset of runtimeFiles.filter((file) => file !== 'index.html')) {
  assert(index.includes(`/demo-frontend/${asset}`), `index.html does not reference ${asset} from the deployment root.`);
}

const runtimeSource = ['app.js', 'conflict-engine.js', 'demo-state.js']
  .map((file) => fs.readFileSync(path.join(outputAssets, file), 'utf8'))
  .join('\n');

assert.doesNotMatch(runtimeSource, /\bfetch\s*\(|XMLHttpRequest|axios/i, 'Static demo must not issue API requests.');
assert.doesNotMatch(runtimeSource, /Authorization|Bearer\s|localStorage|sessionStorage|document\.cookie/i, 'Static demo must not use auth or persistent browser storage.');

console.log(`Node runtime: ${process.version}`);
console.log(`Static output: ${path.relative(repositoryRoot, outputRoot)}`);
console.log(`Static files (${runtimeFiles.length}): ${runtimeFiles.join(', ')}`);
console.log('Serverless functions: 0 (static output contract)');
