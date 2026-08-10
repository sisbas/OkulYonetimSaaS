'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runtimeFiles } = require('./hosted-demos-runtime-manifest.js');

const repositoryRoot = path.resolve(__dirname, '..');
const outputRoot = path.resolve(repositoryRoot, 'hosted-runtime-static-dist');
const sourceRoot = path.resolve(repositoryRoot, 'frontend');

function assertContained(resolvedPath, root, label) {
  assert(path.isAbsolute(resolvedPath), `${label} must be absolute: ${resolvedPath}`);
  assert(resolvedPath.startsWith(`${root}${path.sep}`), `${label} escapes allowed root: ${resolvedPath}`);
}

for (const relativePath of runtimeFiles) {
  assert(!path.isAbsolute(relativePath), `Runtime path must be relative: ${relativePath}`);
  const sourcePath = path.resolve(sourceRoot, relativePath);
  assertContained(sourcePath, sourceRoot, 'Runtime source path');
  const stat = fs.lstatSync(sourcePath);
  assert(stat.isFile() && !stat.isSymbolicLink(), `Runtime asset must be a regular file: ${relativePath}`);
}

fs.rmSync(outputRoot, { recursive: true, force: true });

for (const relativePath of runtimeFiles) {
  const sourcePath = path.resolve(sourceRoot, relativePath);
  const targetPath = path.resolve(outputRoot, relativePath);
  assertContained(targetPath, outputRoot, 'Runtime target path');
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

/**
 * Recursively lists files under the given directory as forward-slash paths
 * relative to the output root.
 * @param {string} directory - Absolute path to start walking from.
 * @returns {string[]} Sorted-independent list of emitted relative file paths.
 */
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
