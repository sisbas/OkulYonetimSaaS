'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  createHostedDemosServer,
  runtimeHeaders,
  runtimeFiles,
} = require('./hosted-demos-local-server.js');

const repositoryRoot = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'vercel.json'), 'utf8'));
const legacyRoutes = [
  '/demo/today',
  '/demo/schedule',
  '/demo/leave/LV-204',
  '/demo/attendance/session/AT-1204',
  '/demo/notifications',
];
const fullVisionRoutes = [
  '/full-vision/overview',
  '/full-vision/today',
  '/full-vision/schedule',
  '/full-vision/leave/LV-204',
  '/full-vision/attendance/session/AT-1204',
  '/full-vision/notifications',
];

assert.equal(config.framework, null);
assert.equal(config.installCommand, 'node --version');
assert.equal(config.buildCommand, 'node scripts/build-hosted-runtime-static.js');
assert.equal(config.outputDirectory, 'hosted-runtime-static-dist');
assert.deepEqual(config.redirects, [
  { source: '/', destination: '/runtime', permanent: false },
  { source: '/demo', destination: '/runtime', permanent: false },
  { source: '/full-vision', destination: '/runtime', permanent: false },
]);
assert.deepEqual(config.rewrites, [
  { source: '/runtime', destination: '/runtime/index.html' },
  { source: '/runtime/:path*', destination: '/runtime/:path*' },
  { source: '/demo/:path*', destination: '/runtime/index.html' },
  { source: '/full-vision/:path*', destination: '/runtime/index.html' },
]);
assert.equal(Object.prototype.hasOwnProperty.call(config, 'functions'), false);
assert.equal(Object.prototype.hasOwnProperty.call(config, 'builds'), false);
assert.equal(config.rewrites.some((rule) => rule.source.includes('/api')), false);
assert.equal(JSON.stringify(config).includes('demo-frontend/index.html'), false);
assert.equal(JSON.stringify(config).includes('full-vision-demo/index.html'), false);

const runtimeHeaderRules = config.headers.filter((rule) => (
  rule.source === '/runtime'
  || rule.source.startsWith('/runtime/')
  || rule.source.startsWith('/demo/')
  || rule.source.startsWith('/full-vision/')
));
assert.equal(runtimeHeaderRules.length, 4);
for (const rule of runtimeHeaderRules) {
  const headers = Object.fromEntries(rule.headers.map((header) => [header.key, header.value]));
  assert.equal(headers['Content-Security-Policy'], runtimeHeaders['Content-Security-Policy']);
  assert.equal(headers['Referrer-Policy'], runtimeHeaders['Referrer-Policy']);
  assert.equal(headers['X-Content-Type-Options'], runtimeHeaders['X-Content-Type-Options']);
  assert.equal(headers['X-Robots-Tag'], runtimeHeaders['X-Robots-Tag']);
  assert.equal(headers['Permissions-Policy'], runtimeHeaders['Permissions-Policy']);
  assert.equal(Object.prototype.hasOwnProperty.call(headers, 'X-Demo-Application'), false);
}

execFileSync(process.execPath, [path.join(__dirname, 'build-hosted-runtime-static.js')], { cwd: repositoryRoot, stdio: 'inherit' });

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
    for (const pathname of ['/', '/demo', '/full-vision']) {
      const redirect = await request(port, pathname);
      assert.equal(redirect.status, 307, `Redirect failed: ${pathname}`);
      assert.equal(redirect.headers.location, '/runtime');
    }

    const runtimeResponse = await request(port, '/runtime');
    assert.equal(runtimeResponse.status, 200);
    assert.match(runtimeResponse.headers['content-type'], /^text\/html/);
    assert.match(runtimeResponse.body, /id="runtime-main"/);
    assert.doesNotMatch(runtimeResponse.body, /id="demoApp"/);
    assert.doesNotMatch(runtimeResponse.body, /id="app"/);
    assert.equal(runtimeResponse.headers['content-security-policy'], runtimeHeaders['Content-Security-Policy']);
    assert.equal(runtimeResponse.headers['x-robots-tag'], runtimeHeaders['X-Robots-Tag']);
    assert.equal(runtimeResponse.headers['x-demo-application'], undefined);

    for (const pathname of [...legacyRoutes, ...fullVisionRoutes]) {
      const response = await request(port, pathname);
      assert.equal(response.status, 200, `Runtime route failed: ${pathname}`);
      assert.match(response.headers['content-type'], /^text\/html/);
      assert.match(response.body, /id="runtime-main"/);
      assert.doesNotMatch(response.body, /id="demoApp"/);
      assert.doesNotMatch(response.body, /id="app"/);
      assert.equal(response.headers['x-demo-application'], undefined);
    }

    for (const relativePath of runtimeFiles) {
      if (relativePath.endsWith('index.html')) continue;
      const response = await request(port, `/${relativePath}`);
      assert.equal(response.status, 200, `Asset failed: ${relativePath}`);
      assert.match(response.headers['content-type'], relativePath.endsWith('.css') ? /^text\/css/ : /^text\/javascript/);
    }

    assert.equal((await request(port, '/demo-frontend/index.html')).status, 404);
    assert.equal((await request(port, '/full-vision-demo/index.html')).status, 404);
    assert.equal((await request(port, '/full-vision-demo/app.js')).status, 404);

    const runtimeHead = await request(port, '/runtime', 'HEAD');
    assert.equal(runtimeHead.status, 200);
    assert.match(runtimeHead.headers['content-type'], /^text\/html/);
    assert.equal(runtimeHead.body, '');

    for (const pathname of ['/runtime', '/demo/today', '/full-vision/overview']) {
      const post = await request(port, pathname, 'POST');
      assert.equal(post.status, 405, `POST did not fail: ${pathname}`);
      assert.equal(post.headers.allow, 'GET, HEAD');
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }

  console.log(`Runtime files: ${runtimeFiles.size}/3 PASS`);
  console.log(`Legacy demo routes now render runtime: ${legacyRoutes.length}/5 PASS`);
  console.log(`Full-Vision routes now render runtime: ${fullVisionRoutes.length}/6 PASS`);
  console.log('Hosted runtime output, redirects, rewrites, MIME, headers, 404 and 405: PASS');
  console.log('Serverless functions: 0');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
