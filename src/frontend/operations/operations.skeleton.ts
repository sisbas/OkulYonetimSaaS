import type { OperationsModule } from './operations.routes';
import type { OperationsUiState } from './operations.states';

export type OperationsComponentDescriptor = {
  name: string;
  module: OperationsModule | 'shared';
  route: string;
  stateCoverage: readonly OperationsUiState[];
  displays: readonly string[];
  doesNotDisplay: readonly string[];
  apiBinding: 'not_connected';
  permissionBinding: 'pending_catalog';
  interactionEnabled: false;
  submitEnabled: false;
  runtimeComponent: false;
};

const OPERATIONS_SAFE_DISPLAY_FIELDS = [
  'page title',
  'contract notice',
  'permission dependency notice',
  'disabled action placeholder',
  'state label',
] as const;

export const OPERATIONS_FUTURE_RENDER_BLOCKLIST = [
  'student name',
  'student identity number',
  'student note',
  'parent phone',
  'parent email',
  'guardian contact',
  'notification payload',
  'message body',
  'counseling note',
  'authorization header',
  'token',
  'credential',
] as const;

export const OPERATIONS_COMPONENT_SKELETONS: readonly OperationsComponentDescriptor[] = [
  {
    name: 'DailyOperationPageSkeleton',
    module: 'daily_operation',
    route: '/app/today',
    stateCoverage: ['loading', 'empty', 'error', 'forbidden', 'contract_pending'],
    displays: ['daily summary placeholders', ...OPERATIONS_SAFE_DISPLAY_FIELDS],
    doesNotDisplay: OPERATIONS_FUTURE_RENDER_BLOCKLIST,
    apiBinding: 'not_connected',
    permissionBinding: 'pending_catalog',
    interactionEnabled: false,
    submitEnabled: false,
    runtimeComponent: false,
  },
  {
    name: 'TodaySchedulePanelSkeleton',
    module: 'daily_operation',
    route: '/app/today',
    stateCoverage: ['loading', 'empty', 'error', 'forbidden', 'contract_pending'],
    displays: ['lesson count placeholder', 'time block placeholder', ...OPERATIONS_SAFE_DISPLAY_FIELDS],
    doesNotDisplay: OPERATIONS_FUTURE_RENDER_BLOCKLIST,
    apiBinding: 'not_connected',
    permissionBinding: 'pending_catalog',
    interactionEnabled: false,
    submitEnabled: false,
    runtimeComponent: false,
  },
  {
    name: 'LeaveImpactPlaceholder',
    module: 'daily_operation',
    route: '/app/today',
    stateCoverage: ['empty', 'error', 'forbidden', 'contract_pending'],
    displays: ['leave-impact contract notice', 'replacement-teacher placeholder', ...OPERATIONS_SAFE_DISPLAY_FIELDS],
    doesNotDisplay: OPERATIONS_FUTURE_RENDER_BLOCKLIST,
    apiBinding: 'not_connected',
    permissionBinding: 'pending_catalog',
    interactionEnabled: false,
    submitEnabled: false,
    runtimeComponent: false,
  },
  {
    name: 'DailyClosurePanelSkeleton',
    module: 'daily_operation',
    route: '/app/today',
    stateCoverage: ['empty', 'error', 'forbidden', 'contract_pending'],
    displays: ['closure checklist placeholder', ...OPERATIONS_SAFE_DISPLAY_FIELDS],
    doesNotDisplay: OPERATIONS_FUTURE_RENDER_BLOCKLIST,
    apiBinding: 'not_connected',
    permissionBinding: 'pending_catalog',
    interactionEnabled: false,
    submitEnabled: false,
    runtimeComponent: false,
  },
  {
    name: 'SchedulePageSkeleton',
    module: 'schedule',
    route: '/app/schedule',
    stateCoverage: ['loading', 'empty', 'error', 'forbidden', 'contract_pending'],
    displays: ['schedule grid placeholder', 'filter placeholder', ...OPERATIONS_SAFE_DISPLAY_FIELDS],
    doesNotDisplay: OPERATIONS_FUTURE_RENDER_BLOCKLIST,
    apiBinding: 'not_connected',
    permissionBinding: 'pending_catalog',
    interactionEnabled: false,
    submitEnabled: false,
    runtimeComponent: false,
  },
  {
    name: 'ScheduleConflictPanelSkeleton',
    module: 'schedule',
    route: '/app/schedule',
    stateCoverage: ['empty', 'error', 'forbidden', 'contract_pending'],
    displays: ['conflict count placeholder', 'validation contract notice', ...OPERATIONS_SAFE_DISPLAY_FIELDS],
    doesNotDisplay: OPERATIONS_FUTURE_RENDER_BLOCKLIST,
    apiBinding: 'not_connected',
    permissionBinding: 'pending_catalog',
    interactionEnabled: false,
    submitEnabled: false,
    runtimeComponent: false,
  },
  {
    name: 'AttendanceOverviewPageSkeleton',
    module: 'attendance',
    route: '/app/attendance',
    stateCoverage: ['loading', 'empty', 'error', 'forbidden', 'contract_pending'],
    displays: ['session count placeholder', 'missing-attendance placeholder', ...OPERATIONS_SAFE_DISPLAY_FIELDS],
    doesNotDisplay: OPERATIONS_FUTURE_RENDER_BLOCKLIST,
    apiBinding: 'not_connected',
    permissionBinding: 'pending_catalog',
    interactionEnabled: false,
    submitEnabled: false,
    runtimeComponent: false,
  },
  {
    name: 'AttendanceSessionPageSkeleton',
    module: 'attendance',
    route: '/app/attendance/session/:sessionId',
    stateCoverage: ['loading', 'empty', 'error', 'forbidden', 'contract_pending'],
    displays: ['session metadata placeholder', 'PII-free roster boundary notice', ...OPERATIONS_SAFE_DISPLAY_FIELDS],
    doesNotDisplay: OPERATIONS_FUTURE_RENDER_BLOCKLIST,
    apiBinding: 'not_connected',
    permissionBinding: 'pending_catalog',
    interactionEnabled: false,
    submitEnabled: false,
    runtimeComponent: false,
  },
  {
    name: 'AttendancePiiSafeEmptyState',
    module: 'attendance',
    route: '/app/attendance/session/:sessionId',
    stateCoverage: ['empty', 'forbidden', 'contract_pending'],
    displays: ['no student data message', ...OPERATIONS_SAFE_DISPLAY_FIELDS],
    doesNotDisplay: OPERATIONS_FUTURE_RENDER_BLOCKLIST,
    apiBinding: 'not_connected',
    permissionBinding: 'pending_catalog',
    interactionEnabled: false,
    submitEnabled: false,
    runtimeComponent: false,
  },
] as const;
