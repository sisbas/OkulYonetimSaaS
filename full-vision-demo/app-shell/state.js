(function attachState(root, factory) {
  const fixtures = root.FullVisionFixtures || (typeof require === 'function' ? require('../fixtures/fixture-graph.js') : null);
  const api = factory(fixtures);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.FullVisionState = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createStateModule(fixtures) {
  'use strict';

  if (!fixtures) throw new Error('Fixture graph is required.');

  const ACTIONS = Object.freeze({
    SELECT_SUBSTITUTE: 'SELECT_SUBSTITUTE',
    APPROVE_LEAVE_DEMO: 'APPROVE_LEAVE_DEMO',
    ACCEPT_SCHEDULE_PREVIEW: 'ACCEPT_SCHEDULE_PREVIEW',
    SET_ATTENDANCE: 'SET_ATTENDANCE',
    LOCK_ATTENDANCE_DEMO: 'LOCK_ATTENDANCE_DEMO',
    SIMULATE_NOTIFICATION: 'SIMULATE_NOTIFICATION',
    RESET_SCREEN: 'RESET_SCREEN',
    RESET_ALL: 'RESET_ALL',
  });

  function createInitialState() {
    const graph = fixtures.createFixtureGraph();
    const leave = graph.operations.leaves[0];
    const attendance = graph.operations.attendance[0];
    return {
      meta: { seed: graph.meta.seed, fixedClock: graph.meta.fixedClock, synthetic: true },
      leave: { id: leave.id, status: 'pending', coverageStatus: 'unresolved', assignments: {} },
      schedule: { previewStatus: 'blocked', conflictCount: 0, acceptedLessonIds: [], openLessonIds: [...leave.affectedLessonIds] },
      attendance: { id: attendance.id, locked: false, statuses: Object.fromEntries(attendance.students.map((student) => [student.id, student.status])) },
      notifications: Object.fromEntries(graph.operations.notifications.map((notification) => [notification.id, notification.status])),
      auditTrail: [],
    };
  }

  function coverageStatusFor(state, leave) {
    const assignedCount = leave.affectedLessonIds.filter((lessonId) => state.leave.assignments[lessonId]).length;
    if (leave.affectedLessonIds.length === 0) return 'not_required';
    if (assignedCount === 0) return 'unresolved';
    if (assignedCount === leave.affectedLessonIds.length) return 'covered';
    return 'partially_covered';
  }

  function openLessonIdsFor(state, leave) {
    return leave.affectedLessonIds.filter((lessonId) => !state.leave.assignments[lessonId]);
  }

  function withAudit(state, action, detail) {
    return { ...state, auditTrail: [...state.auditTrail, { action, detail, at: state.meta.fixedClock, synthetic: true }] };
  }

  function reduce(state, event) {
    if (!state) state = createInitialState();
    if (!event || !event.type) return state;
    const graph = fixtures.createFixtureGraph();
    const leave = graph.operations.leaves[0];

    if (event.type === ACTIONS.RESET_ALL) return createInitialState();

    if (event.type === ACTIONS.SELECT_SUBSTITUTE) {
      if (state.leave.status !== 'pending') return state;
      if (!leave.affectedLessonIds.includes(event.lessonId)) return state;
      const permitted = leave.candidatesByLesson[event.lessonId] || [];
      const teacher = graph.coreDefinitions.teachers.find((item) => item.id === event.teacherId);
      if (!permitted.includes(event.teacherId) || !teacher || !teacher.available) return state;
      const next = { ...state, leave: { ...state.leave, assignments: { ...state.leave.assignments, [event.lessonId]: event.teacherId } } };
      return withAudit({
        ...next,
        leave: { ...next.leave, coverageStatus: coverageStatusFor(next, leave) },
        schedule: { ...next.schedule, openLessonIds: openLessonIdsFor(next, leave) },
      }, event.type, event.lessonId);
    }

    if (event.type === ACTIONS.APPROVE_LEAVE_DEMO) {
      if (state.leave.status !== 'pending') return state;
      const coverageStatus = coverageStatusFor(state, leave);
      return withAudit({
        ...state,
        leave: { ...state.leave, status: 'approved_demo', coverageStatus },
        schedule: { ...state.schedule, previewStatus: 'ready', openLessonIds: openLessonIdsFor(state, leave) },
      }, event.type, { leaveId: state.leave.id, coverageStatus });
    }

    if (event.type === ACTIONS.ACCEPT_SCHEDULE_PREVIEW) {
      if (state.leave.status !== 'approved_demo' || state.schedule.previewStatus !== 'ready' || state.schedule.conflictCount !== 0) return state;
      return withAudit({
        ...state,
        schedule: {
          ...state.schedule,
          previewStatus: 'accepted_demo',
          acceptedLessonIds: leave.affectedLessonIds.filter((lessonId) => state.leave.assignments[lessonId]),
          openLessonIds: openLessonIdsFor(state, leave),
        },
      }, event.type, { previewId: 'D-SCH-PREVIEW-001', openLessonCount: openLessonIdsFor(state, leave).length });
    }

    if (event.type === ACTIONS.SET_ATTENDANCE) {
      if (state.schedule.previewStatus !== 'accepted_demo' || state.attendance.locked || !Object.prototype.hasOwnProperty.call(state.attendance.statuses, event.studentId)) return state;
      if (!['present', 'absent', 'late', 'excused'].includes(event.status)) return state;
      return { ...state, attendance: { ...state.attendance, statuses: { ...state.attendance.statuses, [event.studentId]: event.status } } };
    }

    if (event.type === ACTIONS.LOCK_ATTENDANCE_DEMO) {
      if (state.schedule.previewStatus !== 'accepted_demo' || state.attendance.locked || Object.values(state.attendance.statuses).some((status) => !status)) return state;
      return withAudit({ ...state, attendance: { ...state.attendance, locked: true } }, event.type, state.attendance.id);
    }

    if (event.type === ACTIONS.SIMULATE_NOTIFICATION) {
      const source = graph.operations.notifications.find((item) => item.id === event.notificationId);
      if (!state.attendance.locked || !source || source.eligibility !== 'eligible' || state.notifications[event.notificationId] !== 'pending') return state;
      return withAudit({ ...state, notifications: { ...state.notifications, [event.notificationId]: 'simulated' } }, event.type, event.notificationId);
    }

    if (event.type === ACTIONS.RESET_SCREEN) {
      const initial = createInitialState();
      const actionScopes = {
        leave: new Set([ACTIONS.SELECT_SUBSTITUTE, ACTIONS.APPROVE_LEAVE_DEMO, ACTIONS.ACCEPT_SCHEDULE_PREVIEW, ACTIONS.LOCK_ATTENDANCE_DEMO, ACTIONS.SIMULATE_NOTIFICATION]),
        schedule: new Set([ACTIONS.ACCEPT_SCHEDULE_PREVIEW, ACTIONS.LOCK_ATTENDANCE_DEMO, ACTIONS.SIMULATE_NOTIFICATION]),
        attendance: new Set([ACTIONS.LOCK_ATTENDANCE_DEMO, ACTIONS.SIMULATE_NOTIFICATION]),
        notifications: new Set([ACTIONS.SIMULATE_NOTIFICATION]),
      };
      const auditTrail = actionScopes[event.screen] ? state.auditTrail.filter((entry) => !actionScopes[event.screen].has(entry.action)) : state.auditTrail;
      if (event.screen === 'leave') return { ...state, leave: initial.leave, schedule: initial.schedule, attendance: initial.attendance, notifications: initial.notifications, auditTrail };
      if (event.screen === 'attendance') return { ...state, attendance: initial.attendance, notifications: initial.notifications, auditTrail };
      if (event.screen === 'notifications') return { ...state, notifications: initial.notifications, auditTrail };
      if (event.screen === 'schedule') return {
        ...state,
        schedule: {
          ...initial.schedule,
          previewStatus: state.leave.status === 'approved_demo' ? 'ready' : 'blocked',
          openLessonIds: openLessonIdsFor(state, leave),
        },
        attendance: initial.attendance,
        notifications: initial.notifications,
        auditTrail,
      };
    }

    return state;
  }

  function getMetrics(state) {
    const graph = fixtures.createFixtureGraph();
    const affectedCount = graph.operations.leaves[0].affectedLessonIds.length;
    const unassigned = affectedCount - Object.keys(state.leave.assignments).length;
    const incompleteAttendance = state.attendance.locked ? 0 : graph.operations.attendance.filter((session) => session.state === 'open').length;
    const pendingNotifications = Object.values(state.notifications).filter((status) => status === 'pending').length;
    const simulatedNotifications = Object.values(state.notifications).filter((status) => status === 'simulated').length;
    return {
      pendingLeaves: state.leave.status === 'pending' ? 1 : 0,
      unassignedLessons: unassigned,
      coverageStatus: state.leave.coverageStatus,
      incompleteAttendance,
      pendingNotifications,
      simulatedNotifications,
    };
  }

  function createStateForScenarioStep(stepNumber) {
    let state = createInitialState();
    const step = Math.max(1, Number(stepNumber || 1));
    if (step >= 3) {
      state = reduce(state, { type: ACTIONS.SELECT_SUBSTITUTE, lessonId: 'D-SE-301', teacherId: 'D-T-021' });
      state = reduce(state, { type: ACTIONS.SELECT_SUBSTITUTE, lessonId: 'D-SE-302', teacherId: 'D-T-026' });
      state = reduce(state, { type: ACTIONS.SELECT_SUBSTITUTE, lessonId: 'D-SE-303', teacherId: 'D-T-021' });
      state = reduce(state, { type: ACTIONS.APPROVE_LEAVE_DEMO });
    }
    if (step >= 4) state = reduce(state, { type: ACTIONS.ACCEPT_SCHEDULE_PREVIEW });
    if (step >= 5) {
      state = reduce(state, { type: ACTIONS.SET_ATTENDANCE, studentId: 'D-S-004', status: 'late' });
      state = reduce(state, { type: ACTIONS.LOCK_ATTENDANCE_DEMO });
    }
    if (step >= 6) state = reduce(state, { type: ACTIONS.SIMULATE_NOTIFICATION, notificationId: 'D-NT-034' });
    return state;
  }

  return { ACTIONS, createInitialState, createStateForScenarioStep, reduce, getMetrics, coverageStatusFor };
});
