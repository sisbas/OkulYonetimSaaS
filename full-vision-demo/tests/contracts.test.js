'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const routesModule = require('../app-shell/route-manifest.js');
const claims = require('../app-shell/claim-manifest.js');
const scenarios = require('../app-shell/scenario-manifest.js');
const fixtures = require('../fixtures/fixture-graph.js');
const stateModule = require('../app-shell/state.js');

const root = path.resolve(__dirname, '..');
const runtimeFiles = [
  'app.js', 'app-shell/route-manifest.js', 'app-shell/scenario-manifest.js', 'app-shell/state.js',
  'fixtures/fixture-graph.js', 'shared/ui.js', 'phases/phase-1/operations.js',
];

test('route manifest freezes 25 canonical patterns and 21 product screen families', () => {
  const { routes, legacyAliases, matchRoute } = routesModule;
  const graph = fixtures.createFixtureGraph();
  const fixtureAt = (fixturePath) => fixturePath.split('.').reduce((value, key) => value == null ? undefined : value[key], graph);
  assert.equal(routes.length, 25);
  assert.equal(new Set(routes.map((route) => route.id)).size, 25);
  assert.equal(new Set(routes.map((route) => route.path)).size, 25);
  assert.equal(new Set(routes.filter((route) => route.phase !== 'global').map((route) => route.screenFamily)).size, 21);
  assert.equal(legacyAliases.length, 5);
  for (const route of routes) {
    for (const field of ['id', 'path', 'samplePath', 'phase', 'priority', 'maturity', 'componentId', 'title', 'fixture', 'claimSet', 'implementationStatus']) assert.ok(route[field], `${route.id} missing ${field}`);
    assert.ok(route.personas.length > 0, `${route.id} requires at least one persona`);
    assert.equal(matchRoute(route.samplePath).route.id, route.id, `${route.id} sample path does not resolve`);
    assert.ok(claims.sets[route.claimSet], `${route.id} references an unknown claim set`);
    assert.notEqual(fixtureAt(route.fixture), undefined, `${route.id} references a missing fixture path: ${route.fixture}`);
  }
  assert.equal(routes.filter((route) => route.implementationStatus === 'gate2-high-fidelity').length, 8);
  const notFound = matchRoute('/full-vision/unknown-screen');
  assert.equal(notFound.notFound, true);
  assert.equal(notFound.pathname, '/full-vision/unknown-screen');
});

test('legacy aliases canonicalize without duplicate screens', () => {
  assert.equal(routesModule.normalizeLegacyPath('/full-vision/'), '/full-vision/overview');
  assert.equal(routesModule.normalizeLegacyPath('/full-vision/today'), '/full-vision/f1/operations');
  assert.equal(routesModule.normalizeLegacyPath('/full-vision/today/'), '/full-vision/f1/operations');
  assert.equal(routesModule.normalizeLegacyPath('/full-vision/schedule'), '/full-vision/f1/schedule');
  assert.equal(routesModule.normalizeLegacyPath('/full-vision/schedule/'), '/full-vision/f1/schedule');
  assert.equal(routesModule.normalizeLegacyPath('/full-vision/leave/D-LV-204'), '/full-vision/f1/leaves/D-LV-204');
  assert.equal(routesModule.normalizeLegacyPath('/full-vision/leave/LV-204'), '/full-vision/f1/leaves/D-LV-204');
  assert.equal(routesModule.normalizeLegacyPath('/full-vision/attendance/session/D-AT-1204'), '/full-vision/f1/attendance/D-AT-1204');
  assert.equal(routesModule.normalizeLegacyPath('/full-vision/attendance/session/AT-1204'), '/full-vision/f1/attendance/D-AT-1204');
  assert.equal(routesModule.normalizeLegacyPath('/full-vision/notifications'), '/full-vision/f1/notifications');
  assert.equal(routesModule.normalizeLegacyPath('/full-vision/notifications/'), '/full-vision/f1/notifications');
});

