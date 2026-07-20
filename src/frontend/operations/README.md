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
