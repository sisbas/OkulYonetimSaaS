'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

const requiredRoutes = [
  '/demo/today',
  '/demo/schedule',
  '/demo/leave/LV-204',
  '/demo/attendance/session/AT-1204',
  '/demo/notifications',
];

for (const route of requiredRoutes) {
  assert(html.includes(route) || js.includes(route), `Missing demo route: ${route}`);
}

assert(html.includes('Demo Verisi'), 'Visible Demo Verisi label is missing from app shell.');
assert(js.includes('OKUL-DEMO-2026-07-21-v1'), 'Deterministic demo seed is missing.');
assert(js.includes('Demo Verisi'), 'Per-screen Demo Verisi label renderer is missing.');
assert(css.includes('.schedule-grid'), 'Schedule grid styling is missing.');
assert(css.includes('@media'), 'Responsive styling is missing.');
assert.doesNotMatch(js, /\bfetch\s*\(/, 'Real network fetch must not be used.');
assert.doesNotMatch(js, /XMLHttpRequest|axios|Authorization|Bearer\s/i, 'API/auth binding markers must not be present.');
assert.doesNotMatch(js, /localStorage|sessionStorage|document\.cookie/, 'Persistent browser storage must not be used.');
assert.doesNotMatch(js, /\/api\/v\d/i, 'Real API paths must not be used.');
assert.doesNotMatch(js, /parentPhone|parentEmail|guardianContact/, 'Real PII field names must not be rendered.');
assert(html.includes('/demo-frontend/styles.css') && html.includes('/demo-frontend/app.js'), 'Static assets are not linked.');
new Function(js);
console.log('Demo frontend smoke tests passed.');
console.log(`Routes verified: ${requiredRoutes.length}`);
console.log('Network/auth/permission binding: absent');
console.log('Visible demo labels: present');
