import type { AccessDeniedReason } from './access-state';
import type { CoreDefinitionModule } from './core-definitions.routes';

export type UiState = 'loading' | 'empty' | 'error' | 'forbidden';

/**
 * Accessibility configuration for skeleton components
 * Defines ARIA attributes, keyboard navigation, color contrast, and reduced motion support
 */
export type AccessibilityConfig = {
  /** ARIA role for the component container */
  role: string;
  /** ARIA label describing the component's purpose */
  ariaLabel: string;
  /** ARIA live region policy for dynamic content updates */
  ariaLive?: 'off' | 'polite' | 'assertive';
  /** ARIA atomic setting for live regions */
  ariaAtomic?: boolean;
  /** Indicates if the component contains interactive elements requiring keyboard navigation */
  hasInteractiveElements: boolean;
  /** Tabindex strategy for focus management */
  tabindexStrategy: 'none' | 'container' | 'individual';
  /** Focus indicator style requirement */
  focusIndicatorRequired: boolean;
  /** Minimum color contrast ratio for text (WCAG 2.1 AA requires 4.5:1 for normal text) */
  minimumContrastRatio: number;
  /** Color contrast requirements for state indicators */
  stateIndicatorContrast: {
    loading: { foreground: string; background: string; minRatio: number };
    empty: { foreground: string; background: string; minRatio: number };
    error: { foreground: string; background: string; minRatio: number };
    forbidden: { foreground: string; background: string; minRatio: number };
  };
  /** Reduced motion alternative - disables animations for users with vestibular disorders */
  reducedMotionAlternative: {
    enabled: boolean;
    prefersReducedMotionQuery: string;
    fallbackBehavior: 'static' | 'minimal-animation';
  };
  /** Screen reader announcement for state changes */
  stateAnnouncements?: Partial<Record<UiState, string>>;
};

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
  /** Accessibility configuration for screen readers, keyboard navigation, and reduced motion */
  accessibility: AccessibilityConfig;
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

/**
 * Default accessibility configuration meeting WCAG 2.1 AA standards
 */
const DEFAULT_ACCESSIBILITY_CONFIG: AccessibilityConfig = {
  role: 'region',
  ariaLabel: 'Content loading placeholder',
  ariaLive: 'polite',
  ariaAtomic: true,
  hasInteractiveElements: false,
  tabindexStrategy: 'none',
  focusIndicatorRequired: true,
  minimumContrastRatio: 4.5,
  stateIndicatorContrast: {
    loading: { foreground: '#666666', background: '#F5F5F5', minRatio: 4.5 },
    empty: { foreground: '#666666', background: '#FFFFFF', minRatio: 4.5 },
    error: { foreground: '#D32F2F', background: '#FFEBEE', minRatio: 4.5 },
    forbidden: { foreground: '#F57C00', background: '#FFF3E0', minRatio: 4.5 },
  },
  reducedMotionAlternative: {
    enabled: true,
    prefersReducedMotionQuery: '@media (prefers-reduced-motion: reduce)',
    fallbackBehavior: 'static',
  },
  stateAnnouncements: {
    loading: 'Loading content...',
    empty: 'No content available',
    error: 'An error occurred while loading content',
    forbidden: 'Access denied to this content',
  },
};

/**
 * Accessibility configuration for components with interactive elements (forms, buttons)
 */
const INTERACTIVE_ACCESSIBILITY_CONFIG: AccessibilityConfig = {
  ...DEFAULT_ACCESSIBILITY_CONFIG,
  hasInteractiveElements: true,
  tabindexStrategy: 'individual',
  role: 'form',
  stateAnnouncements: {
    ...DEFAULT_ACCESSIBILITY_CONFIG.stateAnnouncements,
    loading: 'Loading form fields...',
    error: 'Form validation errors present',
  },
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
    accessibility: {
      ...DEFAULT_ACCESSIBILITY_CONFIG,
      ariaLabel: 'Core definitions navigation and content area',
      role: 'navigation',
      stateAnnouncements: {
        ...DEFAULT_ACCESSIBILITY_CONFIG.stateAnnouncements,
        loading: 'Loading core definitions sections...',
      },
    },
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
    accessibility: {
      ...DEFAULT_ACCESSIBILITY_CONFIG,
      ariaLabel: 'Course list with loading placeholders',
      role: 'list',
      stateAnnouncements: {
        ...DEFAULT_ACCESSIBILITY_CONFIG.stateAnnouncements,
        loading: 'Loading course list...',
        empty: 'No courses available',
      },
    },
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
    accessibility: {
      ...INTERACTIVE_ACCESSIBILITY_CONFIG,
      ariaLabel: 'Course creation form with disabled fields',
      stateAnnouncements: {
        ...INTERACTIVE_ACCESSIBILITY_CONFIG.stateAnnouncements,
        empty: 'Course form fields are currently unavailable',
      },
    },
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
    accessibility: {
      ...DEFAULT_ACCESSIBILITY_CONFIG,
      ariaLabel: 'Room list with loading placeholders',
      role: 'list',
      stateAnnouncements: {
        ...DEFAULT_ACCESSIBILITY_CONFIG.stateAnnouncements,
        loading: 'Loading room list...',
        empty: 'No rooms available',
      },
    },
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
    accessibility: {
      ...INTERACTIVE_ACCESSIBILITY_CONFIG,
      ariaLabel: 'Room creation form with disabled fields',
      stateAnnouncements: {
        ...INTERACTIVE_ACCESSIBILITY_CONFIG.stateAnnouncements,
        empty: 'Room form fields are currently unavailable',
      },
    },
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
    accessibility: {
      ...DEFAULT_ACCESSIBILITY_CONFIG,
      ariaLabel: 'Time slot grid with loading placeholders',
      role: 'grid',
      stateAnnouncements: {
        ...DEFAULT_ACCESSIBILITY_CONFIG.stateAnnouncements,
        loading: 'Loading time slot grid...',
        empty: 'No time slots configured',
      },
    },
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
    accessibility: {
      ...INTERACTIVE_ACCESSIBILITY_CONFIG,
      ariaLabel: 'Time slot creation form with disabled fields',
      stateAnnouncements: {
        ...INTERACTIVE_ACCESSIBILITY_CONFIG.stateAnnouncements,
        empty: 'Time slot form fields are currently unavailable',
      },
    },
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
