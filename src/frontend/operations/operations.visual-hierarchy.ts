import type { OperationsModule } from './operations.routes';
import type { OperationsUiState, ScheduleContractUiState } from './operations.states';

/**
 * Visual Hierarchy & Information Architecture Configuration
 * 
 * This module defines state-specific visual patterns, progressive disclosure tiers,
 * and route-specific navigation patterns for the Operations frontend slice.
 */

// ============================================================================
// STATE-SPECIFIC VISUAL LANGUAGE
// ============================================================================

export type UiStateVisualPattern = {
  state: OperationsUiState | ScheduleContractUiState;
  primaryColor: string;
  secondaryColor: string;
  iconFamily: 'status' | 'alert' | 'info' | 'success' | 'warning' | 'error';
  layoutPattern: 'centered-banner' | 'inline-notice' | 'overlay-blocker' | 'skeleton-shimmer' | 'card-header-badge';
  typographyWeight: 'light' | 'regular' | 'medium' | 'bold';
  animationBehavior: 'none' | 'pulse' | 'shimmer' | 'slide-in' | 'fade-in';
};

export const OPERATIONS_STATE_VISUAL_PATTERNS: readonly UiStateVisualPattern[] = [
  // ========== Generic Operations States ==========
  {
    state: 'loading',
    primaryColor: 'blue-500',
    secondaryColor: 'blue-100',
    iconFamily: 'info',
    layoutPattern: 'skeleton-shimmer',
    typographyWeight: 'light',
    animationBehavior: 'shimmer',
  },
  {
    state: 'empty',
    primaryColor: 'gray-400',
    secondaryColor: 'gray-50',
    iconFamily: 'info',
    layoutPattern: 'centered-banner',
    typographyWeight: 'regular',
    animationBehavior: 'fade-in',
  },
  {
    state: 'error',
    primaryColor: 'red-600',
    secondaryColor: 'red-50',
    iconFamily: 'error',
    layoutPattern: 'inline-notice',
    typographyWeight: 'medium',
    animationBehavior: 'slide-in',
  },
  {
    state: 'forbidden',
    primaryColor: 'orange-600',
    secondaryColor: 'orange-50',
    iconFamily: 'alert',
    layoutPattern: 'overlay-blocker',
    typographyWeight: 'bold',
    animationBehavior: 'fade-in',
  },
  {
    state: 'contract_pending',
    primaryColor: 'purple-500',
    secondaryColor: 'purple-100',
    iconFamily: 'warning',
    layoutPattern: 'inline-notice',
    typographyWeight: 'medium',
    animationBehavior: 'pulse',
  },

  // ========== Schedule Contract States ==========
  {
    state: 'draft_list_ready',
    primaryColor: 'indigo-500',
    secondaryColor: 'indigo-100',
    iconFamily: 'info',
    layoutPattern: 'card-header-badge',
    typographyWeight: 'regular',
    animationBehavior: 'fade-in',
  },
  {
    state: 'weekly_grid_ready',
    primaryColor: 'indigo-600',
    secondaryColor: 'indigo-100',
    iconFamily: 'success',
    layoutPattern: 'card-header-badge',
    typographyWeight: 'medium',
    animationBehavior: 'fade-in',
  },
  {
    state: 'validation_not_validated',
    primaryColor: 'gray-500',
    secondaryColor: 'gray-100',
    iconFamily: 'info',
    layoutPattern: 'inline-notice',
    typographyWeight: 'regular',
    animationBehavior: 'none',
  },
  {
    state: 'validation_valid',
    primaryColor: 'green-600',
    secondaryColor: 'green-100',
    iconFamily: 'success',
    layoutPattern: 'card-header-badge',
    typographyWeight: 'medium',
    animationBehavior: 'fade-in',
  },
  {
    state: 'validation_invalid',
    primaryColor: 'red-600',
    secondaryColor: 'red-100',
    iconFamily: 'error',
    layoutPattern: 'inline-notice',
    typographyWeight: 'bold',
    animationBehavior: 'slide-in',
  },
  {
    state: 'validation_stale',
    primaryColor: 'yellow-600',
    secondaryColor: 'yellow-100',
    iconFamily: 'warning',
    layoutPattern: 'inline-notice',
    typographyWeight: 'medium',
    animationBehavior: 'pulse',
  },
  {
    state: 'version_mismatch',
    primaryColor: 'orange-600',
    secondaryColor: 'orange-100',
    iconFamily: 'alert',
    layoutPattern: 'overlay-blocker',
    typographyWeight: 'bold',
    animationBehavior: 'slide-in',
  },
  {
    state: 'version_required',
    primaryColor: 'orange-500',
    secondaryColor: 'orange-100',
    iconFamily: 'alert',
    layoutPattern: 'inline-notice',
    typographyWeight: 'medium',
    animationBehavior: 'fade-in',
  },
  {
    state: 'publish_confirmation',
    primaryColor: 'green-600',
    secondaryColor: 'green-100',
    iconFamily: 'success',
    layoutPattern: 'centered-banner',
    typographyWeight: 'medium',
    animationBehavior: 'fade-in',
  },
  {
    state: 'publish_blocked_empty',
    primaryColor: 'gray-500',
    secondaryColor: 'gray-100',
    iconFamily: 'info',
    layoutPattern: 'inline-notice',
    typographyWeight: 'regular',
    animationBehavior: 'none',
  },
  {
    state: 'publish_blocked_validation_stale',
    primaryColor: 'yellow-600',
    secondaryColor: 'yellow-100',
    iconFamily: 'warning',
    layoutPattern: 'inline-notice',
    typographyWeight: 'medium',
    animationBehavior: 'pulse',
  },
  {
    state: 'publish_blocked_hard_conflicts',
    primaryColor: 'red-600',
    secondaryColor: 'red-100',
    iconFamily: 'error',
    layoutPattern: 'inline-notice',
    typographyWeight: 'bold',
    animationBehavior: 'slide-in',
  },
  {
    state: 'publish_blocked_period_conflict',
    primaryColor: 'orange-600',
    secondaryColor: 'orange-100',
    iconFamily: 'alert',
    layoutPattern: 'inline-notice',
    typographyWeight: 'medium',
    animationBehavior: 'fade-in',
  },
  {
    state: 'published_read_only',
    primaryColor: 'teal-600',
    secondaryColor: 'teal-100',
    iconFamily: 'success',
    layoutPattern: 'card-header-badge',
    typographyWeight: 'medium',
    animationBehavior: 'fade-in',
  },
] as const;

