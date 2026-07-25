'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { validateSchedule } = require('./conflict-engine.js');
const { SEED, canMutateSchedule, createInitialState } = require('./demo-state.js');

const root = __dirname;
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const engineSource = fs.readFileSync(path.join(root, 'conflict-engine.js'), 'utf8');
const stateSource = fs.readFileSync(path.join(root, 'demo-state.js'), 'utf8');

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

function event(overrides) {
  return {
    id: 'A', day: 'Pazartesi', start: '09:30', end: '10:50', course: 'Demo A',
    studentGroup: 'G1', teacher: 'T1', room: 'R1', ...overrides,
  };
}

const teacherOverlap = validateSchedule([
  event({ id: 'T-A', studentGroup: 'G1', room: 'R1' }),
  event({ id: 'T-B', course: 'Demo B', studentGroup: 'G2', room: 'R2' }),
]);
assert.equal(teacherOverlap.status, 'invalid', 'Unresolved teacher overlap cannot become valid.');
assert.equal(teacherOverlap.hardConflictCount, 1, 'Unresolved teacher overlap cannot produce zero-conflict success.');
assert.equal(teacherOverlap.conflicts[0].reasonCode, 'TEACHER_OVERLAP');

const studentGroupOverlap = validateSchedule([
  event({ id: 'G-A', teacher: 'T1', room: 'R1' }),
  event({ id: 'G-B', course: 'Demo B', teacher: 'T2', room: 'R2' }),
]);
assert.equal(studentGroupOverlap.status, 'invalid', 'Unresolved StudentGroup overlap cannot become valid.');
assert.equal(studentGroupOverlap.hardConflictCount, 1, 'Unresolved StudentGroup overlap cannot produce zero-conflict success.');
assert.equal(studentGroupOverlap.conflicts[0].reasonCode, 'STUDENT_GROUP_OVERLAP');

const roomOverlap = validateSchedule([
  event({ id: 'R-A', teacher: 'T1', studentGroup: 'G1' }),
  event({ id: 'R-B', course: 'Demo B', teacher: 'T2', studentGroup: 'G2' }),
]);
assert.equal(roomOverlap.status, 'invalid', 'Unresolved Room overlap cannot become valid.');
assert.equal(roomOverlap.hardConflictCount, 1, 'Unresolved Room overlap cannot produce zero-conflict success.');
assert.equal(roomOverlap.conflicts[0].reasonCode, 'ROOM_OVERLAP');

const initial = createInitialState(validateSchedule);
assert.equal(initial.validation.hardConflictCount, 3, 'Initial fixture must contain three deterministic hard conflicts.');
assert.deepEqual(initial.validation.summaryByType, { teacher: 1, studentGroup: 1, room: 1 });

initial.events.find((item) => item.id === 'EV5').teacher = 'Demo Öğretmen F';
let result = validateSchedule(initial.events);
assert.equal(result.hardConflictCount, 2, 'Conflict count must decrease after one conflict is resolved.');

initial.events.find((item) => item.id === 'EV7').studentGroup = '12-SAY-2';
result = validateSchedule(initial.events);
assert.equal(result.hardConflictCount, 1, 'Conflict count must continue decreasing as conflicts are resolved.');

initial.events.find((item) => item.id === 'EV9').room = 'D7';
result = validateSchedule(initial.events);
assert.equal(result.hardConflictCount, 0, 'The final resolved conflict must reduce the count to zero.');
assert.equal(result.status, 'valid', 'Validation becomes valid only after every hard conflict is resolved.');

const reset = createInitialState(validateSchedule);
assert.equal(reset.validation.hardConflictCount, 3, 'Reset must restore the initial fixture conflict state.');
assert.equal(reset.events.find((item) => item.id === 'EV5').teacher, 'Demo Öğretmen A');
assert.equal(canMutateSchedule('published'), false, 'Published view must not enable mutation.');
assert.equal(canMutateSchedule('draft'), true, 'Draft view must retain demo-only mutation.');

assert(html.includes('Demo Verisi'), 'Visible Demo Verisi label is missing from app shell.');
assert.equal(SEED, 'OKUL-DEMO-2026-07-21-v1', 'Deterministic demo seed changed unexpectedly.');
assert(js.includes('Demo Verisi'), 'Per-screen Demo Verisi label renderer is missing.');
assert(js.includes('SCHEDULE_HARD_CONFLICTS_PRESENT'), 'Schedule hard-conflict state is missing.');
assert(js.includes('Çakışmayı düzenle'), 'Conflict edit action is missing.');
assert(css.includes('.schedule-grid'), 'Schedule grid styling is missing.');
assert(css.includes('@media'), 'Responsive styling is missing.');
assert(html.includes('/demo-frontend/conflict-engine.js'), 'Conflict engine is not loaded.');
assert(html.includes('/demo-frontend/demo-state.js'), 'Demo state fixture is not loaded.');

const allRuntimeSource = `${js}\n${engineSource}\n${stateSource}`;
assert.doesNotMatch(allRuntimeSource, /\bfetch\s*\(/, 'Real network fetch must not be used.');
assert.doesNotMatch(allRuntimeSource, /XMLHttpRequest|axios|Authorization|Bearer\s/i, 'API/auth binding markers must not be present.');
assert.doesNotMatch(allRuntimeSource, /localStorage|sessionStorage|document\.cookie/, 'Persistent browser storage must not be used.');
assert.doesNotMatch(allRuntimeSource, /\/api\/v\d/i, 'Real API paths must not be used.');
assert.doesNotMatch(allRuntimeSource, /parentPhone|parentEmail|guardianContact/, 'Real PII field names must not be rendered.');
assert(html.includes('/demo-frontend/styles.css') && html.includes('/demo-frontend/app.js'), 'Static assets are not linked.');
new Function(engineSource);
new Function(stateSource);
new Function(js);
console.log('Demo frontend smoke tests passed.');
console.log(`Routes verified: ${requiredRoutes.length}`);
console.log('Conflict assertions passed: teacher, StudentGroup, Room, decrement, zero, reset, published read-only.');
console.log('Network/auth/permission binding: absent');
console.log('Visible demo labels: present');
