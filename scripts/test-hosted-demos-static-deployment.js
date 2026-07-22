'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHostedDemosServer, fullVisionHeaders, legacyFiles, fullVisionFiles } = require('./hosted-demos-local-server.js');
const { routes, legacyAliases } = require('../full-vision-demo/app-shell/route-manifest.js');

const repositoryRoot = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'vercel.json'), 'utf8'));
const legacyRoutes = [
  '/demo/today',
  '/demo/schedule',
  '/demo/leave/LV-204',
  '/demo/attendance/session/AT-1204',
  '/demo/notifications',
];
const fullVisionAliases = [
  '/full-vision/today',
  '/full-vision/schedule',
  '/full-vision/leave/LV-204',
  '/full-vision/attendance/session/AT-1204',
  '/full-vision/notifications',
];

assert.equal(config.framework, null);
assert.equal(config.installCommand, 'node --version');
assert.equal(config.buildCommand, 'node scripts/build-hosted-demos-static.js');
assert.equal(config.outputDirectory, 'hosted-demos-static-dist');
assert.deepEqual(config.redirects, [
  { source: '/', destination: '/full-vision/overview', permanent: false },
  { source: '/demo', destination: '/demo/today', permanent: false },
  { source: '/full-vision', destination: '/full-vision/overview', permanent: false },
]);
assert.deepEqual(config.rewrites, [
  { source: '/demo/:path*', destination: '/demo-frontend/index.html' },
  { source: '/full-vision/:path*', destination: '/full-vision-demo/index.html' },
]);
assert.equal(Object.prototype.hasOwnProperty.call(config, 'functions'), false);
assert.equal(Object.prototype.hasOwnProperty.call(config, 'builds'), false);
assert.equal(config.rewrites.some((rule) => rule.source.includes('/api')), false);

const fullVisionHeaderRules = config.headers.filter((rule) => rule.source.startsWith('/full-vision'));
assert.equal(fullVisionHeaderRules.length, 2);
for (const rule of fullVisionHeaderRules) {
  const headers = Object.fromEntries(rule.headers.map((header) => [header.key, header.value]));
  assert.match(headers['Content-Security-Policy'], /connect-src 'none'/);
  assert.match(headers['Content-Security-Policy'], /form-action 'none'/);
  assert.equal(headers['Referrer-Policy'], 'no-referrer');
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(headers['X-Robots-Tag'], 'noindex, nofollow');
  assert.equal(headers['Permissions-Policy'], 'camera=(), microphone=(), geolocation=()');
  assert.equal(headers['X-Demo-Application'], 'full-vision-synthetic-static-prototype');
}

execFileSync(process.execPath, [path.join(__dirname, 'build-hosted-demos-static.js')], { cwd: repositoryRoot, stdio: 'inherit' });

function request(port, pathname, method = 'GET') {
  return new Promise((resolve, reject) => {
    const client = require('node:http').request({ hostname: '127.0.0.1', port, path: pathname, method }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    client.on('error', reject);
    client.end();
  });
}

async function run() {
  const server = createHostedDemosServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;

  try {
    const rootRedirect = await request(port, '/');
    assert.equal(rootRedirect.status, 307);
    assert.equal(rootRedirect.headers.location, '/full-vision/overview');
    const legacyRedirect = await request(port, '/demo');
    assert.equal(legacyRedirect.status, 307);
    assert.equal(legacyRedirect.headers.location, '/demo/today');
    const fullVisionRedirect = await request(port, '/full-vision');
    assert.equal(fullVisionRedirect.status, 307);
    assert.equal(fullVisionRedirect.headers.location, '/full-vision/overview');

    for (const pathname of legacyRoutes) {
      const response = await request(port, pathname);
      assert.equal(response.status, 200, `Legacy route failed: ${pathname}`);
      assert.match(response.headers['content-type'], /^text\/html/);
      assert.match(response.body, /id="demoApp"/);
      assert.doesNotMatch(response.body, /id="app"/);
    }

    for (const route of routes) {
      const response = await request(port, route.samplePath);
      assert.equal(response.status, 200, `Full-Vision route failed: ${route.samplePath}`);
      assert.match(response.headers['content-type'], /^text\/html/);
      assert.match(response.body, /id="app"/);
      assert.equal(response.headers['x-demo-application'], fullVisionHeaders['X-Demo-Application']);
      assert.match(response.headers['content-security-policy'], /connect-src 'none'/);
      assert.equal(response.headers['x-robots-tag'], 'noindex, nofollow');
    }

    assert.equal(fullVisionAliases.length, legacyAliases.length);
    for (const pathname of fullVisionAliases) {
      const response = await request(port, pathname);
      assert.equal(response.status, 200, `Full-Vision alias failed: ${pathname}`);
      assert.match(response.body, /id="app"/);
      assert.equal((await request(port, `${pathname}/`)).status, 200, `Trailing-slash alias failed: ${pathname}/`);
    }

    for (const relativePath of [...legacyFiles, ...fullVisionFiles]) {
      if (relativePath.endsWith('index.html')) continue;
      const response = await request(port, `/${relativePath}`);
      assert.equal(response.status, 200, `Asset failed: ${relativePath}`);
      assert.match(response.headers['content-type'], relativePath.endsWith('.css') ? /^text\/css/ : /^text\/javascript/);
    }

    const legacyHead = await request(port, '/demo/today', 'HEAD');
    assert.equal(legacyHead.status, 200);
    assert.match(legacyHead.headers['content-type'], /^text\/html/);
    assert.equal(legacyHead.body, '');
    const fullVisionHead = await request(port, '/full-vision/overview', 'HEAD');
    assert.equal(fullVisionHead.status, 200);
    assert.match(fullVisionHead.headers['content-type'], /^text\/html/);
    assert.equal(fullVisionHead.body, '');
    assert.equal((await request(port, '/demo-frontend/not-present.js')).status, 404);
    assert.equal((await request(port, '/full-vision-demo/not-present.js')).status, 404);
    assert.equal((await request(port, '/full-vision-demo/%E0%A4%A')).status, 404);
    assert.equal((await request(port, '/full-vision/overview')).status, 200, 'Malformed URL must not terminate the server.');
    const legacyPost = await request(port, '/demo/today', 'POST');
    assert.equal(legacyPost.status, 405);
    assert.equal(legacyPost.headers.allow, 'GET, HEAD');
    const fullVisionPost = await request(port, '/full-vision/overview', 'POST');
    assert.equal(fullVisionPost.status, 405);
    assert.equal(fullVisionPost.headers.allow, 'GET, HEAD');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }

  console.log(`Legacy routes: ${legacyRoutes.length}/5 PASS`);
  console.log(`Full-Vision routes: ${routes.length}/25 canonical, ${fullVisionAliases.length}/5 aliases PASS`);
  console.log('Combined output, redirects, rewrites, MIME, headers, 404, 405 and malformed URL: PASS');
  console.log('Serverless functions: 0');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
