'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const host = '127.0.0.1';
const defaultPort = 4173;
const sourceRoot = __dirname;
const runtimeFiles = new Set([
  'index.html',
  'styles.css',
  'app.js',
  'conflict-engine.js',
  'demo-state.js',
]);
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

function sendFile(response, file) {
  const absolutePath = path.join(sourceRoot, file);
  response.writeHead(200, {
    'Content-Type': contentTypes[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': 'no-store',
    'X-Demo-Application': 'synthetic-static-prototype',
  });
  fs.createReadStream(absolutePath).pipe(response);
}

function createDemoServer() {
  return http.createServer((request, response) => {
    const method = request.method || 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end();
      return;
    }

    const pathname = new URL(request.url || '/', 'http://localhost').pathname;

    if (pathname === '/demo') {
      response.writeHead(307, { Location: '/demo/today', 'Cache-Control': 'no-store' });
      response.end();
      return;
    }

    if (pathname.startsWith('/demo/')) {
      sendFile(response, 'index.html');
      return;
    }

    if (pathname.startsWith('/demo-frontend/')) {
      const file = pathname.slice('/demo-frontend/'.length);
      if (runtimeFiles.has(file) && fs.existsSync(path.join(sourceRoot, file))) {
        sendFile(response, file);
        return;
      }
    }

    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end('Not Found');
  });
}

if (require.main === module) {
  const requestedPort = Number(process.argv[2] || defaultPort);
  if (!Number.isInteger(requestedPort) || requestedPort < 1 || requestedPort > 65535) {
    throw new Error('Port must be an integer between 1 and 65535.');
  }

  createDemoServer().listen(requestedPort, host, () => {
    console.log(`Static demo: http://${host}:${requestedPort}/demo/today`);
    console.log(`Node runtime: ${process.version}`);
    console.log('SPA deep-link fallback: enabled for /demo/*');
    console.log('External network dependency: none');
    console.log('Fixture reset: use the ↻ control in the top bar');
  });
}

module.exports = { createDemoServer };