// ============================================================================
// PROGRESSIVE DISCLOSURE TIERS
// ============================================================================

export type DisclosureTier = 'summary' | 'detail' | 'advanced';

export type ProgressiveDisclosureConfig = {
  tier: DisclosureTier;
  visibleElements: readonly string[];
  expandableElements: readonly string[];
  hiddenElements: readonly string[];
  requiresUserAction: boolean;
  actionLabel?: string;
};

export const PROGRESSIVE_DISCLOSURE_CONFIGS: Readonly<Record<OperationsModule, ProgressiveDisclosureConfig[]>> = {
  daily_operation: [
    {
      tier: 'summary',
      visibleElements: [
        'page title',
        'daily summary count',
        'schedule status badge',
        'quick action buttons',
      ],
      expandableElements: [
        'time block details',
        'leave impact summary',
        'closure checklist preview',
      ],
      hiddenElements: [
        'full event list',
        'detailed conflict report',
        'replacement teacher assignments',
      ],
      requiresUserAction: true,
      actionLabel: 'View full details',
    },
    {
      tier: 'detail',
      visibleElements: [
        'page title',
        'daily summary count',
        'schedule status badge',
        'quick action buttons',
        'time block details',
        'leave impact summary',
        'closure checklist preview',
      ],
      expandableElements: [
        'individual event metadata',
        'leave request timeline',
        'closure task dependencies',
      ],
      hiddenElements: [
        'raw API response data',
        'internal validation logs',
        'cross-reference IDs',
      ],
      requiresUserAction: true,
      actionLabel: 'Show advanced options',
    },
    {
      tier: 'advanced',
      visibleElements: [
        'page title',
        'daily summary count',
        'schedule status badge',
        'quick action buttons',
        'time block details',
        'leave impact summary',
        'closure checklist preview',
        'individual event metadata',
        'leave request timeline',
        'closure task dependencies',
      ],
      expandableElements: [],
      hiddenElements: [
        'raw API response data',
        'internal validation logs',
      ],
      requiresUserAction: false,
    },
  ],
  schedule: [
    {
      tier: 'summary',
      visibleElements: [
        'page title',
        'draft/published status',
        'event count summary',
        'validation status badge',
        'publish action button',
      ],
      expandableElements: [
        'weekly grid overview',
        'conflict count summary',
        'version info',
      ],
      hiddenElements: [
        'individual event details',
        'conflict breakdown by type',
        'validation error messages',
        'ETag/version metadata',
      ],
      requiresUserAction: true,
      actionLabel: 'Expand schedule view',
    },
    {
      tier: 'detail',
      visibleElements: [
        'page title',
        'draft/published status',
        'event count summary',
        'validation status badge',
        'publish action button',
        'weekly grid overview',
        'conflict count summary',
        'version info',
      ],
      expandableElements: [
        'event editor modal',
        'conflict panel details',
        'validation result breakdown',
      ],
      hiddenElements: [
        'raw conflict validation payload',
        'internal schedule version hash',
        'permission capability checks',
      ],
      requiresUserAction: true,
      actionLabel: 'Show technical details',
    },
    {
      tier: 'advanced',
      visibleElements: [
        'page title',
        'draft/published status',
        'event count summary',
        'validation status badge',
        'publish action button',
        'weekly grid overview',
        'conflict count summary',
        'version info',
        'event editor modal',
        'conflict panel details',
        'validation result breakdown',
      ],
      expandableElements: [
        'ETag header display',
        'If-Match requirement notice',
      ],
      hiddenElements: [
        'raw API payloads',
        'internal state machine transitions',
      ],
      requiresUserAction: false,
    },
  ],
  attendance: [
    {
      tier: 'summary',
      visibleElements: [
        'page title',
        'session count',
        'missing attendance alert',
        'session list preview',
      ],
      expandableElements: [
        'session date range',
        'class/group summary',
      ],
      hiddenElements: [
        'student roster details',
        'individual attendance records',
        'absence reason codes',
      ],
      requiresUserAction: true,
      actionLabel: 'View session details',
    },
    {
      tier: 'detail',
      visibleElements: [
        'page title',
        'session count',
        'missing attendance alert',
        'session list preview',
        'session date range',
        'class/group summary',
      ],
      expandableElements: [
        'PII-safe student list',
        'attendance submission status',
        'absence markers',
      ],
      hiddenElements: [
        'student contact information',
        'parent/guardian details',
        'internal session IDs',
      ],
      requiresUserAction: true,
      actionLabel: 'Show session roster',
    },
    {
      tier: 'advanced',
      visibleElements: [
        'page title',
        'session count',
        'missing attendance alert',
        'session list preview',
        'session date range',
        'class/group summary',
        'PII-safe student list',
        'attendance submission status',
        'absence markers',
      ],
      expandableElements: [],
      hiddenElements: [
        'student PII data',
        'parent contact information',
        'raw attendance API responses',
      ],
      requiresUserAction: false,
    },
  ],
} as const;

