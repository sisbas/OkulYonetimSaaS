# M3 Frontend Schedule Contract Alignment

Refs #40 and #66.

This document aligns the merged Daily Operation, Schedule and Attendance skeletons with the M3 Schedule contract draft. It does not authorize runtime implementation or API binding.

## Route map

| Route | Tenant Admin | Operations Manager | Teacher | Viewer | M3 contract note |
| --- | --- | --- | --- | --- | --- |
| `/app/today` | Management placeholder | Management placeholder | Own-read placeholder | Read-only placeholder | Published-schedule summary dependency only |
| `/app/schedule` | Management draft and published placeholder | Management draft and published placeholder | Own published events only | Contract-approved published read-only only | Draft and mutation surfaces remain hidden for Teacher and Viewer |
| `/app/attendance` | Management placeholder | Management placeholder | Own-read placeholder | Hidden | Published Schedule to AttendanceSession remains a future dependency |
| `/app/attendance/session/:sessionId` | Management placeholder | Management placeholder | Own-read placeholder | Hidden | Student roster and submit remain blocked |

## Component map

| Component | Surface | Contract dependency | Runtime status |
| --- | --- | --- | --- |
| `ScheduleDraftListSkeleton` | Draft list | Draft lifecycle and management capability mapping | Disabled placeholder |
| `ScheduleWeeklyGridSkeleton` | Management draft grid + separately projected published grid | Draft visibility and published full/own/read-only projections | Disabled placeholder |
| `ScheduleEventEditorModalSkeleton` | Event create/edit modal | Draft-only mutation, reference validation, ETag/If-Match | Disabled placeholder |
| `ScheduleConflictPanelSkeleton` | Hard-conflict panel | Teacher, StudentGroup and Room overlap result schema | Disabled placeholder |
| `ScheduleValidationResultSkeleton` | Validation result | Full versus affected scope and current-version proof | Disabled placeholder |
| `SchedulePublishConfirmationSkeleton` | Publish confirmation | Distinct publish-block reason-code mapping | Disabled placeholder |
| `ScheduleStaleVersionWarningSkeleton` | Stale version warning | `412` mismatch, `422` stale validation and `428` version-required behavior | Disabled placeholder |
| `ScheduleForbiddenStateSkeleton` | 403 state | Permission denied, own-scope and tenant-context mapping | Descriptor only |

Existing Daily Operation and Attendance components remain PII-free and API-disconnected.

## State matrix

| UI state | Schedule status | Validation status | Role boundary | Contract outcome |
| --- | --- | --- | --- | --- |
| `draft_list_ready` | draft | n/a | Tenant Admin / Operations Manager | Draft metadata placeholder |
| `weekly_grid_ready` | draft | n/a | Tenant Admin / Operations Manager only | Management draft grid; Teacher and Viewer hidden |
| `validation_not_validated` | draft | not_validated | Management only | Publish blocked pending full validation |
| `validation_valid` | draft | valid | Management only | Publish conditions may be displayed |
| `validation_invalid` | draft | invalid | Management only | Hard conflicts displayed safely |
| `validation_stale` | draft | stale | Management only | Full revalidation required |
| `version_mismatch` | draft | n/a | Management only | `412 SCHEDULE_VERSION_MISMATCH`; no automatic retry |
| `version_required` | draft | n/a | Management only | `428 SCHEDULE_VERSION_REQUIRED` warning |
| `publish_confirmation` | draft | valid | Management only | Confirmation remains disabled |
| `publish_blocked_empty` | draft | n/a | Management only | `422 SCHEDULE_EMPTY` |
| `publish_blocked_validation_stale` | draft | stale | Management only | `422 SCHEDULE_VALIDATION_STALE` |
| `publish_blocked_hard_conflicts` | draft | invalid | Management only | `422 SCHEDULE_HARD_CONFLICTS_PRESENT` |
| `publish_blocked_period_conflict` | draft | valid | Management only | `409 PUBLISHED_SCHEDULE_PERIOD_CONFLICT` |
| `published_read_only` | published | valid | Management full branch; Teacher own events; Viewer contract read-only | Immutable published grid |

Shared `loading`, `empty`, `error`, `forbidden` and `contract_pending` states remain mandatory for all four routes.

## Role projection matrix

| State | Tenant Admin | Operations Manager | Teacher | Viewer |
| --- | --- | --- | --- | --- |
| `weekly_grid_ready` | `management_draft` | `management_draft` | `hidden` | `hidden` |
| `published_read_only` | `management_published_branch` | `management_published_branch` | `teacher_own_published_events` | `viewer_published_read_only` |

