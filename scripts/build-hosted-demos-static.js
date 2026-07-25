'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { legacyFiles, fullVisionFiles } = require('./hosted-demos-runtime-manifest.js');

const repositoryRoot = path.resolve(__dirname, '..');
const outputRoot = path.join(repositoryRoot, 'hosted-demos-static-dist');
const sourceOutputs = [
  {
    build: 'build-demo-static.js',
    root: path.join(repositoryRoot, 'demo-static-dist'),
    files: legacyFiles,
  },
  {
    build: 'build-full-vision-demo-static.js',
    root: path.join(repositoryRoot, 'full-vision-static-dist'),
    files: fullVisionFiles,
  },
];

for (const source of sourceOutputs) {
  execFileSync(process.execPath, [path.join(__dirname, source.build)], { cwd: repositoryRoot, stdio: 'inherit' });
  for (const relativePath of source.files) {
    const absolutePath = path.join(source.root, relativePath);
    assert(fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile(), `Bounded build output is missing: ${relativePath}`);
  }
}

fs.rmSync(outputRoot, { recursive: true, force: true });

const emitted = [];
for (const source of sourceOutputs) {
  for (const relativePath of source.files) {
    const sourcePath = path.join(source.root, relativePath);
    const targetPath = path.join(outputRoot, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
    emitted.push(relativePath);
  }
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolutePath) : [path.relative(outputRoot, absolutePath)];
  });
}

assert.deepEqual(walk(outputRoot).sort(), emitted.sort(), 'Hosted output contains a file outside the two runtime allowlists.');
assert.equal(emitted.filter((file) => file.startsWith('demo-frontend/')).length, 5);
assert.equal(emitted.filter((file) => file.startsWith('full-vision-demo/')).length, 10);

console.log(`Hosted static output: ${path.relative(repositoryRoot, outputRoot)}`);
console.log('Applications: legacy demo 5 files; Full-Vision demo 10 files');
console.log('Serverless functions: 0 (combined bounded static contract)');
