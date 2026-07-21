(function attachDemoConflictEngine(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DemoConflictEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createDemoConflictEngine() {
  'use strict';

  const RESOURCE_RULES = [
    { key: 'teacher', type: 'teacher', reasonCode: 'TEACHER_OVERLAP', label: 'Öğretmen' },
    { key: 'studentGroup', type: 'studentGroup', reasonCode: 'STUDENT_GROUP_OVERLAP', label: 'Öğrenci grubu' },
    { key: 'room', type: 'room', reasonCode: 'ROOM_OVERLAP', label: 'Derslik' },
  ];

  function toMinutes(value) {
    const match = /^(\d{2}):(\d{2})$/.exec(String(value || ''));
    if (!match) throw new TypeError(`Invalid time value: ${value}`);
    return Number(match[1]) * 60 + Number(match[2]);
  }

  function overlaps(left, right) {
    return left.day === right.day &&
      toMinutes(left.start) < toMinutes(right.end) &&
      toMinutes(right.start) < toMinutes(left.end);
  }

  function validateSchedule(events) {
    if (!Array.isArray(events)) throw new TypeError('events must be an array');
    const activeEvents = events.filter((event) => event && event.status !== 'inactive');
    const conflicts = [];

    for (let leftIndex = 0; leftIndex < activeEvents.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < activeEvents.length; rightIndex += 1) {
        const left = activeEvents[leftIndex];
        const right = activeEvents[rightIndex];
        if (!overlaps(left, right)) continue;

        for (const rule of RESOURCE_RULES) {
          if (!left[rule.key] || left[rule.key] !== right[rule.key]) continue;
          conflicts.push({
            id: `${rule.type}:${left.id}:${right.id}`,
            type: rule.type,
            reasonCode: rule.reasonCode,
            resourceLabel: rule.label,
            resourceValue: left[rule.key],
            eventIds: [left.id, right.id],
            day: left.day,
            start: toMinutes(left.start) >= toMinutes(right.start) ? left.start : right.start,
            end: toMinutes(left.end) <= toMinutes(right.end) ? left.end : right.end,
          });
        }
      }
    }

    const conflictedEventIds = [...new Set(conflicts.flatMap((conflict) => conflict.eventIds))];
    const summaryByType = RESOURCE_RULES.reduce((summary, rule) => {
      summary[rule.type] = conflicts.filter((conflict) => conflict.type === rule.type).length;
      return summary;
    }, {});

    return Object.freeze({
      status: conflicts.length ? 'invalid' : 'valid',
      reasonCode: conflicts.length ? 'SCHEDULE_HARD_CONFLICTS_PRESENT' : null,
      hardConflictCount: conflicts.length,
      conflicts: Object.freeze(conflicts.map((conflict) => Object.freeze(conflict))),
      conflictedEventIds: Object.freeze(conflictedEventIds),
      summaryByType: Object.freeze(summaryByType),
    });
  }

  return Object.freeze({ RESOURCE_RULES, overlaps, toMinutes, validateSchedule });
});
