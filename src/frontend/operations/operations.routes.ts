import type { FrontendRole } from '../core-definitions/core-definitions.routes';

export type OperationsModule = 'daily_operation' | 'schedule' | 'attendance';

export type ScheduleContractSurface =
  | 'draft_list'
  | 'weekly_grid'
  | 'event_editor_modal'
  | 'conflict_panel'
  | 'validation_result'
  | 'publish_confirmation'
  | 'stale_version_warning'
  | 'forbidden_state';

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

export type ScheduleContractMetadata = {
  source: 'issue_40_contract_draft';
  lifecycle: readonly ['draft', 'published', 'unpublished'];
  validationLifecycle: readonly ['not_validated', 'valid', 'invalid', 'stale'];
  surfaces: readonly ScheduleContractSurface[];
  versioning: {
    responseEtagRequired: true;
    mutationIfMatchRequired: true;
    staleVersionStatusCode: 412;
    missingVersionStatusCode: 428;
  };
  publishedImmutable: true;
  publishRequiresFullValidation: true;
  bindingStatus: 'blocked';
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
  scheduleContract?: ScheduleContractMetadata;
};

const OPERATIONS_BLOCKED_DATA_CLASSES = [
  'student_name',
  'student_identity',
  'student_roster',
  'student_note',
  'parent_phone',
  'parent_email',
  'parent_contact',
  'guardian_contact',
  'notification_payload',
  'message_body',
  'counseling_note',
  'tenant_id',
  'raw_request',
  'raw_response',
  'authorization_header',
  'cross_tenant_existence',
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
      expectedCapabilities: [
        'read daily summary',
        'read own daily summary',
        'read published schedule summary',
        'close operational day',
      ],
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
    runtimeScopeNote:
      'Descriptor only. Published-schedule summary dependency is documented but no daily-operation API call, mutation or close-day action is enabled.',
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
      expectedCapabilities: [
        'list schedule drafts',
        'create schedule draft',
        'read published schedule',
        'read own published schedule',
        'create update and delete draft events',
        'update event assignments',
        'validate hard conflicts',
        'read hard conflict results',
        'publish and unpublish schedule',
      ],
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
    runtimeScopeNote:
      'M3 contract-alignment descriptor only. Schedule lifecycle, version, validation and publish-gate metadata do not call Schedule, Course, Room, TimeSlot, Teacher or StudentGroup APIs.',
    scheduleContract: {
      source: 'issue_40_contract_draft',
      lifecycle: ['draft', 'published', 'unpublished'],
      validationLifecycle: ['not_validated', 'valid', 'invalid', 'stale'],
      surfaces: [
        'draft_list',
        'weekly_grid',
        'event_editor_modal',
        'conflict_panel',
        'validation_result',
        'publish_confirmation',
        'stale_version_warning',
        'forbidden_state',
      ],
      versioning: {
        responseEtagRequired: true,
        mutationIfMatchRequired: true,
        staleVersionStatusCode: 412,
        missingVersionStatusCode: 428,
      },
      publishedImmutable: true,
      publishRequiresFullValidation: true,
      bindingStatus: 'blocked',
    },
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
      expectedCapabilities: [
        'read attendance sessions',
        'read own sessions',
        'read missing attendance',
        'read published schedule-derived session reference',
      ],
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
    runtimeScopeNote:
      'Attendance dependency on a published schedule is documented only. No student roster, attendance record or absence detail is loaded.',
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
