/** Narrow ID-addressed branch resources; route permissions and repository
 * ownership checks remain mandatory. Invalid IDs go to existing validation.
 */
import { AuthorizationContextError } from './authorization-context';

export type BranchResourceTable = 'leave_requests' | 'schedule_events' | 'schedules' | 'attendance_sessions' | 'rooms' | 'time_slots';
const ROUTE_RESOURCES: Readonly<Record<string, ReadonlyArray<readonly [string, BranchResourceTable]>>> = {
  DailyOperationsController: [['leaveId', 'leave_requests'], ['scheduleEventId', 'schedule_events']],
  LeaveController: [['id', 'leave_requests']],
  ScheduleController: [['id', 'schedules']],
  AttendanceSessionController: [['id', 'attendance_sessions']],
  RoomController: [['id', 'rooms']],
  TimeSlotController: [['id', 'time_slots']],
  DailyOperationsQueueController: [],
};
const BODY_RESOURCES: Readonly<Record<string, ReadonlyArray<readonly [string, BranchResourceTable]>>> = {
  AttendanceSessionController: [['scheduleEventId', 'schedule_events']],
};

export function isBranchScopedController(controller: string): boolean {
  return Object.prototype.hasOwnProperty.call(ROUTE_RESOURCES, controller);
}

export function isBranchScopedPermission(permission: string): boolean {
  return /^(room|time_slot|leave|daily_operations|schedule|attendance):/.test(permission);
}

export function hasBranchListFilter(controller: string): boolean {
  return ['LeaveController', 'RoomController', 'TimeSlotController'].includes(controller);
}

export function branchResources(
  controller: string,
  params: Record<string, unknown> = {},
  body: Record<string, unknown> = {},
) {
  if (isBranchScopedController(controller)) {
    const allowed = ROUTE_RESOURCES[controller].map(([parameter]) => parameter);
    // Student ownership is checked by the attendance domain guard, after the
    // parent session is narrowed here. New route parameters otherwise deny.
    if (controller === 'AttendanceSessionController') allowed.push('studentId');
    if (Object.keys(params).some((parameter) => !allowed.includes(parameter))) {
      throw new AuthorizationContextError('unresolved_authority');
    }
  }
  const isUuid = (id: unknown): id is string =>
    typeof id === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);
  return [
    ...(ROUTE_RESOURCES[controller] ?? []).flatMap(([parameter, table]) =>
      isUuid(params[parameter]) ? [{ table, id: params[parameter] }] : []),
    ...(BODY_RESOURCES[controller] ?? []).flatMap(([parameter, table]) =>
      isUuid(body[parameter]) ? [{ table, id: body[parameter] }] : []),
  ];
}
