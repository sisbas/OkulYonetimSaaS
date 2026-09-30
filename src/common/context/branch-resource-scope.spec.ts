import { branchResources } from './branch-resource-scope';

describe('ID-addressed branch resource scope', () => {
  it.each([
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-7111-8111-111111111111',
  ])('does not skip a PostgreSQL UUID because of its version: %s', (id) => {
    expect(branchResources('DailyOperationsController', { leaveId: id, scheduleEventId: id })).toEqual([
      { table: 'leave_requests', id }, { table: 'schedule_events', id },
    ]);
  });

  it('leaves malformed IDs to existing request validation', () => {
    expect(branchResources('LeaveController', { id: 'not-a-uuid' })).toEqual([]);
  });
});
