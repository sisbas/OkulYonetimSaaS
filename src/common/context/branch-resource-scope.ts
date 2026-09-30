/** Narrow ID-addressed branch resources; route permissions and repository
 * ownership checks remain mandatory. Invalid IDs go to existing validation.
 */
type BranchResourceTable = 'leave_requests' | 'schedule_events' | 'schedules' | 'attendance_sessions';
const ROUTE_RESOURCES: Readonly<Record<string, ReadonlyArray<readonly [string, BranchResourceTable]>>> = {
  DailyOperationsController: [['leaveId', 'leave_requests'], ['scheduleEventId', 'schedule_events']],
  LeaveController: [['id', 'leave_requests']],
  ScheduleController: [['id', 'schedules']],
  AttendanceSessionController: [['id', 'attendance_sessions']],
};

export function branchResources(controller: string, params: Record<string, unknown> = {}) {
  return (ROUTE_RESOURCES[controller] ?? []).flatMap(([parameter, table]) => {
    const id = params[parameter];
    return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
      ? [{ table, id }] : [];
  });
}
