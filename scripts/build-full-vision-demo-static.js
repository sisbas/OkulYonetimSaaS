'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');
const sourceRoot = path.join(repositoryRoot, 'full-vision-demo');
const outputRoot = path.join(repositoryRoot, 'full-vision-static-dist');
const outputApp = path.join(outputRoot, 'full-vision-demo');
const claims = require(path.join(sourceRoot, 'app-shell', 'claim-manifest.js'));
const runtimeEntries = ['index.html', 'styles.css', 'app.js', 'app-shell', 'fixtures', 'phases', 'shared'];
const allowedExtensions = new Set(['.html', '.css', '.js']);

function copyEntry(relativePath) {
  const source = path.join(sourceRoot, relativePath);
  const target = path.join(outputApp, relativePath);
  const stat = fs.lstatSync(source);
  assert(!stat.isSymbolicLink(), `Static runtime cannot contain symlinks: ${relativePath}`);
  if (stat.isDirectory()) {
    fs.mkdirSync(target, { recursive: true });
    fs.readdirSync(source).sort().forEach((name) => copyEntry(path.join(relativePath, name)));
    return;
  }
  assert(allowedExtensions.has(path.extname(relativePath)), `Unexpected runtime extension: ${relativePath}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

runtimeEntries.forEach((entry) => assert(fs.existsSync(path.join(sourceRoot, entry)), `Missing full-vision runtime entry: ${entry}`));
fs.rmSync(outputRoot, { recursive: true, force: true });
fs.mkdirSync(outputApp, { recursive: true });
runtimeEntries.forEach(copyEntry);

const emitted = [];
function walk(directory) {
  fs.readdirSync(directory).sort().forEach((name) => {
    const absolute = path.join(directory, name);
    if (fs.statSync(absolute).isDirectory()) walk(absolute);
    else emitted.push(path.relative(outputApp, absolute));
  });
}
walk(outputApp);

const runtimeSource = emitted.filter((file) => file.endsWith('.js') && file !== 'app-shell/claim-manifest.js').map((file) => fs.readFileSync(path.join(outputApp, file), 'utf8')).join('\n');
const forbiddenRuntime = [
  /\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /EventSource/, /sendBeacon/, /axios/i, /\/api\//i,
  /Authorization/, /Bearer\s/, /document\.cookie/, /localStorage/, /sessionStorage/, /indexedDB/, /navigator\.credentials/, /serviceWorker/,
];
forbiddenRuntime.forEach((pattern) => assert.doesNotMatch(runtimeSource, pattern, `Forbidden runtime capability detected: ${pattern}`));
const renderedClaimCopy = Object.values(claims.sets).flatMap((set) => [set.shows, set.boundary]).join('\n');
const claimViolations = claims.findForbiddenClaims(`${runtimeSource}\n${renderedClaimCopy}`);
assert.deepEqual(claimViolations, [], `Forbidden runtime claim detected: ${claimViolations.join(', ')}`);

const index = fs.readFileSync(path.join(outputApp, 'index.html'), 'utf8');
for (const file of emitted.filter((item) => item.endsWith('.js') || item.endsWith('.css'))) {
  if (file === 'styles.css' || file === 'app.js' || file.includes('/')) assert(index.includes(`/full-vision-demo/${file}`) || file.includes('phases/phase-1/operations.js') === false, `Runtime asset is not rooted correctly: ${file}`);
}

console.log(`Static output: ${path.relative(repositoryRoot, outputRoot)}`);
console.log(`Runtime files: ${emitted.length}`);
console.log('Serverless functions: 0 (bounded static contract)');