test('scenario steps reference canonical routes and the GATE 2 operations slice is complete', () => {
  const routeIds = new Set(routesModule.routes.map((route) => route.id));
  const operations = scenarios.scenarios.operations;
  assert.equal(operations.steps.length, 6);
  operations.steps.forEach((step, index) => {
    const url = new URL(step.path, 'http://demo.local');
    const matched = routesModule.matchRoute(url.pathname);
    assert.ok(routeIds.has(step.routeId));
    assert.equal(matched.route.id, step.routeId);
    for (const [key, value] of url.searchParams.entries()) {
      assert.ok(matched.route.allowedQuery[key]?.includes(value), `${step.routeId} does not allow ${key}=${value}`);
    }
    url.searchParams.set('scenario', operations.id);
    url.searchParams.set('step', String(index + 1));
    assert.equal(routesModule.sanitizeQuery(matched.route, url.searchParams).toString(), url.searchParams.toString());
  });
  let routeStepCombinations = 0;
  routesModule.routes.forEach((route) => {
    for (let step = 1; step <= operations.steps.length; step += 1) {
      const sanitized = routesModule.sanitizeQuery(route, `?scenario=${operations.id}&step=${step}`);
      const shouldMatch = Boolean(route.presentationSteps[operations.id]?.[String(step)]);
      assert.equal(sanitized.get('scenario') === operations.id && sanitized.get('step') === String(step), shouldMatch, `${route.id} / step ${step} mismatch`);
      routeStepCombinations += 1;
    }
  });
  assert.equal(routeStepCombinations, 150);
});

test('route query allowlists preserve only route-consistent presentation state', () => {
  const schedule = routesModule.routes.find((route) => route.id === 'f1-schedule');
  const scheduleQuery = routesModule.sanitizeQuery(schedule, '?view=week&scenario=operations&step=3&unsafe=yes');
  assert.equal(scheduleQuery.toString(), 'view=lifecycle&scenario=operations&step=3');
  assert.equal(routesModule.sanitizeQuery(schedule, '?scenario=operations&step=2').toString(), '');

  const operations = routesModule.routes.find((route) => route.id === 'f1-operations');
  const completedQuery = routesModule.sanitizeQuery(operations, '?status=complete&scenario=operations&step=6');
  assert.equal(completedQuery.toString(), 'status=complete&scenario=operations&step=6');
  assert.equal(routesModule.sanitizeQuery(operations, '?status=published&step=99').toString(), '');
  assert.equal(routesModule.sanitizeQuery(operations, '?scenario=operations&step=99').toString(), '');
  assert.equal(routesModule.sanitizeQuery(operations, '?status=complete&scenario=operations&step=1').toString(), 'scenario=operations&step=1');
  assert.equal(routesModule.sanitizeQuery(operations, '?scenario=operations&step=1&step=6&status=complete').toString(), 'scenario=operations&step=6&status=complete');

  const notifications = routesModule.routes.find((route) => route.id === 'f1-notifications');
  assert.equal(routesModule.sanitizeQuery(notifications, '?scenario=operations&step=2').toString(), '');
});

test('fixture graph is fully synthetic and deterministic', () => {
  const first = fixtures.createFixtureGraph();
  const second = fixtures.createFixtureGraph();
  assert.deepEqual(first, second);
  assert.equal(first.meta.seed, 'OKUL-FULL-VISION-2026-07-21-v1');
  assert.equal(first.meta.fixedClock, '2026-07-21T09:00:00+03:00');
  assert.equal(first.meta.synthetic, true);
  assert.equal(first.organization.name, 'Demo Eğitim Kurumu');
  assert.equal(first.vision.precomputed, true);
  assert.equal(first.vision.isPrediction, false);
  assert.equal(first.integrations.networkCall, false);
  assert.equal(first.operations.leaves[0].durationKind, 'hourly');
  assert.equal(first.operations.leaves[0].reasonCode, 'administrative');
  assert.equal(first.operations.leaves[0].coveragePolicy, 'manager_may_approve_with_open_lessons');
  assert.equal(first.operations.schedule.studio.placedLessons, 47);
  assert.equal(first.operations.schedule.studio.requestedLessons, 48);
  assert.equal(first.operations.schedule.studio.stages.length, 3);
  assert.equal(first.operations.schedule.studio.diagnostics.classConstraints.length, 2);
  assert.equal(first.operations.schedule.studio.diagnostics.teacherConstraints.length, 2);

  function walk(value, key) {
    if (Array.isArray(value)) return value.forEach((item) => walk(item, key));
    if (value && typeof value === 'object') return Object.entries(value).forEach(([childKey, child]) => walk(child, childKey));
    if ((key === 'id' || key.endsWith('Id')) && value != null) assert.match(String(value), /^D-/, `Non-synthetic entity ID: ${value}`);
  }
  walk({ organization: first.organization, coreDefinitions: first.coreDefinitions, operations: first.operations }, 'root');

  const teacherIds = new Set(first.coreDefinitions.teachers.map((item) => item.id));
  const groupIds = new Set(first.coreDefinitions.groups.map((item) => item.id));
  const roomIds = new Set(first.coreDefinitions.rooms.map((item) => item.id));
  const lessonIds = new Set(first.operations.daily.lessons.map((item) => item.id));
  const studentIds = new Set(first.operations.attendance.flatMap((session) => session.students.map((item) => item.id)));
  first.operations.daily.lessons.forEach((lesson) => {
    assert.ok(teacherIds.has(lesson.teacherId));
    assert.ok(groupIds.has(lesson.groupId));
    assert.ok(roomIds.has(lesson.roomId));
  });
  first.operations.leaves.forEach((leave) => {
    assert.ok(teacherIds.has(leave.requesterId));
    leave.affectedLessonIds.forEach((lessonId) => assert.ok(lessonIds.has(lessonId)));
    Object.values(leave.candidatesByLesson).flat().forEach((teacherId) => assert.ok(teacherIds.has(teacherId)));
  });
  first.operations.attendance.forEach((session) => assert.ok(lessonIds.has(session.lessonId)));
  first.operations.notifications.forEach((notification) => assert.ok(studentIds.has(notification.studentId)));
});

