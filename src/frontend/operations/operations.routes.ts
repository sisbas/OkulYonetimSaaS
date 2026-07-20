import type { FrontendRole } from '../core-definitions/core-definitions.routes';

export type OperationsModule = 'daily_operation' | 'schedule' | 'attendance';

export type OperationsRouteScope =
  | 'management_placeholder'
  | 'own_read_only_placeholder'
  | 'read_only_placeholder'
  | 'hidden';

export type OperationsPermissionDependency = {
  status: 'pending_catalog_binding';
  module: OperationsModule;
  expectedCapabilities: readonly string[];
  catalogKey: null;
  hardCodedPermissionKey: false;
  runtimeEnforcement: 'not_implemented';
};

export type OperationsSensitiveDataPolicy = {
  showsSensitiveData: false;
  blockedDataClasses: readonly string[];
};

export type OperationsRoutePlaceholder = {
  path: string;
  title: string;
  module: OperationsModule;
  intendedRoles: readonly FrontendRole[];
  roleVisibility: Readonly<Record<FrontendRole, OperationsRouteScope>>;
  permissionDependency: OperationsPermissionDependency;
  sensitiveDataPolicy: OperationsSensitiveDataPolicy;
  apiBinding: 'not_connected';
  runtimeRouteGuard: 'unchanged';
  allowedStates: readonly ['loading', 'empty', 'error', 'forbidden', 'contract_pending'];
  runtimeScopeNote: string;
};

const OPERATIONS_BLOCKED_DATA_CLASSES = [
  'student_name',
  'student_identity',
  'parent_contact',
  'guardian_contact',
  'notification_payload',
  'message_body',
  'counseling_note',
  'credential',
  'token',
] as const;

export const OPERATIONS_ROUTES: readonly OperationsRoutePlaceholder[] = [
  {
    path: '/app/today',
    title: 'Günlük Operasyon',
    module: 'daily_operation',
    intendedRoles: ['tenant_admin', 'operations_manager', 'teacher', 'viewer'],
    roleVisibility: {
      tenant_admin: 'management_placeholder',
      operations_manager: 'management_placeholder',
      teacher: 'own_read_only_placeholder',
      viewer: 'read_only_placeholder',
    },
    permissionDependency: {
      status: 'pending_catalog_binding',
      module: 'daily_operation',
      expectedCapabilities: ['read daily summary', 'read own daily summary', 'close operational day'],
      catalogKey: null,
      hardCodedPermissionKey: false,
      runtimeEnforcement: 'not_implemented',
    },
    sensitiveDataPolicy: {
      showsSensitiveData: false,
      blockedDataClasses: OPERATIONS_BLOCKED_DATA_CLASSES,
    },
    apiBinding: 'not_connected',
    runtimeRouteGuard: 'unchanged',
    allowedStates: ['loading', 'empty', 'error', 'forbidden', 'contract_pending'],
    runtimeScopeNote: 'Descriptor only. No daily-operation API call, mutation or close-day action is enabled.',
  },
  {
    path: '/app/schedule',
    title: 'Ders Programı',
    module: 'schedule',
    intendedRoles: ['tenant_admin', 'operations_manager', 'teacher', 'viewer'],
    roleVisibility: {
      tenant_admin: 'management_placeholder',
      operations_manager: 'management_placeholder',
      teacher: 'own_read_only_placeholder',
      viewer: 'read_only_placeholder',
    },
    permissionDependency: {
      status: 'pending_catalog_binding',
      module: 'schedule',
      expectedCapabilities: ['read schedule', 'read own schedule', 'validate draft', 'publish schedule'],
      catalogKey: null,
      hardCodedPermissionKey: false,
      runtimeEnforcement: 'not_implemented',
    },
    sensitiveDataPolicy: {
      showsSensitiveData: false,
      blockedDataClasses: OPERATIONS_BLOCKED_DATA_CLASSES,
    },
    apiBinding: 'not_connected',
    runtimeRouteGuard: 'unchanged',
    allowedStates: ['loading', 'empty', 'error', 'forbidden', 'contract_pending'],
    runtimeScopeNote: 'Schedule placeholder does not bind to Course, Room or TimeSlot runtime APIs.',
  },
  {
    path: '/app/attendance',
    title: 'Yoklama Takip',
    module: 'attendance',
    intendedRoles: ['tenant_admin', 'operations_manager', 'teacher'],
    roleVisibility: {
      tenant_admin: 'management_placeholder',
      operations_manager: 'management_placeholder',
      teacher: 'own_read_only_placeholder',
      viewer: 'hidden',
    },
    permissionDependency: {
      status: 'pending_catalog_binding',
      module: 'attendance',
      expectedCapabilities: ['read attendance sessions', 'read own sessions', 'read missing attendance'],
      catalogKey: null,
      hardCodedPermissionKey: false,
      runtimeEnforcement: 'not_implemented',
    },
    sensitiveDataPolicy: {
      showsSensitiveData: false,
      blockedDataClasses: OPERATIONS_BLOCKED_DATA_CLASSES,
    },
    apiBinding: 'not_connected',
    runtimeRouteGuard: 'unchanged',
    allowedStates: ['loading', 'empty', 'error', 'forbidden', 'contract_pending'],
    runtimeScopeNote: 'No student roster, attendance record or absence detail is loaded.',
  },
  {
    path: '/app/attendance/session/:sessionId',
    title: 'Yoklama Oturumu',
    module: 'attendance',
    intendedRoles: ['tenant_admin', 'operations_manager', 'teacher'],
    roleVisibility: {
      tenant_admin: 'management_placeholder',
      operations_manager: 'management_placeholder',
      teacher: 'own_read_only_placeholder',
      viewer: 'hidden',
    },
    permissionDependency: {
      status: 'pending_catalog_binding',
      module: 'attendance',
      expectedCapabilities: ['read attendance session', 'read own session', 'submit own attendance'],
      catalogKey: null,
      hardCodedPermissionKey: false,
      runtimeEnforcement: 'not_implemented',
    },
    sensitiveDataPolicy: {
      showsSensitiveData: false,
      blockedDataClasses: OPERATIONS_BLOCKED_DATA_CLASSES,
    },
    apiBinding: 'not_connected',
    runtimeRouteGuard: 'unchanged',
    allowedStates: ['loading', 'empty', 'error', 'forbidden', 'contract_pending'],
    runtimeScopeNote: 'Session route is a PII-free placeholder; submit and mutation controls remain disabled.',
  },
] as const;
