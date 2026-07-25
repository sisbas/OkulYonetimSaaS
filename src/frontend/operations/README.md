# Operations Frontend Skeletons

These descriptors cover Daily Operation, Schedule and Attendance UI planning only.

The M3 Schedule alignment is sourced from the Issue #40 contract draft and records:

- `draft -> published -> unpublished` lifecycle placeholders,
- `not_validated | valid | invalid | stale` validation states,
- draft list, weekly grid, event editor, conflict, validation, publish and stale-version surfaces,
- ETag response and If-Match mutation dependencies,
- full-validation and hard-conflict-zero publish gates,
- immutable published/unpublished event behavior,
- Tenant Admin and Operations Manager management placeholders,
- Teacher own-published-read placeholders,
- Viewer read-only or hidden boundaries.

The descriptors do not register runtime routes, call APIs, enforce permissions, render student or parent data, or enable mutations.

Permission Catalog capability mapping and a separately approved runtime API contract are mandatory before any binding work begins. Exact permission keys remain `null`; runtime route guards remain unchanged.

## Visual Hierarchy & Information Architecture

This module now includes comprehensive visual hierarchy configurations in `operations.visual-hierarchy.ts`:

### 1. State-Specific Visual Language

Each UI state has a distinct visual pattern defined by:
- **Color coding**: Primary and secondary colors for consistent state recognition
- **Icon family**: status, alert, info, success, warning, or error
- **Layout pattern**: centered-banner, inline-notice, overlay-blocker, skeleton-shimmer, or card-header-badge
- **Typography weight**: light, regular, medium, or bold
- **Animation behavior**: none, pulse, shimmer, slide-in, or fade-in

**Example usage:**
```typescript
import { getVisualPatternForState } from './operations.visual-hierarchy';

const loadingPattern = getVisualPatternForState('loading');
// Returns: { primaryColor: 'blue-500', iconFamily: 'info', layoutPattern: 'skeleton-shimmer', ... }

const errorPattern = getVisualPatternForState('error');
// Returns: { primaryColor: 'red-600', iconFamily: 'error', layoutPattern: 'inline-notice', ... }
```

### 2. Progressive Disclosure Tiers

Information is organized into three disclosure tiers per module:
- **Summary**: High-level overview with key metrics and actions
- **Detail**: Expanded view with contextual information
- **Advanced**: Full technical details for power users

**Example usage:**
```typescript
import { getDisclosureConfigForModule } from './operations.visual-hierarchy';

const scheduleSummary = getDisclosureConfigForModule('schedule', 'summary');
// Returns visibleElements, expandableElements, hiddenElements for summary tier
```

### 3. Route-Specific Navigation Patterns

Each route has differentiated navigation through:
- **Contextual breadcrumbs**: Hierarchical path with icons
- **Section headers**: Route-specific content organization
- **Contextual actions**: Available operations per route
- **Sibling routes**: Quick navigation between related pages

**Routes covered:**
- `/app/today` - Daily focus with calendar-today icon
- `/app/schedule` - Planning focus with calendar-grid icon  
- `/app/attendance` - Tracking focus with checklist icon
- `/app/attendance/session/:sessionId` - Session detail with assignment icon

**Example usage:**
```typescript
import { getNavigationPatternForRoute, buildBreadcrumbTrail } from './operations.visual-hierarchy';

const todayNav = getNavigationPatternForRoute('/app/today');
// Returns breadcrumbs, contextualActions, siblingRoutes for daily operations

const breadcrumbs = buildBreadcrumbTrail('/app/attendance');
// Returns: [{ label: 'Ana Sayfa', route: '/app', ... }, { label: 'Yoklama', route: '/app/attendance', ... }]
```

### 4. Icon Mappings

Each state has an associated icon with accessibility labels:

```typescript
import { getIconForState } from './operations.visual-hierarchy';

const loadingIcon = getIconForState('loading');
// Returns: { iconName: 'progress-circular', iconVariant: 'outlined', accessibilityLabel: 'Yükleniyor' }
```

## Integration with Component Skeletons

Component descriptors in `operations.skeleton.ts` now include optional visual hierarchy extensions:
- `visualPattern?: UiStateVisualPattern` - Override default state visual pattern
- `defaultDisclosureTier?: DisclosureTier` - Set initial disclosure level
- `breadcrumbOverride?: readonly BreadcrumbSegment[]` - Custom breadcrumb trail
