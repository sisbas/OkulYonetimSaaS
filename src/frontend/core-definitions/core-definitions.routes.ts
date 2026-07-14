export type FrontendRole = 'tenant_admin' | 'operations_manager' | 'teacher' | 'viewer';

export type CoreDefinitionModule = 'course' | 'room' | 'time_slot';

export type PermissionDependency = {
  status: 'pending_catalog_binding';
  module: CoreDefinitionModule;
  expectedActions: readonly string[];
  catalogKey: null;
  hardCodedPermissionKey: false;
};

export type SensitiveDataPolicy = {
  showsSensitiveData: false;
  blockedDataClasses: readonly string[];
};

export type RoutePlaceholder = {
  path: string;
  title: string;
  module: CoreDefinitionModule;
  intendedRoles: readonly FrontendRole[];
  permissionDependency: PermissionDependency;
  sensitiveDataPolicy: SensitiveDataPolicy;
  apiBinding: 'not_connected';
  allowedStates: readonly ['loading', 'empty', 'error', 'forbidden'];
};

const CORE_DEFINITIONS_BLOCKED_DATA_CLASSES = [
  'student_identity',
  'parent_contact',
  'guardian_contact',
  'notification_payload',
  'message_body',
  'counseling_note',
  'credential',
  'token',
] as const;

export const CORE_DEFINITIONS_ROUTES: readonly RoutePlaceholder[] = [
  {
    path: '/app/definitions/courses',
    title: 'Ders Tanımları',
    module: 'course',
    intendedRoles: ['tenant_admin', 'operations_manager', 'teacher', 'viewer'],
    permissionDependency: {
      status: 'pending_catalog_binding',
      module: 'course',
      expectedActions: ['read', 'create', 'update', 'archive'],
      catalogKey: null,
      hardCodedPermissionKey: false,
    },
    sensitiveDataPolicy: {
      showsSensitiveData: false,
      blockedDataClasses: CORE_DEFINITIONS_BLOCKED_DATA_CLASSES,
    },
    apiBinding: 'not_connected',
    allowedStates: ['loading', 'empty', 'error', 'forbidden'],
  },
  {
    path: '/app/definitions/rooms',
    title: 'Derslik Tanımları',
    module: 'room',
    intendedRoles: ['tenant_admin', 'operations_manager', 'teacher', 'viewer'],
    permissionDependency: {
      status: 'pending_catalog_binding',
      module: 'room',
      expectedActions: ['read', 'create', 'update', 'archive'],
      catalogKey: null,
      hardCodedPermissionKey: false,
    },
    sensitiveDataPolicy: {
      showsSensitiveData: false,
      blockedDataClasses: CORE_DEFINITIONS_BLOCKED_DATA_CLASSES,
    },
    apiBinding: 'not_connected',
    allowedStates: ['loading', 'empty', 'error', 'forbidden'],
  },
  {
    path: '/app/definitions/time-slots',
    title: 'Zaman Slotları',
    module: 'time_slot',
    intendedRoles: ['tenant_admin', 'operations_manager', 'teacher', 'viewer'],
    permissionDependency: {
      status: 'pending_catalog_binding',
      module: 'time_slot',
      expectedActions: ['read', 'create', 'update', 'archive'],
      catalogKey: null,
      hardCodedPermissionKey: false,
    },
    sensitiveDataPolicy: {
      showsSensitiveData: false,
      blockedDataClasses: CORE_DEFINITIONS_BLOCKED_DATA_CLASSES,
    },
    apiBinding: 'not_connected',
    allowedStates: ['loading', 'empty', 'error', 'forbidden'],
  },
] as const;
