'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runtimeFiles } = require('./hosted-demos-runtime-manifest.js');

const repositoryRoot = path.resolve(__dirname, '..');
const outputRoot = path.join(repositoryRoot, 'hosted-runtime-static-dist');
const sourceRoot = path.join(repositoryRoot, 'frontend');

for (const relativePath of runtimeFiles) {
  const sourcePath = path.join(sourceRoot, relativePath);
  assert(fs.existsSync(sourcePath) && fs.statSync(sourcePath).isFile(), `Runtime asset is missing: ${relativePath}`);
}

fs.rmSync(outputRoot, { recursive: true, force: true });

for (const relativePath of runtimeFiles) {
  const sourcePath = path.join(sourceRoot, relativePath);
  const targetPath = path.join(outputRoot, relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolutePath) : [path.relative(outputRoot, absolutePath).replace(/\\/g, '/')];
  });
}

assert.deepEqual(walk(outputRoot).sort(), [...runtimeFiles].sort(), 'Hosted runtime output contains unexpected files.');

console.log(`Hosted runtime output: ${path.relative(repositoryRoot, outputRoot)}`);
console.log(`Runtime files: ${runtimeFiles.length}`);
console.log('Demo applications: excluded from Vercel output');
console.log('Serverless functions: 0 (bounded static runtime contract)');
