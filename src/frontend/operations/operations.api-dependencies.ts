import type { OperationsModule } from './operations.routes';

export type OperationsContractStatus = 'not_approved' | 'm3_contract_draft_alignment_only';

export type OperationsApiDependency = {
  module: OperationsModule;
  contractStatus: OperationsContractStatus;
  bindingStatus: 'blocked';
  expectedCapabilities: readonly string[];
  requiredContractArtifacts: readonly string[];
  sensitiveDataBoundary: readonly string[];
  runtimeEndpointAssumption: false;
};

export const OPERATIONS_UI_BINDING_GATES = [
  'runtime API contract approved after contract-draft review',
  'Permission Catalog capability mapping approved',
  '403 and own-scope error reason contract approved',
  'tenant and branch scope behavior documented',
  'sensitive field response policy approved',
  'ETag and If-Match behavior approved for mutations',
  'loading empty error forbidden and contract-pending states verified',
  'TypeScript build and relevant tests pass',
] as const;

const COMMON_CONTRACT_ARTIFACTS = [
  'request and response DTO',
  'validation rules',
  'tenant scope behavior',
  'role and own-scope behavior',
  '403 reason mapping',
  'audit requirement',
  'error response format',
] as const;

const COMMON_SENSITIVE_BOUNDARY = [
  'student identity excluded until attendance contract approval',
  'student roster excluded from Schedule projections',
  'parent and guardian contact excluded',
  'notification payload excluded',
  'counseling note excluded',
  'tenant id excluded from client render',
  'raw request and response payload excluded',
  'cross-tenant existence signal excluded',
  'token authorization header and credential excluded',
] as const;

export type SchedulePermissionDependencyDescriptor = {
  capability: string;
  appliesTo: readonly string[];
  catalogKey: null;
  hardCodedPermissionKey: false;
  runtimeEnforcement: 'not_implemented';
};

export const SCHEDULE_PERMISSION_DEPENDENCIES: readonly SchedulePermissionDependencyDescriptor[] = [
  {
    capability: 'read full published branch schedule',
    appliesTo: ['weekly grid', 'published schedule view'],
    catalogKey: null,
    hardCodedPermissionKey: false,
    runtimeEnforcement: 'not_implemented',
  },
  {
    capability: 'read own published schedule',
    appliesTo: ['teacher own-read weekly grid', 'today schedule panel'],
    catalogKey: null,
    hardCodedPermissionKey: false,
    runtimeEnforcement: 'not_implemented',
  },
  {
    capability: 'create schedule draft',
    appliesTo: ['draft list', 'create draft action placeholder'],
    catalogKey: null,
    hardCodedPermissionKey: false,
    runtimeEnforcement: 'not_implemented',
  },
  {
    capability: 'update draft events',
    appliesTo: ['event editor modal', 'event delete placeholder'],
    catalogKey: null,
    hardCodedPermissionKey: false,
    runtimeEnforcement: 'not_implemented',
  },
  {
    capability: 'update event assignments',
    appliesTo: ['Teacher StudentGroup Course Room TimeSlot selectors'],
    catalogKey: null,
    hardCodedPermissionKey: false,
    runtimeEnforcement: 'not_implemented',
  },
  {
    capability: 'validate schedule hard conflicts',
    appliesTo: ['validation action placeholder', 'validation result'],
    catalogKey: null,
    hardCodedPermissionKey: false,
    runtimeEnforcement: 'not_implemented',
  },
  {
    capability: 'read schedule hard conflicts',
    appliesTo: ['conflict panel'],
    catalogKey: null,
    hardCodedPermissionKey: false,
    runtimeEnforcement: 'not_implemented',
  },
  {
    capability: 'publish or unpublish schedule',
    appliesTo: ['publish confirmation', 'published read-only transition'],
    catalogKey: null,
    hardCodedPermissionKey: false,
    runtimeEnforcement: 'not_implemented',
  },
] as const;

