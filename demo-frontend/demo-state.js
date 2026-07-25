(function attachDemoState(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DemoState = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createDemoStateApi() {
  'use strict';

  const SEED = 'OKUL-DEMO-2026-07-21-v1';
  const INITIAL_EVENTS = Object.freeze([
    { id: 'EV1', day: 'Pazartesi', start: '09:30', end: '10:50', course: 'TYT Matematik', studentGroup: '12-SAY-1', teacher: 'Demo Öğretmen A', room: 'D2' },
    { id: 'EV2', day: 'Pazartesi', start: '13:30', end: '14:50', course: 'AYT Fizik', studentGroup: 'MEZ-SAY-2', teacher: 'Demo Öğretmen B', room: 'D4' },
    { id: 'EV3', day: 'Salı', start: '11:10', end: '12:30', course: 'Türkçe', studentGroup: '11-EA-1', teacher: 'Demo Öğretmen C', room: 'D1' },
    { id: 'EV4', day: 'Çarşamba', start: '09:30', end: '10:50', course: 'TYT Geometri', studentGroup: 'MEZ-SAY-1', teacher: 'Demo Öğretmen A', room: 'D3' },
    { id: 'EV5', day: 'Çarşamba', start: '09:30', end: '10:50', course: 'AYT Matematik', studentGroup: '12-SAY-2', teacher: 'Demo Öğretmen A', room: 'D5' },
    { id: 'EV6', day: 'Perşembe', start: '11:10', end: '12:30', course: 'Biyoloji', studentGroup: '12-SAY-1', teacher: 'Demo Öğretmen D', room: 'Lab 1' },
    { id: 'EV7', day: 'Perşembe', start: '11:10', end: '12:30', course: 'Kimya', studentGroup: '12-SAY-1', teacher: 'Demo Öğretmen E', room: 'Lab 2' },
    { id: 'EV8', day: 'Cuma', start: '13:30', end: '14:50', course: 'Coğrafya', studentGroup: '12-EA-1', teacher: 'Demo Öğretmen F', room: 'D6' },
    { id: 'EV9', day: 'Cuma', start: '13:30', end: '14:50', course: 'Tarih', studentGroup: 'MEZ-EA-1', teacher: 'Demo Öğretmen G', room: 'D6' },
    { id: 'EV10', day: 'Cuma', start: '15:10', end: '16:30', course: 'Felsefe', studentGroup: '12-EA-2', teacher: 'Demo Öğretmen H', room: 'D7' },
  ].map((event) => Object.freeze(event)));

  function cloneEvents(events = INITIAL_EVENTS) {
    return events.map((event) => ({ ...event }));
  }

  function canMutateSchedule(mode) {
    return mode === 'draft';
  }

  function createInitialState(validateSchedule) {
    if (typeof validateSchedule !== 'function') throw new TypeError('validateSchedule must be a function');
    const events = cloneEvents();
    return {
      mode: 'draft',
      events,
      validation: validateSchedule(events),
      validationRun: 0,
      attendance: { D01: 'present', D02: 'present', D03: 'absent', D04: 'present', D05: 'late', D06: 'present' },
      notifications: { N1: 'pending', N2: 'approved', N3: 'sent' },
      substitutes: { E1: '', E2: 'Demo Öğretmen B', E3: '' },
    };
  }

  return Object.freeze({ SEED, INITIAL_EVENTS, cloneEvents, canMutateSchedule, createInitialState });
});