test('state reducer blocks invalid actions and resets exactly', () => {
  const { ACTIONS, createInitialState, reduce } = stateModule;
  const initial = createInitialState();
  assert.equal(initial.leave.coverageStatus, 'unresolved');
  assert.deepEqual(initial.schedule.openLessonIds, ['D-SE-301', 'D-SE-302', 'D-SE-303']);
  const uncoveredApproval = reduce(initial, { type: ACTIONS.APPROVE_LEAVE_DEMO });
  assert.equal(uncoveredApproval.leave.status, 'approved_demo', 'Manager may approve while lesson coverage stays open');
  assert.equal(uncoveredApproval.leave.coverageStatus, 'unresolved');
  assert.equal(uncoveredApproval.schedule.previewStatus, 'ready');
  assert.deepEqual(uncoveredApproval.schedule.openLessonIds, ['D-SE-301', 'D-SE-302', 'D-SE-303']);
  const acceptedUncovered = reduce(uncoveredApproval, { type: ACTIONS.ACCEPT_SCHEDULE_PREVIEW });
  assert.deepEqual(acceptedUncovered.schedule.acceptedLessonIds, []);
  assert.deepEqual(acceptedUncovered.schedule.openLessonIds, ['D-SE-301', 'D-SE-302', 'D-SE-303']);
  assert.deepEqual(reduce(initial, { type: ACTIONS.SELECT_SUBSTITUTE, lessonId: 'D-SE-301', teacherId: 'D-T-044' }), initial, 'Unavailable substitute cannot be selected');
  assert.equal(reduce(initial, { type: ACTIONS.SET_ATTENDANCE, studentId: 'D-S-004', status: 'late' }), initial, 'Attendance cannot start before schedule acceptance');
  assert.equal(reduce(initial, { type: ACTIONS.SIMULATE_NOTIFICATION, notificationId: 'D-NT-034' }), initial, 'Notification cannot start before attendance lock');

  let state = initial;
  state = reduce(state, { type: ACTIONS.SELECT_SUBSTITUTE, lessonId: 'D-SE-301', teacherId: 'D-T-021' });
  assert.equal(state.leave.coverageStatus, 'partially_covered');
  state = reduce(state, { type: ACTIONS.SELECT_SUBSTITUTE, lessonId: 'D-SE-302', teacherId: 'D-T-026' });
  state = reduce(state, { type: ACTIONS.SELECT_SUBSTITUTE, lessonId: 'D-SE-303', teacherId: 'D-T-021' });
  assert.equal(state.leave.coverageStatus, 'covered');
  state = reduce(state, { type: ACTIONS.APPROVE_LEAVE_DEMO });
  assert.equal(state.leave.status, 'approved_demo');
  assert.equal(state.leave.coverageStatus, 'covered');
  assert.equal(state.schedule.previewStatus, 'ready');
  assert.deepEqual(state.schedule.openLessonIds, []);
  assert.equal(reduce(state, { type: ACTIONS.APPROVE_LEAVE_DEMO }), state, 'Leave approval is idempotent');
  assert.equal(reduce(state, { type: ACTIONS.SELECT_SUBSTITUTE, lessonId: 'D-SE-301', teacherId: 'D-T-021' }), state, 'Finalized leave cannot be mutated');
  state = reduce(state, { type: ACTIONS.ACCEPT_SCHEDULE_PREVIEW });
  assert.equal(state.schedule.previewStatus, 'accepted_demo');
  assert.deepEqual(state.schedule.acceptedLessonIds, ['D-SE-301', 'D-SE-302', 'D-SE-303']);
  assert.equal(reduce(state, { type: ACTIONS.ACCEPT_SCHEDULE_PREVIEW }), state, 'Schedule acceptance is idempotent');
  assert.deepEqual(reduce(state, { type: ACTIONS.LOCK_ATTENDANCE_DEMO }), state, 'Incomplete attendance cannot be locked');
  state = reduce(state, { type: ACTIONS.SET_ATTENDANCE, studentId: 'D-S-004', status: 'late' });
  state = reduce(state, { type: ACTIONS.LOCK_ATTENDANCE_DEMO });
  assert.equal(state.attendance.locked, true);
  state = reduce(state, { type: ACTIONS.SIMULATE_NOTIFICATION, notificationId: 'D-NT-035' });
  assert.equal(state.notifications['D-NT-035'], 'blocked', 'Blocked channel cannot be simulated');
  state = reduce(state, { type: ACTIONS.SIMULATE_NOTIFICATION, notificationId: 'D-NT-034' });
  assert.equal(state.notifications['D-NT-034'], 'simulated');
  const completed = state;
  const scheduleReset = reduce(completed, { type: ACTIONS.RESET_SCREEN, screen: 'schedule' });
  assert.equal(scheduleReset.schedule.previewStatus, 'ready');
  assert.equal(scheduleReset.attendance.locked, false);
  assert.equal(scheduleReset.notifications['D-NT-034'], 'pending');
  assert.ok(scheduleReset.auditTrail.every((entry) => ![ACTIONS.ACCEPT_SCHEDULE_PREVIEW, ACTIONS.LOCK_ATTENDANCE_DEMO, ACTIONS.SIMULATE_NOTIFICATION].includes(entry.action)));
  const leaveReset = reduce(completed, { type: ACTIONS.RESET_SCREEN, screen: 'leave' });
  assert.deepEqual(leaveReset, initial);
  assert.deepEqual(reduce(state, { type: ACTIONS.RESET_ALL }), initial);
});