// ============================================================================
// ROUTE-SPECIFIC NAVIGATION PATTERNS
// ============================================================================

export type BreadcrumbSegment = {
  label: string;
  route?: string;
  icon?: string;
  isActive: boolean;
};

export type NavigationPatternConfig = {
  route: string;
  module: OperationsModule;
  pageTitle: string;
  sectionHeader: string;
  breadcrumbs: readonly BreadcrumbSegment[];
  contextualActions: readonly string[];
  backNavigationTarget?: string;
  siblingRoutes: readonly string[];
};

export const ROUTE_NAVIGATION_PATTERNS: readonly NavigationPatternConfig[] = [
  // ========== /app/today - Daily Focus ==========
  {
    route: '/app/today',
    module: 'daily_operation',
    pageTitle: 'Bugünlük İşlemler',
    sectionHeader: 'Günlük Özet',
    breadcrumbs: [
      { label: 'Ana Sayfa', route: '/app', icon: 'home', isActive: false },
      { label: 'Bugün', route: '/app/today', icon: 'calendar-today', isActive: true },
    ],
    contextualActions: ['refresh summary', 'close day', 'view schedule'],
    siblingRoutes: ['/app/schedule', '/app/attendance'],
  },

  // ========== /app/schedule - Planning Focus ==========
  {
    route: '/app/schedule',
    module: 'schedule',
    pageTitle: 'Ders Programı',
    sectionHeader: 'Haftalık Görünüm',
    breadcrumbs: [
      { label: 'Ana Sayfa', route: '/app', icon: 'home', isActive: false },
      { label: 'Program Yönetimi', route: '/app/schedule', icon: 'calendar-grid', isActive: true },
    ],
    contextualActions: ['create draft', 'validate', 'publish', 'view conflicts'],
    siblingRoutes: ['/app/today', '/app/attendance'],
  },

  // ========== /app/attendance - Tracking Focus ==========
  {
    route: '/app/attendance',
    module: 'attendance',
    pageTitle: 'Yoklama Takip',
    sectionHeader: 'Oturum Listesi',
    breadcrumbs: [
      { label: 'Ana Sayfa', route: '/app', icon: 'home', isActive: false },
      { label: 'Yoklama', route: '/app/attendance', icon: 'checklist', isActive: true },
    ],
    contextualActions: ['filter by date', 'show missing', 'export summary'],
    siblingRoutes: ['/app/today', '/app/schedule'],
  },

  // ========== /app/attendance/session/:sessionId - Session Detail ==========
  {
    route: '/app/attendance/session/:sessionId',
    module: 'attendance',
    pageTitle: 'Yoklama Oturumu',
    sectionHeader: 'Oturum Detayları',
    breadcrumbs: [
      { label: 'Ana Sayfa', route: '/app', icon: 'home', isActive: false },
      { label: 'Yoklama', route: '/app/attendance', icon: 'checklist', isActive: false },
      { label: 'Oturum', route: '/app/attendance/session/:sessionId', icon: 'assignment', isActive: true },
    ],
    contextualActions: ['submit attendance', 'mark absent', 'view history'],
    backNavigationTarget: '/app/attendance',
    siblingRoutes: ['/app/today', '/app/schedule'],
  },
] as const;

