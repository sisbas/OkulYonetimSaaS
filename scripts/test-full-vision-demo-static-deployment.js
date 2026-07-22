'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { createServer, securityHeaders } = require('../full-vision-demo/local-server.js');
const { routes, legacyAliases } = require('../full-vision-demo/app-shell/route-manifest.js');

const root = path.resolve(__dirname, '..', 'full-vision-static-dist', 'full-vision-demo');

function request(port, pathname, method = 'GET') {
  return new Promise((resolve, reject) => {
    const request = require('node:http').request({ hostname: '127.0.0.1', port, path: pathname, method }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    request.on('error', reject);
    request.end();
  });
}

async function run() {
  const server = createServer({ root });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    const redirect = await request(port, '/full-vision');
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.location, '/full-vision/overview');
    assert.equal((await request(port, '/full-vision/')).status, 200);

    for (const route of routes) {
      const response = await request(port, route.samplePath);
      assert.equal(response.status, 200, `Deep link failed: ${route.samplePath}`);
      assert.match(response.headers['content-type'], /^text\/html/);
      assert.match(response.body, /id="app"/);
      assert.equal(response.headers['x-demo-application'], securityHeaders['X-Demo-Application']);
      assert.match(response.headers['content-security-policy'], /connect-src 'none'/);
    }

    const legacySamples = ['/full-vision/today', '/full-vision/schedule', '/full-vision/leave/D-LV-204', '/full-vision/attendance/session/D-AT-1204', '/full-vision/notifications'];
    assert.equal(legacySamples.length, legacyAliases.length);
    for (const pathname of legacySamples) {
      assert.equal((await request(port, pathname)).status, 200, `Legacy alias failed: ${pathname}`);
      assert.equal((await request(port, `${pathname}/`)).status, 200, `Trailing-slash alias failed: ${pathname}/`);
    }

    const css = await request(port, '/full-vision-demo/styles.css');
    const js = await request(port, '/full-vision-demo/app.js');
    assert.match(css.headers['content-type'], /^text\/css/);
    assert.match(js.headers['content-type'], /^text\/javascript/);
    assert.equal((await request(port, '/full-vision/overview', 'HEAD')).status, 200);
    assert.equal((await request(port, '/full-vision-demo/missing.js')).status, 404);
    assert.equal((await request(port, '/full-vision-demo/%E0%A4%A')).status, 404);
    assert.equal((await request(port, '/full-vision/overview')).status, 200, 'Malformed URL must not terminate the server.');
    assert.equal((await request(port, '/full-vision/overview', 'POST')).status, 405);
    console.log(`HTTP routes: ${routes.length}/25 canonical, ${legacySamples.length}/5 legacy aliases`);
    console.log('GET/HEAD, MIME, CSP, 404 and 405: PASS');
    console.log('Serverless functions: 0');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
