import type { AccessDeniedReason } from './access-state';
import type { CoreDefinitionModule } from './core-definitions.routes';

export type UiState = 'loading' | 'empty' | 'error' | 'forbidden';

export type SkeletonComponentDescriptor = {
  name: string;
  module: CoreDefinitionModule | 'shared';
  route: string;
  stateCoverage: readonly UiState[];
  displays: readonly string[];
  doesNotDisplay: readonly string[];
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

export const CORE_DEFINITIONS_COMPONENT_SKELETONS: readonly SkeletonComponentDescriptor[] = [
  {
    name: 'CoreDefinitionsLayout',
    module: 'shared',
    route: '/app/definitions',
    stateCoverage: ['loading', 'empty', 'error', 'forbidden'],
    displays: ['section tabs', ...SAFE_DISPLAY_FIELDS],
    doesNotDisplay: BLOCKED_SENSITIVE_FIELDS,
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
