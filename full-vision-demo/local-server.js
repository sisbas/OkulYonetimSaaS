'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const sourceRoot = __dirname;
const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const securityHeaders = {
  'Content-Security-Policy': "default-src 'self'; connect-src 'none'; img-src 'self' data:; style-src 'self'; script-src 'self'; form-action 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Demo-Application': 'full-vision-synthetic-static-prototype',
};

function safeRuntimePath(urlPath, root = sourceRoot) {
  if (!urlPath.startsWith('/full-vision-demo/')) return null;
  let relative;
  try {
    relative = decodeURIComponent(urlPath.slice('/full-vision-demo/'.length));
  } catch {
    return null;
  }
  const resolved = path.resolve(root, relative);
  return resolved.startsWith(`${path.resolve(root)}${path.sep}`) ? resolved : null;
}

function createServer(options = {}) {
  const root = options.root || sourceRoot;
  return http.createServer((request, response) => {
    Object.entries(securityHeaders).forEach(([key, value]) => response.setHeader(key, value));
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Method not allowed');
      return;
    }
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/full-vision') {
      response.writeHead(302, { Location: '/full-vision/overview' });
      response.end();
      return;
    }
    const asset = safeRuntimePath(url.pathname, root);
    const filePath = asset || (url.pathname.startsWith('/full-vision/') ? path.join(root, 'index.html') : null);
    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    response.writeHead(200, { 'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream' });
    if (request.method === 'HEAD') response.end();
    else fs.createReadStream(filePath).pipe(response);
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 4174);
  createServer().listen(port, '127.0.0.1', () => console.log(`Full-vision demo: http://127.0.0.1:${port}/full-vision/overview`));
}

module.exports = { createServer, safeRuntimePath, securityHeaders };
