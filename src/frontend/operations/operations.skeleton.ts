import type { OperationsModule } from './operations.routes';
import type { OperationsUiState, ScheduleContractUiState } from './operations.states';
import type { UiStateVisualPattern, DisclosureTier, BreadcrumbSegment } from './operations.visual-hierarchy';

/**
 * Accessibility configuration for operations skeleton components
 * Defines ARIA attributes, keyboard navigation, color contrast, and reduced motion support
 */
export type OperationsAccessibilityConfig = {
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
    contract_pending: { foreground: string; background: string; minRatio: number };
  };
  /** Reduced motion alternative - disables animations for users with vestibular disorders */
  reducedMotionAlternative: {
    enabled: boolean;
    prefersReducedMotionQuery: string;
    fallbackBehavior: 'static' | 'minimal-animation';
  };
  /** Screen reader announcement for state changes */
  stateAnnouncements?: Partial<Record<OperationsUiState, string>>;
};

export type OperationsComponentDescriptor = {
  name: string;
  module: OperationsModule | 'shared';
  route: string;
  stateCoverage: readonly OperationsUiState[];
  contractStateCoverage?: readonly ScheduleContractUiState[];
  displays: readonly string[];
  doesNotDisplay: readonly string[];
  contractDependencies?: readonly string[];
  roleBoundaryNote?: string;
  apiBinding: 'not_connected';
  permissionBinding: 'pending_catalog';
  interactionEnabled: false;
  submitEnabled: false;
  runtimeComponent: false;
  /** Accessibility configuration for screen readers, keyboard navigation, and reduced motion */
  accessibility: OperationsAccessibilityConfig;

  // Visual Hierarchy Extensions
  visualPattern?: UiStateVisualPattern;
  defaultDisclosureTier?: DisclosureTier;
  breadcrumbOverride?: readonly BreadcrumbSegment[];
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
  'student roster',
  'student note',
  'parent phone',
  'parent email',
  'guardian contact',
  'notification payload',
  'message body',
  'counseling note',
  'tenant id',
  'raw request payload',
  'raw response payload',
  'cross-tenant existence signal',
  'authorization header',
  'token',
  'credential',
] as const;

const SCHEDULE_CONTRACT_DEPENDENCIES = [
  'M3 Schedule contract draft in Issue #40',
  'Permission Catalog capability mapping',
  '403 and own-scope error mapping',
  'ETag response and If-Match mutation contract',
  'full hard-conflict validation result contract',
  'publish gate and immutable published lifecycle',
  'Branch Course Room TimeSlot Teacher StudentGroup reference contracts',
] as const;

/**
 * Default accessibility configuration for operations components meeting WCAG 2.1 AA standards
 */
const OPERATIONS_DEFAULT_ACCESSIBILITY: OperationsAccessibilityConfig = {
  role: 'region',
  ariaLabel: 'Operations content loading placeholder',
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
    contract_pending: { foreground: '#1976D2', background: '#E3F2FD', minRatio: 4.5 },
  },
  reducedMotionAlternative: {
    enabled: true,
    prefersReducedMotionQuery: '@media (prefers-reduced-motion: reduce)',
    fallbackBehavior: 'static',
  },
  stateAnnouncements: {
    loading: 'Loading operations content...',
    empty: 'No operations data available',
    error: 'An error occurred while loading operations data',
    forbidden: 'Access denied to this operations content',
    contract_pending: 'Waiting for contract dependencies to be resolved',
  },
};

/**
 * Accessibility configuration for interactive operations components (forms, editors)
 */
const OPERATIONS_INTERACTIVE_ACCESSIBILITY: OperationsAccessibilityConfig = {
  ...OPERATIONS_DEFAULT_ACCESSIBILITY,
  hasInteractiveElements: true,
  tabindexStrategy: 'individual',
  role: 'form',
  stateAnnouncements: {
    ...OPERATIONS_DEFAULT_ACCESSIBILITY.stateAnnouncements,
    loading: 'Loading form fields...',
    error: 'Form validation errors present',
  },
};