Teacher cannot discover drafts, unpublished schedules, other-teacher events or another branch. Viewer receives only the published read-only projection allowed by the final contract and never receives management surfaces.

## Reason-code to UI-state mapping

| Reason code | UI state | HTTP |
| --- | --- | ---: |
| `SCHEDULE_EMPTY` | `publish_blocked_empty` | 422 |
| `SCHEDULE_VALIDATION_STALE` | `publish_blocked_validation_stale` | 422 |
| `SCHEDULE_HARD_CONFLICTS_PRESENT` | `publish_blocked_hard_conflicts` | 422 |
| `PUBLISHED_SCHEDULE_PERIOD_CONFLICT` | `publish_blocked_period_conflict` | 409 |
| `SCHEDULE_VERSION_MISMATCH` | `version_mismatch` | 412 |

These outcomes are not collapsed into `SCHEDULE_EMPTY`.

## Permission dependency list

Permission keys are not hard-coded. Every dependency uses a human-readable capability and keeps `catalogKey: null` until Permission Catalog binding is approved.

- Read full published branch schedule.
- Read own published schedule.
- Create schedule draft.
- Update draft events.
- Update event assignments.
- Validate schedule hard conflicts.
- Read schedule hard conflicts.
- Publish or unpublish schedule.

Teacher is never given draft, conflict, publish or assignment-management capability by role-name inference. Viewer never discovers draft or unpublished Schedule existence.

## API dependency descriptor

The contract-source endpoint templates are recorded with `bindingStatus: blocked`, `runtimeHandlerRegistered: false` and `runtimeEndpointAssumption: false`:

| Method | Contract path | UI purpose | Version dependency |
| --- | --- | --- | --- |
| POST | `/api/v1/schedules/drafts` | Draft create placeholder | Response ETag |
| POST | `/api/v1/schedules/:scheduleId/events` | Event create placeholder | If-Match + response ETag |
| PATCH | `/api/v1/schedules/:scheduleId/events/:eventId` | Event update placeholder | If-Match + response ETag |
| DELETE | `/api/v1/schedules/:scheduleId/events/:eventId` | Event delete placeholder | If-Match + response ETag |
| POST | `/api/v1/schedules/:scheduleId/conflicts/validate` | Validation placeholder | If-Match + response ETag |
| POST | `/api/v1/schedules/:scheduleId/publish` | Publish placeholder | If-Match + response ETag |
| POST | `/api/v1/schedules/:scheduleId/unpublish` | Unpublish placeholder | If-Match + response ETag |
| GET | `/api/v1/schedules/published` | Published projection placeholder | Response ETag |

Affected validation never enables publish. Publish requires current full validation, `hardConflictCount = 0`, at least one event, draft status and no published period conflict. Published and unpublished event records are immutable.

## Sensitive render blocklist

The frontend skeletons must not render:

- Student name, identity number, roster or notes.
- Parent phone, parent email or guardian contact.
- Notification payload, message body or counseling note.
- Tenant ID or cross-tenant existence signals.
- Raw request/response payloads, SQL or arbitrary exception detail.
- Authorization header, token or credential.

Published teacher view may show only role-safe schedule projection metadata such as Teacher display name, StudentGroup summary, Course, Room and TimeSlot labels. It never shows individual student or parent data.

## Runtime guardrails

- No API binding.
- No permission-key hard-code.
- No runtime route-guard change.
- No mutation, submit, automatic retry or stale-version merge.
- No real student or parent data.
- No Schedule runtime implementation.
- No AttendanceSession generation.

## Karar

M3 contract decisions are represented as frontend descriptors only. The merged M2 route skeletons remain intact and API-disconnected.

## Bağımlılık

Runtime binding requires final Schedule API approval, Permission Catalog mapping, safe 403/own-scope mapping, ETag/If-Match behavior, M2 reference acceptance and successful build/tests.

## UX Riski

The main risks are exposing draft existence to Teacher/Viewer, treating affected validation as publish proof, collapsing distinct publish errors, allowing stale-version retry, implying published events are editable or rendering conflict payloads with cross-tenant/PII details.

## Sonraki Adım

Run TypeScript/build and governance checks. Keep the PR in review/HOLD until all checks, both P2 threads and an independent approval pass. Runtime binding remains a separate future PR after the contract and Permission Catalog are approved.
