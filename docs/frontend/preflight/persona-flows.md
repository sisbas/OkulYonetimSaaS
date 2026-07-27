# Production Frontend Preflight: Persona Flows

Issue: #145  
Scope: Faz 1 MVP runtime frontend preflight only.  
Implementation status: Not started.

## Shared rules

- All flows require server-authoritative session, tenant and branch context.
- UI must never trust client-controlled tenant, branch, teacher, course, room or student group identifiers as authority.
- Every denied or hidden state must be non-enumerating unless the API explicitly returns a same-scope resource state.
- No flow uses demo fixtures, fake API, localStorage authority or production-like PII fixtures.

## Persona 1: Teacher

### Objective

A teacher can inspect own operational responsibilities, submit leave, see own leave status, understand affected lessons where permitted, and perform permitted attendance actions without seeing other teachers' private scope.

### P0 route journey

1. Login/session bootstrap.
2. Landing route: `/app/today`.
3. Teacher sees only own schedule summary and own actionable attendance/leave items.
4. Teacher opens `/app/leave` and creates a leave request.
5. Teacher opens `/app/leave/:id` for own request status.
6. Teacher opens `/app/attendance/session/:sessionId` only for own assigned session.
7. Teacher receives canonical UI states for stale, forbidden, empty and conflict outcomes.

### Allowed visibility

- Own published schedule events.
- Own leave requests.
- Own assigned attendance sessions.
- Own leave decision status.
- Aggregated, non-sensitive impact summary only when API grants visibility.

### Not allowed visibility

- Other teachers' draft schedule data.
- Other teachers' leave request details.
- Cross-tenant or cross-branch record existence.
- Parent/guardian contact details unless a future approved contract explicitly permits masked notification state.
- Raw permission keys, tokens or audit internals.

### Key states

| Situation | UI state | Message stance |
| --- | --- | --- |
| Own data loading | loading | Neutral progress, no fake success. |
| No own lesson today | empty | Same-scope empty state. |
| Own leave request not found or not visible | forbidden_non_enumerating | Do not reveal existence. |
| Attendance session belongs to another teacher | forbidden_non_enumerating | Same generic denial. |
| Leave update stale | stale_version | Ask user to refresh and retry. |
| API unavailable | offline_or_unavailable | No local authority fallback. |

## Persona 2: Operations Manager

### Objective

An Operations Manager can manage daily leave operations, inspect lesson impacts, decide leave requests, assign coverage, clear assignments and monitor the Daily Operations open lesson queue using real API/RBAC.

### P0 route journey

1. Login/session bootstrap.
2. Landing route: `/app/today`.
3. Operations Manager sees same-tenant, same-branch operational queue.
4. Opens `/app/leave` to inspect pending leave requests.
5. Opens `/app/leave/:id` to view decision, lesson impact, candidate coverage and assignment state.
6. Approves or rejects where API permits.
7. Creates or clears coverage assignments.
8. Verifies Daily Operations queue reflects covered and open lessons.
9. Uses reason-code UI states for conflict, stale, forbidden, empty and offline outcomes.

### Allowed visibility

- Same-scope pending leave queue.
- Same-scope lesson impact summary.
- Coverage candidate list returned by server.
- Assignment create/clear controls where permission exists.
- Daily Operations open lesson queue.

### Not allowed visibility

- Other tenant or unauthorized branch records.
- Client-inferred candidates.
- Raw teacher personal details beyond approved display fields.
- Parent/guardian PII in leave or operations screens.
- Fake success state after local-only mutation.

### Key states

| Situation | UI state | Message stance |
| --- | --- | --- |
| Leave queue empty | empty_same_scope | Operationally clear, not a fetch error. |
| Pending decision exists | actionable | Show approve/reject only if API permits. |
| Impact conflict exists | conflict_blocking | Explain blocking reason using canonical code. |
| Assignment stale | stale_version | Refresh required, no silent overwrite. |
| Candidate list denied | forbidden_non_enumerating | Do not reveal whether candidates exist. |
| API unavailable | offline_or_unavailable | Disable mutation; no fake local authority. |

## Runtime gate notes

- Teacher and Operations Manager flows must be covered by P0 browser E2E after #144.
- Same route may render different controls by API-provided capabilities.
- A hidden button is not security; backend enforcement remains authoritative.
- Browser tests must verify that denied cross-scope navigation is non-enumerating.