// ============================================================================
// ICON MAPPING FOR STATES
// ============================================================================

export type StateIconMapping = {
  state: OperationsUiState | ScheduleContractUiState;
  iconName: string;
  iconVariant: 'outlined' | 'filled' | 'rounded' | 'sharp';
  accessibilityLabel: string;
};

export const STATE_ICON_MAPPINGS: readonly StateIconMapping[] = [
  // Generic Operations States
  { state: 'loading', iconName: 'progress-circular', iconVariant: 'outlined', accessibilityLabel: 'Yükleniyor' },
  { state: 'empty', iconName: 'inbox', iconVariant: 'outlined', accessibilityLabel: 'Kayıt yok' },
  { state: 'error', iconName: 'error', iconVariant: 'filled', accessibilityLabel: 'Hata oluştu' },
  { state: 'forbidden', iconName: 'lock', iconVariant: 'filled', accessibilityLabel: 'Erişim engellendi' },
  { state: 'contract_pending', iconName: 'pending-actions', iconVariant: 'outlined', accessibilityLabel: 'Sözleşme bekleniyor' },

  // Schedule Contract States
  { state: 'draft_list_ready', iconName: 'drafts', iconVariant: 'outlined', accessibilityLabel: 'Taslak listesi hazır' },
  { state: 'weekly_grid_ready', iconName: 'calendar-view-month', iconVariant: 'outlined', accessibilityLabel: 'Haftalık görünüm hazır' },
  { state: 'validation_not_validated', iconName: 'help-outline', iconVariant: 'outlined', accessibilityLabel: 'Doğrulanmadı' },
  { state: 'validation_valid', iconName: 'check-circle', iconVariant: 'filled', accessibilityLabel: 'Geçerli' },
  { state: 'validation_invalid', iconName: 'error-outline', iconVariant: 'outlined', accessibilityLabel: 'Geçersiz' },
  { state: 'validation_stale', iconName: 'update', iconVariant: 'outlined', accessibilityLabel: 'Güncel değil' },
  { state: 'version_mismatch', iconName: 'sync-problem', iconVariant: 'filled', accessibilityLabel: 'Sürüm uyuşmazlığı' },
  { state: 'version_required', iconName: 'tag', iconVariant: 'outlined', accessibilityLabel: 'Sürüm gerekli' },
  { state: 'publish_confirmation', iconName: 'publish', iconVariant: 'outlined', accessibilityLabel: 'Yayınlama onayı' },
  { state: 'publish_blocked_empty', iconName: 'block', iconVariant: 'outlined', accessibilityLabel: 'Boş program' },
  { state: 'publish_blocked_validation_stale', iconName: 'warning', iconVariant: 'outlined', accessibilityLabel: 'Doğrulama güncel değil' },
  { state: 'publish_blocked_hard_conflicts', iconName: 'warning-amazon', iconVariant: 'filled', accessibilityLabel: 'Çakışma bulundu' },
  { state: 'publish_blocked_period_conflict', iconName: 'compare-arrows', iconVariant: 'outlined', accessibilityLabel: 'Dönem çakışması' },
  { state: 'published_read_only', iconName: 'verified', iconVariant: 'filled', accessibilityLabel: 'Yayınlandı' },
] as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function getVisualPatternForState(
  state: OperationsUiState | ScheduleContractUiState,
): UiStateVisualPattern | undefined {
  return OPERATIONS_STATE_VISUAL_PATTERNS.find((pattern) => pattern.state === state);
}

