import type { AccessDeniedReason } from './access-state';
import type { CoreDefinitionModule } from './core-definitions.routes';

export type UiState = 'loading' | 'empty' | 'error' | 'forbidden';

export type SkeletonImplementationScope = {
  status: 'descriptor_only';
  runtimeImplementationStarted: false;
  apiBindingStarted: false;
  permissionEnforcementStarted: false;
  note: string;
};

export type SkeletonComponentDescriptor = {
  name: string;
  module: CoreDefinitionModule | 'shared';
  route: string;
  stateCoverage: readonly UiState[];
  displays: readonly string[];
  doesNotDisplay: readonly string[];
  futureRenderTestChecklist: readonly string[];
  implementationScope: SkeletonImplementationScope;
  apiBinding: 'not_connected';
  submitEnabled: false;
  permissionBinding: 'pending_catalog';
};

const SAFE_DISPLAY_FIELDS = ['title', 'status badge', 'contract notice', 'disabled action placeholder'] as const;

const BLOCKED_SENSITIVE_FIELDS = [
  'student name',
  'student identity number',
  'parent phone',
  'parent email',
  'guardian contact',
  'notification payload',
  'message body',
  'counseling note',
  'token',
  'credential',
] as const;

export const CORE_DEFINITIONS_FUTURE_RENDER_TEST_CHECKLIST = [
  'Do not render student name.',
  'Do not render student identity number.',
  'Do not render parent phone.',
  'Do not render parent email.',
  'Do not render guardian contact.',
  'Do not render notification payload.',
  'Do not render message body.',
  'Do not render counseling note.',
  'Do not render token.',
  'Do not render credential.',
  'Do not enable submit before API contract and Permission Catalog binding are accepted.',
] as const;

const DESCRIPTOR_ONLY_SCOPE: SkeletonImplementationScope = {
  status: 'descriptor_only',
  runtimeImplementationStarted: false,
  apiBindingStarted: false,
  permissionEnforcementStarted: false,
  note: 'Skeleton descriptor only. This must not be treated as a working UI, API binding, or runtime permission implementation.',
};

const TIME_SLOT_DESCRIPTOR_ONLY_SCOPE: SkeletonImplementationScope = {
  status: 'descriptor_only',
  runtimeImplementationStarted: false,
  apiBindingStarted: false,
  permissionEnforcementStarted: false,
  note: 'TimeSlot skeleton is not a runtime TimeSlot implementation kickoff. It is only a placeholder for future UX planning.',
};

