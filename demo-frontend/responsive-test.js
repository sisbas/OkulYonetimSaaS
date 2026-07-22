'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

assert(css.includes('@media (max-width: 820px)'), 'Tablet navigation breakpoint must be approximately 820px.');
assert(css.includes('overflow-x: clip'), 'Global horizontal overflow guard is missing.');
assert.match(css, /\.schedule-wrap\s*\{[^}]*overflow-x:\s*auto/s, 'Schedule grid must use local horizontal scroll.');
assert(css.includes('overscroll-behavior-inline: contain'), 'Controlled local scroll containment is missing.');
assert(css.includes('.schedule-scroll-hint'), 'Schedule scroll discoverability hint is missing.');
assert(js.includes('Program tablosunu yatay kaydırarak'), 'Visible schedule scroll instruction is missing.');
assert(js.includes('Programı doğrula · Simülasyon'), 'Schedule primary CTA must identify simulation behavior.');
assert(js.includes('Gerçek işlem yapılmadı'), 'Real-action disclaimer must remain visible in demo flows.');
assert(js.includes('Durum: Program çakışması'), 'Conflict states must include text labels.');
assert(js.includes('Durum: İzin etkisi var'), 'Leave state must include a text label.');
assert(js.includes('aria-pressed'), 'Attendance segmented controls must preserve keyboard/state semantics.');
assert(js.includes('Durum: ${label}'), 'Notification state must include a text label.');
assert(css.includes('button:focus-visible'), 'Visible focus styling must be preserved.');
assert(js.includes("event.key === 'Escape'"), 'Escape modal close behavior must be preserved.');
assert(js.includes("event.key !== 'Tab'"), 'Modal keyboard focus loop must be present.');
assert(html.includes('aria-modal="true"'), 'Modal accessibility semantics must remain.');
assert(html.includes('Demo Verisi'), 'Global Demo Verisi label must remain visible.');
assert.doesNotMatch(`${html}\n${js}`, /parentPhone|parentEmail|guardianContact|@example\.(com|org)/i, 'Real or mock contact-field PII markers are not allowed.');

console.log('Responsive release-candidate static checks passed.');
console.log('Viewport targets: 1440x900, 1024x768, 768x1024.');
console.log('Global overflow guard, 820px navigation, local grid scroll, state labels, demo disclaimers and modal accessibility verified.');