export function getDisclosureConfigForModule(
  module: OperationsModule,
  tier: DisclosureTier,
): ProgressiveDisclosureConfig | undefined {
  const configs = PROGRESSIVE_DISCLOSURE_CONFIGS[module];
  return configs?.find((config) => config.tier === tier);
}

export function getNavigationPatternForRoute(route: string): NavigationPatternConfig | undefined {
  return ROUTE_NAVIGATION_PATTERNS.find((pattern) => {
    // Handle dynamic routes like /app/attendance/session/:sessionId
    if (route.includes(':')) {
      const patternSegments = pattern.route.split('/');
      const routeSegments = route.split('/');
      if (patternSegments.length !== routeSegments.length) {
        return false;
      }
      return patternSegments.every((segment, index) => {
        return segment.startsWith(':') || segment === routeSegments[index];
      });
    }
    return pattern.route === route;
  });
}

export function getIconForState(state: OperationsUiState | ScheduleContractUiState): StateIconMapping | undefined {
  return STATE_ICON_MAPPINGS.find((mapping) => mapping.state === state);
}

export function buildBreadcrumbTrail(
  route: string,
  customSegments?: Partial<BreadcrumbSegment>[],
): readonly BreadcrumbSegment[] {
  const pattern = getNavigationPatternForRoute(route);
  if (!pattern) {
    return [];
  }

  if (!customSegments || customSegments.length === 0) {
    return pattern.breadcrumbs;
  }

  // Merge custom segments with the base pattern
  return pattern.breadcrumbs.map((segment, index) => {
    const custom = customSegments[index];
    return custom ? { ...segment, ...custom } : segment;
  });
}
