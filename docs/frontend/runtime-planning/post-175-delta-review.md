# WP-07F Runtime Frontend Planning: Post-#175 Delta Review

Issue: #145  
Source artefact: #174 preflight documentation  
Backend delta: #175 Daily Operations core merged  
Runtime decision: HOLD for runtime implementation / PREFLIGHT ONLY

## Status

```text
RUNTIME IMPLEMENTATION: NOT STARTED
API CLIENT CODE: NOT ADDED
FAKE API: FORBIDDEN
LOCAL STORAGE AUTHORITY: FORBIDDEN
RUNTIME GO: BLOCKED UNTIL #166 PASS + #144 ACCEPTANCE RECONCILIATION
```

## Delta summary

#175 changes the frontend planning baseline in three important ways:

1. Daily Operations now has concrete backend-owned impact, candidate, substitution and projection surfaces.
2. Assignment create/clear exists as a backend lifecycle, but course eligibility finalization remains externalized behind #166.
3. Until #166 PASS, assignment create must be treated as fail-closed and must not be converted into local success, optimistic coverage or fake assignment state.

## #174 artefact review result

| #174 artefact | Post-#175 review | Required planning update |
| --- | --- | --- |
| ADR | Still valid. Server authority and demo boundary remain correct. | Add runtime branch HOLD until #166 + #144 reconciliation. |
| Persona flows | Valid but under-specified for assignment fail-closed behavior. | Add Teacher/Operations Manager handling for `TEACHER_COURSE_ELIGIBILITY_NOT_READY`. |
| Route/API/permission matrix | Mostly aligned, but must explicitly split pre-#166 and post-#166 assignment behavior. | Add pre/post table for impact, candidates, substitution create/clear and Daily Operations queue. |
| Reason-code UI matrix | Contains backend codes but needs planning emphasis for fail-closed assignment. | Treat eligibility-not-ready as blocking, not warning or empty state. |
| E2E/a11y/boundary plan | Valid but must define synthetic server-side fixture design for post-#175 paths. | Add pre-#166 fail-closed fixtures and post-#166 assignment success path fixtures. |

## Backend contract facts reflected in planning

- Impact read path is server-owned and based on approved leave plus active published schedule impact.
- Candidate list is decision support only; it creates no assignment side effect.
- Assignment create and clear require `If-Match: "leave:<leaveId>:v<version>"`.
- Coverage is distinct from leave decision; approved leave may remain unresolved.
- Daily Operations projection is idempotent and occurrence-date scoped.
- Assignment clear projects affected current lesson back to `open`.
- Tenant, branch, teacher and course authority are never taken from the browser.
- Until #166 PASS, candidate response may be non-finalized and assignment create fails closed with `TEACHER_COURSE_ELIGIBILITY_NOT_READY`.

## Teacher flow delta

Teacher runtime planning remains restricted to own leave and own attendance surfaces. Teacher must not see assignment controls.

| Flow area | Post-#175 behavior |
| --- | --- |
| `/app/today` | May show own server-authored daily items only. No cross-teacher queue discovery. |
| `/app/leave` | May create own leave only through stable contract after #144 reconciliation. |
| `/app/leave/:id` | Shows own leave status and approved projection if API permits. No Operations assignment controls. |
| Cross-scope leave URL | `forbidden_non_enumerating`; no existence or owner hint. |

## Operations Manager flow delta

Operations Manager may use impact/candidate/assignment planning surfaces only after runtime GO. Before #166 PASS, assignment create is not a success path.

| Flow area | Pre-#166 UI | Post-#166 UI |
| --- | --- | --- |
| Impact read | Allowed if #144 stable contract confirms route/shape. | Same. |
| Candidate list | Display only server-returned non-finalized candidate support state. | Display server-finalized eligible candidates. |
| Assignment create | Fail-closed: block success and show `eligibility_not_ready`. | P0 E2E create path may be tested. |
| Assignment clear | Plan as backend route but do not claim runtime success until #144 reconciliation. | P0 E2E clear path may be tested with refetch. |
| Daily Operations queue | Read/refetch plan only. | Verify open/resolved transitions through browser E2E. |

## Acceptance status

- #174 artefacts reviewed against #175: complete.
- #166 pre-PASS fail-closed UI state: complete.
- #166 post-PASS runtime path: planned, not implemented.
- Runtime implementation: not performed.
- #145 runtime GO: remains open and blocked.
