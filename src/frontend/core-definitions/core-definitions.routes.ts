export type FrontendRole = 'tenant_admin' | 'operations_manager' | 'teacher' | 'viewer';

export type CoreDefinitionModule = 'course' | 'room' | 'time_slot';

export type PermissionDependency = {
  status: 'pending_catalog_binding';
  module: CoreDefinitionModule;
  expectedActions: readonly string[];
  catalogKey: null;
  hardCodedPermissionKey: false;
  runtimeEnforcement: 'not_implemented';
};

export type SensitiveDataPolicy = {
  showsSensitiveData: false;
  blockedDataClasses: readonly string[];
  futureRenderMustKeepBlocked: true;
};

export type RoleScopeNote = {
  role: FrontendRole;
  scope: 'admin_placeholder' | 'operations_placeholder' | 'read_only_future_placeholder';
  mayCreate: false;
  mayUpdate: false;
  mayArchive: false;
  runtimePermissionAssumption: 'none_until_catalog_binding';
};

export type RuntimeScope = {
  status: 'placeholder_only';
  opensRuntimeImplementation: false;
  opensApiBinding: false;
  opensPermissionEnforcement: false;
  note: string;
};

export type RoutePlaceholder = {
  path: string;
  title: string;
  module: CoreDefinitionModule;
  intendedRoles: readonly FrontendRole[];
  roleScopeNotes: readonly RoleScopeNote[];
  runtimeScope: RuntimeScope;
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

const CORE_DEFINITIONS_ROLE_SCOPE_NOTES = [
  {
    role: 'tenant_admin',
    scope: 'admin_placeholder',
    mayCreate: false,
    mayUpdate: false,
    mayArchive: false,
    runtimePermissionAssumption: 'none_until_catalog_binding',
  },
  {
    role: 'operations_manager',
    scope: 'operations_placeholder',
    mayCreate: false,
    mayUpdate: false,
    mayArchive: false,
    runtimePermissionAssumption: 'none_until_catalog_binding',
  },
  {
    role: 'teacher',
    scope: 'read_only_future_placeholder',
    mayCreate: false,
    mayUpdate: false,
    mayArchive: false,
    runtimePermissionAssumption: 'none_until_catalog_binding',
  },
  {
    role: 'viewer',
    scope: 'read_only_future_placeholder',
    mayCreate: false,
    mayUpdate: false,
    mayArchive: false,
    runtimePermissionAssumption: 'none_until_catalog_binding',
  },
] as const satisfies readonly RoleScopeNote[];

const PLACEHOLDER_ONLY_RUNTIME_SCOPE: RuntimeScope = {
  status: 'placeholder_only',
  opensRuntimeImplementation: false,
  opensApiBinding: false,
  opensPermissionEnforcement: false,
  note: 'Descriptor only. Do not treat this route placeholder as runtime implementation or permission enforcement.',
};

const TIME_SLOT_PLACEHOLDER_ONLY_RUNTIME_SCOPE: RuntimeScope = {
  status: 'placeholder_only',
  opensRuntimeImplementation: false,
  opensApiBinding: false,
  opensPermissionEnforcement: false,
  note: 'TimeSlot placeholder does not open runtime TimeSlot implementation scope.',
};

export const CORE_DEFINITIONS_ROUTES: readonly RoutePlaceholder[] = [
  {
    path: '/app/definitions/courses',
    title: 'Ders Tanımları',
    module: 'course',
    intendedRoles: ['tenant_admin', 'operations_manager', 'teacher', 'viewer'],
    roleScopeNotes: CORE_DEFINITIONS_ROLE_SCOPE_NOTES,
    runtimeScope: PLACEHOLDER_ONLY_RUNTIME_SCOPE,
    permissionDependency: {
      status: 'pending_catalog_binding',
      module: 'course',
      expectedActions: ['read', 'create', 'update', 'archive'],
      catalogKey: null,
      hardCodedPermissionKey: false,
      runtimeEnforcement: 'not_implemented',
    },
    sensitiveDataPolicy: {
      showsSensitiveData: false,
      blockedDataClasses: CORE_DEFINITIONS_BLOCKED_DATA_CLASSES,
      futureRenderMustKeepBlocked: true,
    },
    apiBinding: 'not_connected',
    allowedStates: ['loading', 'empty', 'error', 'forbidden'],
  },
  {
    path: '/app/definitions/rooms',
    title: 'Derslik Tanımları',
    module: 'room',
    intendedRoles: ['tenant_admin', 'operations_manager', 'teacher', 'viewer'],
    roleScopeNotes: CORE_DEFINITIONS_ROLE_SCOPE_NOTES,
    runtimeScope: PLACEHOLDER_ONLY_RUNTIME_SCOPE,
    permissionDependency: {
      status: 'pending_catalog_binding',
      module: 'room',
      expectedActions: ['read', 'create', 'update', 'archive'],
      catalogKey: null,
      hardCodedPermissionKey: false,
      runtimeEnforcement: 'not_implemented',
    },
    sensitiveDataPolicy: {
      showsSensitiveData: false,
      blockedDataClasses: CORE_DEFINITIONS_BLOCKED_DATA_CLASSES,
      futureRenderMustKeepBlocked: true,
    },
    apiBinding: 'not_connected',
    allowedStates: ['loading', 'empty', 'error', 'forbidden'],
  },
  {
    path: '/app/definitions/time-slots',
    title: 'Zaman Slotları',
    module: 'time_slot',
    intendedRoles: ['tenant_admin', 'operations_manager', 'teacher', 'viewer'],
    roleScopeNotes: CORE_DEFINITIONS_ROLE_SCOPE_NOTES,
    runtimeScope: TIME_SLOT_PLACEHOLDER_ONLY_RUNTIME_SCOPE,
    permissionDependency: {
      status: 'pending_catalog_binding',
      module: 'time_slot',
      expectedActions: ['read', 'create', 'update', 'archive'],
      catalogKey: null,
      hardCodedPermissionKey: false,
      runtimeEnforcement: 'not_implemented',
    },
    sensitiveDataPolicy: {
      showsSensitiveData: false,
      blockedDataClasses: CORE_DEFINITIONS_BLOCKED_DATA_CLASSES,
      futureRenderMustKeepBlocked: true,
    },
    apiBinding: 'not_connected',
    allowedStates: ['loading', 'empty', 'error', 'forbidden'],
  },
] as const;