export type ScheduleApiContractEndpointDescriptor = {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  purpose: string;
  capabilityDependency: string;
  catalogKey: null;
  requiredRequestHeaders: readonly string[];
  expectedResponseHeaders: readonly string[];
  successStatus: 200 | 201 | 204;
  mutation: boolean;
  bindingStatus: 'blocked';
  runtimeHandlerRegistered: false;
  runtimeEndpointAssumption: false;
};

export const SCHEDULE_M3_API_DEPENDENCY_DESCRIPTORS: readonly ScheduleApiContractEndpointDescriptor[] = [
  {
    method: 'POST',
    path: '/api/v1/schedules/drafts',
    purpose: 'create branch-scoped weekly draft',
    capabilityDependency: 'create schedule draft',
    catalogKey: null,
    requiredRequestHeaders: [],
    expectedResponseHeaders: ['ETag'],
    successStatus: 201,
    mutation: true,
    bindingStatus: 'blocked',
    runtimeHandlerRegistered: false,
    runtimeEndpointAssumption: false,
  },
  {
    method: 'POST',
    path: '/api/v1/schedules/:scheduleId/events',
    purpose: 'create draft event with hard-conflict rejection',
    capabilityDependency: 'update draft events',
    catalogKey: null,
    requiredRequestHeaders: ['If-Match'],
    expectedResponseHeaders: ['ETag'],
    successStatus: 201,
    mutation: true,
    bindingStatus: 'blocked',
    runtimeHandlerRegistered: false,
    runtimeEndpointAssumption: false,
  },
  {
    method: 'PATCH',
    path: '/api/v1/schedules/:scheduleId/events/:eventId',
    purpose: 'update draft event and assignment fields',
    capabilityDependency: 'update draft events and update event assignments',
    catalogKey: null,
    requiredRequestHeaders: ['If-Match'],
    expectedResponseHeaders: ['ETag'],
    successStatus: 200,
    mutation: true,
    bindingStatus: 'blocked',
    runtimeHandlerRegistered: false,
    runtimeEndpointAssumption: false,
  },
  {
    method: 'DELETE',
    path: '/api/v1/schedules/:scheduleId/events/:eventId',
    purpose: 'delete draft event only',
    capabilityDependency: 'update draft events',
    catalogKey: null,
    requiredRequestHeaders: ['If-Match'],
    expectedResponseHeaders: ['ETag'],
    successStatus: 204,
    mutation: true,
    bindingStatus: 'blocked',
    runtimeHandlerRegistered: false,
    runtimeEndpointAssumption: false,
  },
  {
    method: 'POST',
    path: '/api/v1/schedules/:scheduleId/conflicts/validate',
    purpose: 'run full or affected hard-conflict validation',
    capabilityDependency: 'validate schedule hard conflicts and read schedule hard conflicts',
    catalogKey: null,
    requiredRequestHeaders: ['If-Match'],
    expectedResponseHeaders: ['ETag'],
    successStatus: 200,
    mutation: true,
    bindingStatus: 'blocked',
    runtimeHandlerRegistered: false,
    runtimeEndpointAssumption: false,
  },
  {
    method: 'POST',
    path: '/api/v1/schedules/:scheduleId/publish',
    purpose: 'publish current validated conflict-free non-empty draft',
    capabilityDependency: 'publish or unpublish schedule',
    catalogKey: null,
    requiredRequestHeaders: ['If-Match'],
    expectedResponseHeaders: ['ETag'],
    successStatus: 200,
    mutation: true,
    bindingStatus: 'blocked',
    runtimeHandlerRegistered: false,
    runtimeEndpointAssumption: false,
  },
  {
    method: 'POST',
    path: '/api/v1/schedules/:scheduleId/unpublish',
    purpose: 'transition published schedule to unpublished with reason',
    capabilityDependency: 'publish or unpublish schedule',
    catalogKey: null,
    requiredRequestHeaders: ['If-Match'],
    expectedResponseHeaders: ['ETag'],
    successStatus: 200,
    mutation: true,
    bindingStatus: 'blocked',
    runtimeHandlerRegistered: false,
    runtimeEndpointAssumption: false,
  },
  {
    method: 'GET',
    path: '/api/v1/schedules/published',
    purpose: 'read active published schedule using full branch or own-read projection',
    capabilityDependency: 'read full published branch schedule or read own published schedule',
    catalogKey: null,
    requiredRequestHeaders: [],
    expectedResponseHeaders: ['ETag'],
    successStatus: 200,
    mutation: false,
    bindingStatus: 'blocked',
    runtimeHandlerRegistered: false,
    runtimeEndpointAssumption: false,
  },
] as const;

