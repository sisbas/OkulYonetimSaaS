'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const demoRoot = path.join(root, 'demo-frontend');
const demoEntry = path.join(demoRoot, 'index.html');
const port = Number(process.env.PORT || 3000);
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function sendText(response, statusCode, message) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(message);
}

function sendFile(response, filePath) {
  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      sendText(response, 404, 'Not found');
      return;
    }

    response.writeHead(200, {
      'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    fs.createReadStream(filePath).pipe(response);
  });
}

function resolveDemoAsset(requestPath) {
  const prefix = '/demo-frontend/';
  if (!requestPath.startsWith(prefix)) return null;

  const relativePath = requestPath.slice(prefix.length);
  if (!relativePath) return null;

  const filePath = path.resolve(demoRoot, relativePath);
  if (!filePath.startsWith(`${demoRoot}${path.sep}`)) return null;

  return filePath;
}

const server = http.createServer((request, response) => {
  let requestPath;
  try {
    requestPath = new URL(request.url, `http://${request.headers.host || 'localhost'}`).pathname;
  } catch {
    sendText(response, 400, 'Invalid request');
    return;
  }

  if (requestPath === '/') {
    response.writeHead(302, { Location: '/demo/today', 'Cache-Control': 'no-store' });
    response.end();
    return;
  }

  const isDemoRoute = requestPath === '/demo' || requestPath.startsWith('/demo/');
  if (isDemoRoute && !path.extname(requestPath)) {
    sendFile(response, demoEntry);
    return;
  }

  const assetPath = resolveDemoAsset(requestPath);
  if (assetPath) {
    sendFile(response, assetPath);
    return;
  }

  sendText(response, 404, 'Not found');
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Static demo server listening on port ${port}`);
});