export const OPERATIONS_COMPONENT_SKELETONS: readonly OperationsComponentDescriptor[] = [
  {
    name: 'DailyOperationPageSkeleton',
    module: 'daily_operation',
    route: '/app/today',
    stateCoverage: ['loading', 'empty', 'error', 'forbidden', 'contract_pending'],
    displays: ['daily summary placeholders', ...OPERATIONS_SAFE_DISPLAY_FIELDS],
    doesNotDisplay: OPERATIONS_FUTURE_RENDER_BLOCKLIST,
    contractDependencies: ['published schedule summary contract', 'daily operation API contract'],
    roleBoundaryNote: 'Tenant Admin and Operations Manager management placeholder; Teacher own-read; Viewer read-only.',
    apiBinding: 'not_connected',
    permissionBinding: 'pending_catalog',
    interactionEnabled: false,
    submitEnabled: false,
    runtimeComponent: false,
    accessibility: {
      ...OPERATIONS_DEFAULT_ACCESSIBILITY,
      ariaLabel: 'Daily operations page with summary placeholders',
      role: 'main',
      stateAnnouncements: {
        ...OPERATIONS_DEFAULT_ACCESSIBILITY.stateAnnouncements,
        loading: 'Loading daily operations...',
        contract_pending: 'Waiting for schedule and operations contracts...',
      },
    },
  },
  {
    name: 'TodaySchedulePanelSkeleton',
    module: 'daily_operation',
    route: '/app/today',
    stateCoverage: ['loading', 'empty', 'error', 'forbidden', 'contract_pending'],
    displays: ['published schedule count placeholder', 'time block placeholder', ...OPERATIONS_SAFE_DISPLAY_FIELDS],
    doesNotDisplay: OPERATIONS_FUTURE_RENDER_BLOCKLIST,
    contractDependencies: ['published schedule projection contract'],
    roleBoundaryNote: 'Teacher projection must remain own-read and cannot expose draft or other-teacher schedule existence.',
    apiBinding: 'not_connected',
    permissionBinding: 'pending_catalog',
    interactionEnabled: false,
    submitEnabled: false,
    runtimeComponent: false,
    accessibility: {
      ...OPERATIONS_DEFAULT_ACCESSIBILITY,
      ariaLabel: "Today's schedule panel",
      role: 'region',
      stateAnnouncements: {
        ...OPERATIONS_DEFAULT_ACCESSIBILITY.stateAnnouncements,
        loading: 'Loading today\'s schedule...',
        empty: 'No scheduled events for today',
      },
    },
  },
  {
    name: 'LeaveImpactPlaceholder',
    module: 'daily_operation',
    route: '/app/today',
    stateCoverage: ['empty', 'error', 'forbidden', 'contract_pending'],
    displays: ['leave-impact contract notice', 'replacement-teacher placeholder', ...OPERATIONS_SAFE_DISPLAY_FIELDS],
    doesNotDisplay: OPERATIONS_FUTURE_RENDER_BLOCKLIST,
    contractDependencies: ['leave impact contract outside M3 Schedule binding'],
    apiBinding: 'not_connected',
    permissionBinding: 'pending_catalog',
    interactionEnabled: false,
    submitEnabled: false,
    runtimeComponent: false,
    accessibility: {
      ...OPERATIONS_DEFAULT_ACCESSIBILITY,
      ariaLabel: 'Leave impact information placeholder',
      ariaLive: 'polite',
      stateAnnouncements: {
        ...OPERATIONS_DEFAULT_ACCESSIBILITY.stateAnnouncements,
        empty: 'No leave impact information available',
        contract_pending: 'Waiting for leave impact contract...',
      },
    },
  },
  {
    name: 'DailyClosurePanelSkeleton',
    module: 'daily_operation',
    route: '/app/today',
    stateCoverage: ['empty', 'error', 'forbidden', 'contract_pending'],
    displays: ['closure checklist placeholder', ...OPERATIONS_SAFE_DISPLAY_FIELDS],
    doesNotDisplay: OPERATIONS_FUTURE_RENDER_BLOCKLIST,
    contractDependencies: ['daily closure API contract'],
    apiBinding: 'not_connected',
    permissionBinding: 'pending_catalog',
    interactionEnabled: false,
    submitEnabled: false,
    runtimeComponent: false,
    accessibility: {
      ...OPERATIONS_INTERACTIVE_ACCESSIBILITY,
      ariaLabel: 'Daily closure checklist',
      stateAnnouncements: {
        ...OPERATIONS_INTERACTIVE_ACCESSIBILITY.stateAnnouncements,
        empty: 'Daily closure checklist unavailable',
      },
    },
  },
  {
    name: 'SchedulePageSkeleton',
    module: 'schedule',
    route: '/app/schedule',
    stateCoverage: ['loading', 'empty', 'error', 'forbidden', 'contract_pending'],
    contractStateCoverage: ['draft_list_ready', 'weekly_grid_ready', 'published_read_only'],
    displays: ['schedule shell placeholder', 'lifecycle status placeholder', 'version placeholder', ...OPERATIONS_SAFE_DISPLAY_FIELDS],
    doesNotDisplay: OPERATIONS_FUTURE_RENDER_BLOCKLIST,
    contractDependencies: SCHEDULE_CONTRACT_DEPENDENCIES,
    roleBoundaryNote: 'Management placeholders may see draft surfaces; Teacher own-events and Viewer contract read-only projections use only published_read_only.',
    apiBinding: 'not_connected',
    permissionBinding: 'pending_catalog',
    interactionEnabled: false,
    submitEnabled: false,
    runtimeComponent: false,
    accessibility: {
      ...OPERATIONS_DEFAULT_ACCESSIBILITY,
      ariaLabel: 'Schedule management page',
      role: 'main',
      stateAnnouncements: {
        ...OPERATIONS_DEFAULT_ACCESSIBILITY.stateAnnouncements,
        loading: 'Loading schedule page...',
        contract_pending: 'Waiting for schedule contracts...',
      },
    },
  },
  {
    name: 'ScheduleDraftListSkeleton',
    module: 'schedule',
    route: '/app/schedule',
    stateCoverage: ['loading', 'empty', 'error', 'forbidden', 'contract_pending'],
    contractStateCoverage: ['draft_list_ready'],
    displays: [
      'draft name placeholder',
      'effective date range placeholder',
      'event count placeholder',
      'validation status placeholder',
      'version placeholder',
      ...OPERATIONS_SAFE_DISPLAY_FIELDS,
    ],
    doesNotDisplay: OPERATIONS_FUTURE_RENDER_BLOCKLIST,
    contractDependencies: SCHEDULE_CONTRACT_DEPENDENCIES,
    roleBoundaryNote: 'Visible only to Tenant Admin and Operations Manager placeholders; Teacher and Viewer draft discovery remains hidden.',
    apiBinding: 'not_connected',
    permissionBinding: 'pending_catalog',
    interactionEnabled: false,
    submitEnabled: false,
    runtimeComponent: false,
    accessibility: {
      ...OPERATIONS_DEFAULT_ACCESSIBILITY,
      ariaLabel: 'Schedule drafts list',
      role: 'list',
      stateAnnouncements: {
        ...OPERATIONS_DEFAULT_ACCESSIBILITY.stateAnnouncements,
        loading: 'Loading schedule drafts...',
        empty: 'No schedule drafts available',
      },
    },
  },
  {
    name: 'ScheduleWeeklyGridSkeleton',
    module: 'schedule',
    route: '/app/schedule',
    stateCoverage: ['loading', 'empty', 'error', 'forbidden', 'contract_pending'],
    contractStateCoverage: ['weekly_grid_ready', 'published_read_only'],
    displays: [
      'day columns placeholder',
      'TimeSlot row placeholder',
      'teacher display-name placeholder',
      'StudentGroup summary placeholder',
      'Course and Room label placeholder',
      ...OPERATIONS_SAFE_DISPLAY_FIELDS,
    ],
    doesNotDisplay: OPERATIONS_FUTURE_RENDER_BLOCKLIST,
    contractDependencies: SCHEDULE_CONTRACT_DEPENDENCIES,
    roleBoundaryNote: 'weekly_grid_ready is management draft-only. Teacher sees only own published events; Viewer sees only the contract-approved published read-only projection.',
    apiBinding: 'not_connected',
    permissionBinding: 'pending_catalog',
    interactionEnabled: false,
    submitEnabled: false,
    runtimeComponent: false,
    accessibility: {
      ...OPERATIONS_DEFAULT_ACCESSIBILITY,
      ariaLabel: 'Weekly schedule grid',
      role: 'grid',
      stateAnnouncements: {
        ...OPERATIONS_DEFAULT_ACCESSIBILITY.stateAnnouncements,
        loading: 'Loading weekly schedule grid...',
        empty: 'No schedule events in grid',
      },
    },
  },
  {
    name: 'ScheduleEventEditorModalSkeleton',
    module: 'schedule',
    route: '/app/schedule',
    stateCoverage: ['empty', 'error', 'forbidden', 'contract_pending'],
    contractStateCoverage: ['weekly_grid_ready', 'version_mismatch', 'version_required'],
    displays: [
      'Teacher selector placeholder',
      'StudentGroup selector placeholder',
      'Course selector placeholder',
      'Room selector placeholder',
      'TimeSlot selector placeholder',
      'If-Match dependency notice',
      ...OPERATIONS_SAFE_DISPLAY_FIELDS,
    ],
    doesNotDisplay: OPERATIONS_FUTURE_RENDER_BLOCKLIST,
    contractDependencies: SCHEDULE_CONTRACT_DEPENDENCIES,
    roleBoundaryNote: 'Create/update/delete controls are management-only placeholders and remain disabled; published and unpublished events are immutable.',
    apiBinding: 'not_connected',
    permissionBinding: 'pending_catalog',
    interactionEnabled: false,
    submitEnabled: false,
    runtimeComponent: false,
    accessibility: {
      ...OPERATIONS_INTERACTIVE_ACCESSIBILITY,
      ariaLabel: 'Schedule event editor form',
      role: 'dialog',
      ariaLive: 'assertive',
      stateAnnouncements: {
        ...OPERATIONS_INTERACTIVE_ACCESSIBILITY.stateAnnouncements,
        empty: 'Event editor form fields unavailable',
      },
    },
  },
  {
    name: 'ScheduleConflictPanelSkeleton',
    module: 'schedule',
    route: '/app/schedule',
    stateCoverage: ['empty', 'error', 'forbidden', 'contract_pending'],
    contractStateCoverage: ['validation_invalid', 'validation_stale', 'publish_blocked_hard_conflicts'],
    displays: [
      'hard conflict count placeholder',
      'teacher overlap group placeholder',
      'StudentGroup overlap group placeholder',
      'Room overlap group placeholder',
      'validation version placeholder',
      ...OPERATIONS_SAFE_DISPLAY_FIELDS,
    ],
    doesNotDisplay: OPERATIONS_FUTURE_RENDER_BLOCKLIST,
    contractDependencies: SCHEDULE_CONTRACT_DEPENDENCIES,
    roleBoundaryNote: 'Conflict read is management-only pending Permission Catalog; conflict details must remain allowlisted and role-safe.',
    apiBinding: 'not_connected',
    permissionBinding: 'pending_catalog',
    interactionEnabled: false,
    submitEnabled: false,
    runtimeComponent: false,
    accessibility: {
      ...OPERATIONS_DEFAULT_ACCESSIBILITY,
      ariaLabel: 'Schedule conflicts panel',
      ariaLive: 'assertive',
      stateIndicatorContrast: {
        ...OPERATIONS_DEFAULT_ACCESSIBILITY.stateIndicatorContrast,
        error: { foreground: '#C62828', background: '#FFEBEE', minRatio: 4.5 },
      },
      stateAnnouncements: {
        ...OPERATIONS_DEFAULT_ACCESSIBILITY.stateAnnouncements,
        empty: 'No scheduling conflicts detected',
        error: 'Scheduling conflicts detected',
      },
    },
  },
  {
    name: 'ScheduleValidationResultSkeleton',
    module: 'schedule',
    route: '/app/schedule',
    stateCoverage: ['loading', 'empty', 'error', 'forbidden', 'contract_pending'],
    contractStateCoverage: [
      'validation_not_validated',
      'validation_valid',
      'validation_invalid',
      'validation_stale',
    ],
    displays: [
      'validation status placeholder',
      'hard conflict count placeholder',
      'can publish placeholder',
      'validated schedule version placeholder',
      'validated-at placeholder',
      ...OPERATIONS_SAFE_DISPLAY_FIELDS,
    ],
    doesNotDisplay: OPERATIONS_FUTURE_RENDER_BLOCKLIST,
    contractDependencies: SCHEDULE_CONTRACT_DEPENDENCIES,
    roleBoundaryNote: 'Only full validation on the current version can satisfy the publish gate; affected validation never enables publish.',
    apiBinding: 'not_connected',
    permissionBinding: 'pending_catalog',
    interactionEnabled: false,
    submitEnabled: false,
    runtimeComponent: false,
    accessibility: {
      ...OPERATIONS_DEFAULT_ACCESSIBILITY,
      ariaLabel: 'Schedule validation results',
      ariaLive: 'polite',
      stateAnnouncements: {
        ...OPERATIONS_DEFAULT_ACCESSIBILITY.stateAnnouncements,
        loading: 'Loading validation results...',
        empty: 'No validation results available',
      },
    },
  },
  {
    name: 'SchedulePublishConfirmationSkeleton',
    module: 'schedule',
    route: '/app/schedule',
    stateCoverage: ['empty', 'error', 'forbidden', 'contract_pending'],
    contractStateCoverage: [
      'publish_confirmation',
      'publish_blocked_empty',
      'publish_blocked_validation_stale',
      'publish_blocked_hard_conflicts',
      'publish_blocked_period_conflict',
      'version_mismatch',
    ],
    displays: [
      'draft status condition',
      'event count condition',
      'current full validation condition',
      'hard conflict zero condition',
      'published period conflict condition',
      'distinct reason-code placeholder',
      'PII-free note placeholder',
      ...OPERATIONS_SAFE_DISPLAY_FIELDS,
    ],
    doesNotDisplay: OPERATIONS_FUTURE_RENDER_BLOCKLIST,
    contractDependencies: SCHEDULE_CONTRACT_DEPENDENCIES,
    roleBoundaryNote: 'Publish and unpublish are management-only placeholders; each blocked outcome preserves its contract reason code and no confirmation action is enabled.',
    apiBinding: 'not_connected',
    permissionBinding: 'pending_catalog',
    interactionEnabled: false,
    submitEnabled: false,
    runtimeComponent: false,
    accessibility: {
      ...OPERATIONS_INTERACTIVE_ACCESSIBILITY,
      ariaLabel: 'Schedule publish confirmation dialog',
      role: 'alertdialog',
      ariaLive: 'assertive',
      stateAnnouncements: {
        ...OPERATIONS_INTERACTIVE_ACCESSIBILITY.stateAnnouncements,
        empty: 'Publish confirmation unavailable',
        error: 'Publish blocked - review conditions',
      },
    },
  },
  {
    name: 'ScheduleStaleVersionWarningSkeleton',
    module: 'schedule',
    route: '/app/schedule',
    stateCoverage: ['error', 'contract_pending'],
    contractStateCoverage: ['validation_stale', 'publish_blocked_validation_stale', 'version_mismatch', 'version_required'],
    displays: [
      'stale version warning',
      'reload-required notice',
      'local mutation not applied notice',
      'ETag and If-Match contract notice',
      ...OPERATIONS_SAFE_DISPLAY_FIELDS,
    ],
    doesNotDisplay: OPERATIONS_FUTURE_RENDER_BLOCKLIST,
    contractDependencies: SCHEDULE_CONTRACT_DEPENDENCIES,
    roleBoundaryNote: 'No automatic retry, merge or mutation is attempted after 412, 422 stale-validation or 428 contract states.',
    apiBinding: 'not_connected',
    permissionBinding: 'pending_catalog',
    interactionEnabled: false,
    submitEnabled: false,
    runtimeComponent: false,
    accessibility: {
      ...OPERATIONS_DEFAULT_ACCESSIBILITY,
      ariaLabel: 'Stale version warning',
      role: 'alert',
      ariaLive: 'assertive',
      stateAnnouncements: {
        error: 'Version mismatch - reload required',
        contract_pending: 'Version contract pending',
      },
    },
  },
  {
    name: 'ScheduleForbiddenStateSkeleton',
    module: 'schedule',
    route: '/app/schedule',
    stateCoverage: ['forbidden'],
    contractStateCoverage: [],
    displays: ['403 reason placeholder', 'safe navigation placeholder', ...OPERATIONS_SAFE_DISPLAY_FIELDS],
    doesNotDisplay: OPERATIONS_FUTURE_RENDER_BLOCKLIST,
    contractDependencies: ['403 reason mapping', 'own-scope violation contract', 'tenant context contract'],
    roleBoundaryNote: 'Teacher draft/conflict/publish attempts and cross-scope requests resolve to safe 403 descriptors without existence disclosure.',
    apiBinding: 'not_connected',
    permissionBinding: 'pending_catalog',
    interactionEnabled: false,
    submitEnabled: false,
    runtimeComponent: false,
    accessibility: {
      ...OPERATIONS_DEFAULT_ACCESSIBILITY,
      ariaLabel: 'Access denied message',
      role: 'alert',
      ariaLive: 'assertive',
      stateAnnouncements: {
        forbidden: 'Access denied to this schedule section',
      },
    },
  },
  {
    name: 'AttendanceOverviewPageSkeleton',
    module: 'attendance',
    route: '/app/attendance',
    stateCoverage: ['loading', 'empty', 'error', 'forbidden', 'contract_pending'],
    displays: ['session count placeholder', 'missing-attendance placeholder', ...OPERATIONS_SAFE_DISPLAY_FIELDS],
    doesNotDisplay: OPERATIONS_FUTURE_RENDER_BLOCKLIST,
    contractDependencies: ['published schedule to attendance-session generation contract', 'attendance API contract'],
    roleBoundaryNote: 'Viewer hidden; Teacher own-read only. M3 does not generate AttendanceSession in this frontend slice.',
    apiBinding: 'not_connected',
    permissionBinding: 'pending_catalog',
    interactionEnabled: false,
    submitEnabled: false,
    runtimeComponent: false,
    accessibility: {
      ...OPERATIONS_DEFAULT_ACCESSIBILITY,
      ariaLabel: 'Attendance overview page',
      role: 'main',
      stateAnnouncements: {
        ...OPERATIONS_DEFAULT_ACCESSIBILITY.stateAnnouncements,
        loading: 'Loading attendance overview...',
        empty: 'No attendance sessions available',
      },
    },
  },
  {
    name: 'AttendanceSessionPageSkeleton',
    module: 'attendance',
    route: '/app/attendance/session/:sessionId',
    stateCoverage: ['loading', 'empty', 'error', 'forbidden', 'contract_pending'],
    displays: ['session metadata placeholder', 'PII-free roster boundary notice', ...OPERATIONS_SAFE_DISPLAY_FIELDS],
    doesNotDisplay: OPERATIONS_FUTURE_RENDER_BLOCKLIST,
    contractDependencies: ['attendance session lifecycle', 'student roster minimum-field policy'],
    roleBoundaryNote: 'Teacher own-read placeholder only; submit remains disabled until Attendance contract approval.',
    apiBinding: 'not_connected',
    permissionBinding: 'pending_catalog',
    interactionEnabled: false,
    submitEnabled: false,
    runtimeComponent: false,
    accessibility: {
      ...OPERATIONS_INTERACTIVE_ACCESSIBILITY,
      ariaLabel: 'Attendance session detail page',
      stateAnnouncements: {
        ...OPERATIONS_INTERACTIVE_ACCESSIBILITY.stateAnnouncements,
        loading: 'Loading attendance session...',
        empty: 'Attendance session data unavailable',
      },
    },
  },
  {
    name: 'AttendancePiiSafeEmptyState',
    module: 'attendance',
    route: '/app/attendance/session/:sessionId',
    stateCoverage: ['empty', 'forbidden', 'contract_pending'],
    displays: ['no student data message', ...OPERATIONS_SAFE_DISPLAY_FIELDS],
    doesNotDisplay: OPERATIONS_FUTURE_RENDER_BLOCKLIST,
    contractDependencies: ['student roster minimum-field policy'],
    apiBinding: 'not_connected',
    permissionBinding: 'pending_catalog',
    interactionEnabled: false,
    submitEnabled: false,
    runtimeComponent: false,
    accessibility: {
      ...OPERATIONS_DEFAULT_ACCESSIBILITY,
      ariaLabel: 'No student data available',
      ariaLive: 'polite',
      stateAnnouncements: {
        empty: 'No student data available for this session',
        forbidden: 'Access denied to student roster',
        contract_pending: 'Waiting for student roster contract...',
      },
    },
  },
] as const;