export const SCHEDULE_PUBLISH_GATE_DESCRIPTOR = {
  bindingStatus: 'blocked',
  apiBinding: 'not_connected',
  requiresDraftStatus: true,
  requiresAtLeastOneEvent: true,
  requiresFullValidation: true,
  affectedValidationAccepted: false,
  requiresValidationOnCurrentVersion: true,
  requiresHardConflictCountZero: true,
  requiresNoPublishedPeriodConflict: true,
  publishedAndUnpublishedEventsImmutable: true,
  confirmationActionEnabled: false,
} as const;

export const SCHEDULE_VERSION_CONTRACT_DESCRIPTOR = {
  responseHeader: 'ETag',
  mutationHeader: 'If-Match',
  missingHeaderStatus: 428,
  missingHeaderCode: 'SCHEDULE_VERSION_REQUIRED',
  staleVersionStatus: 412,
  staleVersionCode: 'SCHEDULE_VERSION_MISMATCH',
  automaticRetryEnabled: false,
  localMutationMergeEnabled: false,
  bindingStatus: 'blocked',
} as const;

export const OPERATIONS_API_DEPENDENCIES: readonly OperationsApiDependency[] = [
  {
    module: 'daily_operation',
    contractStatus: 'not_approved',
    bindingStatus: 'blocked',
    expectedCapabilities: [
      'read daily operational summary',
      'read teacher own daily summary',
      'read published schedule summary',
      'read leave impact summary',
      'read missing attendance summary',
      'close operational day',
    ],
    requiredContractArtifacts: COMMON_CONTRACT_ARTIFACTS,
    sensitiveDataBoundary: COMMON_SENSITIVE_BOUNDARY,
    runtimeEndpointAssumption: false,
  },
  {
    module: 'schedule',
    contractStatus: 'm3_contract_draft_alignment_only',
    bindingStatus: 'blocked',
    expectedCapabilities: [
      'list and create schedule drafts',
      'read published schedule',
      'read teacher own published schedule',
      'create update and delete draft events',
      'validate full and affected draft scope',
      'read hard-conflict summary',
      'publish and unpublish schedule',
    ],
    requiredContractArtifacts: [
      ...COMMON_CONTRACT_ARTIFACTS,
      'Branch Course Room TimeSlot Teacher and StudentGroup reference contract',
      'schedule lifecycle and immutable published-state rules',
      'ETag and If-Match version contract',
      'full validation publish gate',
      'teacher own-read and viewer read-only projection contract',
      'hard-conflict reason-code catalog',
    ],
    sensitiveDataBoundary: COMMON_SENSITIVE_BOUNDARY,
    runtimeEndpointAssumption: false,
  },
  {
    module: 'attendance',
    contractStatus: 'not_approved',
    bindingStatus: 'blocked',
    expectedCapabilities: [
      'read attendance sessions',
      'read teacher own attendance sessions',
      'read one attendance session',
      'submit own attendance',
      'read missing attendance summary',
      'consume published-schedule-derived session reference after M3 runtime approval',
    ],
    requiredContractArtifacts: [
      ...COMMON_CONTRACT_ARTIFACTS,
      'attendance session lifecycle',
      'published Schedule to AttendanceSession generation contract',
      'record lock and update rules',
      'student roster minimum-field policy',
    ],
    sensitiveDataBoundary: [
      ...COMMON_SENSITIVE_BOUNDARY,
      'student roster remains blocked until minimum-field policy approval',
      'absence notification data remains outside this binding slice',
    ],
    runtimeEndpointAssumption: false,
  },
] as const;
