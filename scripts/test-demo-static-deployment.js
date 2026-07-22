'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createDemoServer } = require('../demo-frontend/local-server.js');

const repositoryRoot = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'vercel.json'), 'utf8'));
const expectedRoutes = [
  '/demo/today',
  '/demo/schedule',
  '/demo/leave/LV-204',
  '/demo/attendance/session/AT-1204',
  '/demo/notifications',
];
const expectedAssets = [
  '/demo-frontend/styles.css',
  '/demo-frontend/app.js',
  '/demo-frontend/conflict-engine.js',
  '/demo-frontend/demo-state.js',
];

assert.equal(config.framework, null, 'Vercel framework detection must be disabled.');
assert.equal(config.installCommand, 'node --version', 'Backend dependency installation must be bypassed.');
assert.equal(config.buildCommand, 'node scripts/build-demo-static.js', 'Only the bounded static build may run.');
assert.equal(config.outputDirectory, 'demo-static-dist', 'Vercel output must be the bounded static directory.');
assert.deepEqual(config.redirects, [{ source: '/demo', destination: '/demo/today', permanent: false }]);
assert.deepEqual(config.rewrites, [{ source: '/demo/:path*', destination: '/demo-frontend/index.html' }]);

execFileSync(process.execPath, [path.join(__dirname, 'build-demo-static.js')], {
  cwd: repositoryRoot,
  stdio: 'inherit',
});

async function request(baseUrl, pathname, redirect = 'follow') {
  return fetch(`${baseUrl}${pathname}`, { redirect });
}

async function main() {
  const server = createDemoServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const redirect = await request(baseUrl, '/demo', 'manual');
    assert.equal(redirect.status, 307);
    assert.equal(redirect.headers.get('location'), '/demo/today');

    for (const route of expectedRoutes) {
      const response = await request(baseUrl, route);
      assert.equal(response.status, 200, `${route} did not return HTTP 200.`);
      assert.match(response.headers.get('content-type') || '', /^text\/html\b/, `${route} has the wrong Content-Type.`);
      assert((await response.text()).includes('id="demoApp"'), `${route} did not return the demo shell.`);
    }

    for (const asset of expectedAssets) {
      const response = await request(baseUrl, asset);
      assert.equal(response.status, 200, `${asset} did not return HTTP 200.`);
      const expectedType = asset.endsWith('.css') ? /^text\/css\b/ : /^text\/javascript\b/;
      assert.match(response.headers.get('content-type') || '', expectedType, `${asset} has the wrong Content-Type.`);
    }

    const missing = await request(baseUrl, '/demo-frontend/not-present.js');
    assert.equal(missing.status, 404, 'Unknown assets must fail with HTTP 404.');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }

  console.log('Static deployment HTTP contract passed.');
  console.log('Routes: redirect + 5 deep-link GET/hard-refresh requests passed.');
  console.log('Assets: 4 runtime assets passed with explicit Content-Type.');
  console.log('Offline fallback: loopback-only server; no external request performed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