export const CORE_DEFINITIONS_COMPONENT_SKELETONS: readonly SkeletonComponentDescriptor[] = [
  {
    name: 'CoreDefinitionsLayout',
    module: 'shared',
    route: '/app/definitions',
    stateCoverage: ['loading', 'empty', 'error', 'forbidden'],
    displays: ['section tabs', ...SAFE_DISPLAY_FIELDS],
    doesNotDisplay: BLOCKED_SENSITIVE_FIELDS,
    futureRenderTestChecklist: CORE_DEFINITIONS_FUTURE_RENDER_TEST_CHECKLIST,
    implementationScope: DESCRIPTOR_ONLY_SCOPE,
    apiBinding: 'not_connected',
    submitEnabled: false,
    permissionBinding: 'pending_catalog',
  },
  {
    name: 'CourseListSkeleton',
    module: 'course',
    route: '/app/definitions/courses',
    stateCoverage: ['loading', 'empty', 'error', 'forbidden'],
    displays: ['course name placeholder', 'course code placeholder', ...SAFE_DISPLAY_FIELDS],
    doesNotDisplay: BLOCKED_SENSITIVE_FIELDS,
    futureRenderTestChecklist: CORE_DEFINITIONS_FUTURE_RENDER_TEST_CHECKLIST,
    implementationScope: DESCRIPTOR_ONLY_SCOPE,
    apiBinding: 'not_connected',
    submitEnabled: false,
    permissionBinding: 'pending_catalog',
  },
  {
    name: 'CourseFormSkeleton',
    module: 'course',
    route: '/app/definitions/courses',
    stateCoverage: ['empty', 'error', 'forbidden'],
    displays: ['disabled name field', 'disabled code field', 'disabled description field', ...SAFE_DISPLAY_FIELDS],
    doesNotDisplay: BLOCKED_SENSITIVE_FIELDS,
    futureRenderTestChecklist: CORE_DEFINITIONS_FUTURE_RENDER_TEST_CHECKLIST,
    implementationScope: DESCRIPTOR_ONLY_SCOPE,
    apiBinding: 'not_connected',
    submitEnabled: false,
    permissionBinding: 'pending_catalog',
  },
  {
    name: 'RoomListSkeleton',
    module: 'room',
    route: '/app/definitions/rooms',
    stateCoverage: ['loading', 'empty', 'error', 'forbidden'],
    displays: ['room name placeholder', 'capacity placeholder', ...SAFE_DISPLAY_FIELDS],
    doesNotDisplay: BLOCKED_SENSITIVE_FIELDS,
    futureRenderTestChecklist: CORE_DEFINITIONS_FUTURE_RENDER_TEST_CHECKLIST,
    implementationScope: DESCRIPTOR_ONLY_SCOPE,
    apiBinding: 'not_connected',
    submitEnabled: false,
    permissionBinding: 'pending_catalog',
  },
  {
    name: 'RoomFormSkeleton',
    module: 'room',
    route: '/app/definitions/rooms',
    stateCoverage: ['empty', 'error', 'forbidden'],
    displays: ['disabled room fields', 'availability contract notice', ...SAFE_DISPLAY_FIELDS],
    doesNotDisplay: BLOCKED_SENSITIVE_FIELDS,
    futureRenderTestChecklist: CORE_DEFINITIONS_FUTURE_RENDER_TEST_CHECKLIST,
    implementationScope: DESCRIPTOR_ONLY_SCOPE,
    apiBinding: 'not_connected',
    submitEnabled: false,
    permissionBinding: 'pending_catalog',
  },
  {
    name: 'TimeSlotGridSkeleton',
    module: 'time_slot',
    route: '/app/definitions/time-slots',
    stateCoverage: ['loading', 'empty', 'error', 'forbidden'],
    displays: ['day placeholder', 'time range placeholder', ...SAFE_DISPLAY_FIELDS],
    doesNotDisplay: BLOCKED_SENSITIVE_FIELDS,
    futureRenderTestChecklist: CORE_DEFINITIONS_FUTURE_RENDER_TEST_CHECKLIST,
    implementationScope: TIME_SLOT_DESCRIPTOR_ONLY_SCOPE,
    apiBinding: 'not_connected',
    submitEnabled: false,
    permissionBinding: 'pending_catalog',
  },
  {
    name: 'TimeSlotFormSkeleton',
    module: 'time_slot',
    route: '/app/definitions/time-slots',
    stateCoverage: ['empty', 'error', 'forbidden'],
    displays: ['disabled day field', 'disabled start/end fields', 'calendar contract notice', ...SAFE_DISPLAY_FIELDS],
    doesNotDisplay: BLOCKED_SENSITIVE_FIELDS,
    futureRenderTestChecklist: CORE_DEFINITIONS_FUTURE_RENDER_TEST_CHECKLIST,
    implementationScope: TIME_SLOT_DESCRIPTOR_ONLY_SCOPE,
    apiBinding: 'not_connected',
    submitEnabled: false,
    permissionBinding: 'pending_catalog',
  },
];

export type ForbiddenStatePreview = {
  reason: AccessDeniedReason;
  route: string;
  componentName: string;
  showsSensitiveData: false;
};

export function buildForbiddenStatePreview(
  reason: AccessDeniedReason,
  descriptor: SkeletonComponentDescriptor,
): ForbiddenStatePreview {
  return {
    reason,
    route: descriptor.route,
    componentName: descriptor.name,
    showsSensitiveData: false,
  };
}
