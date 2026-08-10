'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  createHostedDemosServer,
  fullVisionHeaders,
  runtimeHeaders,
  legacyFiles,
  fullVisionFiles,
  runtimeFiles,
} = require('./hosted-demos-local-server.js');
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
assert.equal(config.installCommand, 'npm ci');
assert.equal(config.buildCommand, 'npm run build && npm run demo:hosted:build');
assert.equal(config.outputDirectory, 'hosted-demos-static-dist');
assert.deepEqual(config.redirects, [
  { source: '/', destination: '/full-vision/overview', permanent: false },
  { source: '/demo', destination: '/demo/today', permanent: false },
  { source: '/full-vision', destination: '/full-vision/overview', permanent: false },
]);
assert.deepEqual(config.rewrites, [
  { source: '/api/v1/:path*', destination: '/api/v1?__vercelApiPath=:path*' },
  { source: '/runtime', destination: '/runtime/index.html' },
  { source: '/runtime/:path*', destination: '/runtime/:path*' },
  { source: '/demo/:path*', destination: '/demo-frontend/index.html' },
  { source: '/full-vision/:path*', destination: '/full-vision-demo/index.html' },
]);
const apiRewrite = config.rewrites.find((rule) => rule.source === '/api/v1/:path*');
assert.deepEqual(apiRewrite, {
  source: '/api/v1/:path*',
  destination: '/api/v1?__vercelApiPath=:path*',
});
assert.equal(fs.existsSync(path.join(repositoryRoot, 'api/v1/index.ts')), true, 'Vercel API index function is required');
assert.equal(fs.existsSync(path.join(repositoryRoot, 'api/v1/[...path].ts')), true, 'Vercel API catch-all compatibility function is required');

const runtimeHeaderRules = config.headers.filter((rule) => rule.source === '/runtime' || rule.source.startsWith('/runtime/'));
assert.equal(runtimeHeaderRules.length, 2);
for (const rule of runtimeHeaderRules) {
  const headers = Object.fromEntries(rule.headers.map((header) => [header.key, header.value]));
  assert.equal(headers['Content-Security-Policy'], runtimeHeaders['Content-Security-Policy']);
  assert.equal(headers['Referrer-Policy'], runtimeHeaders['Referrer-Policy']);
  assert.equal(headers['X-Content-Type-Options'], runtimeHeaders['X-Content-Type-Options']);
  assert.equal(headers['X-Robots-Tag'], runtimeHeaders['X-Robots-Tag']);
  assert.equal(headers['Permissions-Policy'], runtimeHeaders['Permissions-Policy']);
}

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

    const runtimeResponse = await request(port, '/runtime');
    assert.equal(runtimeResponse.status, 200);
    assert.match(runtimeResponse.headers['content-type'], /^text\/html/);
    assert.match(runtimeResponse.body, /id="runtime-main"/);
    assert.equal(runtimeResponse.headers['content-security-policy'], runtimeHeaders['Content-Security-Policy']);
    assert.equal(runtimeResponse.headers['x-robots-tag'], runtimeHeaders['X-Robots-Tag']);

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

    for (const relativePath of [...legacyFiles, ...fullVisionFiles, ...runtimeFiles]) {
      if (relativePath.endsWith('index.html')) continue;
      const response = await request(port, `/${relativePath}`);
      assert.equal(response.status, 200, `Asset failed: ${relativePath}`);
      assert.match(response.headers['content-type'], relativePath.endsWith('.css') ? /^text\/css/ : /^text\/javascript/);
    }

    const runtimeHead = await request(port, '/runtime', 'HEAD');
    assert.equal(runtimeHead.status, 200);
    assert.match(runtimeHead.headers['content-type'], /^text\/html/);
    assert.equal(runtimeHead.body, '');
    assert.equal((await request(port, '/demo-frontend/not-present.js')).status, 404);
    assert.equal((await request(port, '/full-vision-demo/not-present.js')).status, 404);
    const runtimePost = await request(port, '/runtime', 'POST');
    assert.equal(runtimePost.status, 405);
    assert.equal(runtimePost.headers.allow, 'GET, HEAD');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }

  console.log(`Legacy routes: ${legacyRoutes.length}/5 PASS`);
  console.log(`Full-Vision routes: ${routes.length}/25 canonical, ${fullVisionAliases.length}/5 aliases PASS`);
  console.log('Combined static output, runtime headers and explicit Vercel API rewrite topology: PASS');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