test('scenario hard-refresh snapshots replay deterministically', () => {
  const step3a = stateModule.createStateForScenarioStep(3);
  const step3b = stateModule.createStateForScenarioStep(3);
  assert.deepEqual(step3a, step3b);
  assert.equal(step3a.leave.status, 'approved_demo');
  assert.equal(step3a.schedule.previewStatus, 'ready');
  const step5 = stateModule.createStateForScenarioStep(5);
  assert.equal(step5.schedule.previewStatus, 'accepted_demo');
  assert.equal(step5.attendance.locked, true);
  const step6 = stateModule.createStateForScenarioStep(6);
  assert.equal(step6.notifications['D-NT-034'], 'simulated');
});

test('runtime excludes network, auth, storage, randomness and real PII', () => {
  const source = runtimeFiles.map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
  const forbiddenCapabilities = [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /EventSource/, /sendBeacon/, /axios/i, /\/api\//i, /Authorization/, /Bearer\s/, /document\.cookie/, /localStorage/, /sessionStorage/, /indexedDB/, /serviceWorker/, /navigator\.credentials/, /Math\.random/, /Date\.now/, /crypto\.randomUUID/];
  forbiddenCapabilities.forEach((pattern) => assert.doesNotMatch(source, pattern));
  const visibleClaimCopy = Object.values(claims.sets).flatMap((set) => [set.shows, set.boundary]).join('\n');
  assert.deepEqual(claims.findForbiddenClaims(`${source}\n${visibleClaimCopy}`), []);
  assert.doesNotMatch(source, /Ata Akademi|Neşet Ertaş|Ataşehir Belediyesi/i);
  assert.doesNotMatch(source, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
  assert.doesNotMatch(source, /(?:\+?90\s*)?0?5\d{2}[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}/);
});

test('responsive and accessibility contracts are present', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  assert.match(html, /<html lang="tr">/);
  assert.match(html, /class="skip-link"/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /class="breadcrumb"/);
  assert.match(html, /role="dialog" aria-modal="true"/);
  assert.match(css, /@media \(max-width: 1180px\)/);
  assert.match(css, /@media \(max-width: 960px\)/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /\.evidence-grid/);
  assert.match(css, /\.score-meter/);
  assert.match(css, /\.candidate-evidence/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'phases/phase-1/operations.js'), 'utf8'), /style=/);
});
