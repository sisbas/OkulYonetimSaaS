'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const runtimeManifest = require('./hosted-demos-runtime-manifest.js');

const defaultRoot = path.resolve(__dirname, '..', 'hosted-demos-static-dist');
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};
const legacyFiles = new Set(runtimeManifest.legacyFiles);
const fullVisionFiles = new Set(runtimeManifest.fullVisionFiles);
const fullVisionHeaders = {
  'Content-Security-Policy': "default-src 'self'; connect-src 'none'; img-src 'self' data:; style-src 'self'; script-src 'self'; form-action 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'X-Demo-Application': 'full-vision-synthetic-static-prototype',
};

function decodePathname(pathname) {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return null;
  }
}

function staticFile(pathname) {
  const decoded = decodePathname(pathname);
  if (!decoded) return null;
  const relativePath = decoded.replace(/^\//, '');
  return legacyFiles.has(relativePath) || fullVisionFiles.has(relativePath) ? relativePath : null;
}

function createHostedDemosServer(options = {}) {
  const root = options.root || defaultRoot;
  return http.createServer((request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Method not allowed');
      return;
    }

    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/') {
      response.writeHead(307, { Location: '/full-vision/overview', 'Cache-Control': 'no-store' });
      response.end();
      return;
    }
    if (url.pathname === '/demo') {
      response.writeHead(307, { Location: '/demo/today', 'Cache-Control': 'no-store' });
      response.end();
      return;
    }
    if (url.pathname === '/full-vision') {
      response.writeHead(307, { Location: '/full-vision/overview', 'Cache-Control': 'no-store' });
      response.end();
      return;
    }

    const fullVision = url.pathname.startsWith('/full-vision/') || url.pathname.startsWith('/full-vision-demo/');
    if (fullVision) Object.entries(fullVisionHeaders).forEach(([key, value]) => response.setHeader(key, value));
    else if (url.pathname.startsWith('/demo-frontend/')) response.setHeader('X-Demo-Application', 'synthetic-static-prototype');

    const asset = staticFile(url.pathname);
    const relativePath = asset
      || (url.pathname.startsWith('/demo/') ? 'demo-frontend/index.html' : null)
      || (url.pathname.startsWith('/full-vision/') ? 'full-vision-demo/index.html' : null);
    const filePath = relativePath ? path.join(root, relativePath) : null;

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
  const port = Number(process.env.PORT || 4175);
  createHostedDemosServer().listen(port, '127.0.0.1', () => {
    console.log(`Legacy demo: http://127.0.0.1:${port}/demo/today`);
    console.log(`Full-Vision demo: http://127.0.0.1:${port}/full-vision/overview`);
  });
}

module.exports = { createHostedDemosServer, fullVisionHeaders, legacyFiles, fullVisionFiles };
