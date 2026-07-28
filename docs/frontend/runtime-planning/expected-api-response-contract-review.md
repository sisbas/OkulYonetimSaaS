# WP-07F Runtime Frontend Planning: Expected API Response Contract Review

Issue: #145  
Status: planning-only contract preparation  
Runtime implementation: none  
API client code: none

## Purpose

This artefact completes the frontend contract preparation before any runtime implementation starts. It reviews expected server-authored response shapes, reason-code ownership and UI consumption rules for the Faz 1 Leave and Daily Operations runtime slice.

The browser must consume these contracts only after #144 acceptance reconciliation confirms stable endpoint paths, DTO fields, status codes and reason-code envelopes.

## Global response rules

- Every protected response is server-authored.
- Tenant, branch, teacher, course, candidate, assignment and version authority must not come from the browser.
- Runtime UI must not convert missing data, offline state or blocked mutation into local success.
- Runtime UI must not infer cross-tenant or cross-branch record existence.
- Runtime UI must not store authoritative state in localStorage or sessionStorage.
- All mutations must use exact server-returned resource version.
- All denied/not-visible responses must map to non-enumerating UI copy.

## Expected envelope review

If #144 exposes a normalized frontend envelope, it should map to this minimum shape. If the backend keeps endpoint-specific DTOs, the frontend contract adapter must derive equivalent fields without inventing authority.

```ts
type RuntimeApiResult<T> =
  | {
      ok: true;
      data: T;
      etag?: string;
      resourceVersion?: string;
      warnings?: RuntimeWarning[];
    }
  | {
      ok: false;
      reasonCode: RuntimeReasonCode;
      message?: string;
      correlationId?: string;
      fieldErrors?: RuntimeFieldError[];
      sameScope?: boolean;
    };
```

Frontend rule: the UI may render `data`, `reasonCode`, `fieldErrors`, `etag` and `resourceVersion`; it must not parse raw backend errors, stack traces, SQL errors, hidden IDs or permission internals.

## Route response expectations

| Route | API dependency | Expected success data | Required version/header | Required failure handling |
| --- | --- | --- | --- | --- |
| `/app/today` Teacher | `GET /api/v1/daily-operations/today` or reconciled own summary | Own daily items only; no branch queue discovery | none for read | `FORBIDDEN`/`RESOURCE_NOT_VISIBLE` -> `forbidden_non_enumerating` |
| `/app/today` Operations | `GET /api/v1/daily-operations/today` | Branch queue, open/resolved lesson projection | none for read | Empty only when server confirms same-scope empty |
| `/app/leave` Teacher | `POST /api/v1/leaves/me`; reconciled own list/detail | Created own leave or own leave summary | response must include fresh leave version | validation errors keep form state in memory only |
| `/app/leave` Operations | `GET /api/v1/leaves?branchId=<server-context-branchId>` | Same-branch leave queue | none for read | Branch is server context; browser value is not authority |
| `/app/leave/:id` Teacher | `GET /api/v1/leaves/:id` | Own leave detail only | fresh resource version if mutable | cross-scope -> non-enumerating forbidden |
| `/app/leave/:id` Operations | `GET /api/v1/leaves/:id`; impact read | Leave detail + server impact projection | fresh leave version for decisions/mutations | impact not ready blocks downstream actions |
| `/app/leave/:id/candidates` Operations | `GET /api/v1/daily-operations/leaves/:id/events/:scheduleEventId/candidates` | Decision-support candidates only | none for read | eligibility-not-ready is blocking, not empty |
| `/app/leave/:id/assignments` Operations | `POST/DELETE .../substitution` | Server-created or server-cleared assignment | exact `If-Match: "leave:<id>:v<version>"` | no optimistic assignment or local coverage mutation |

## Expected successful DTO projections

### Leave summary/detail projection

Required safe frontend fields:

- `leaveId`
- `status`
- `decisionStatus`
- `coverageStatus`
- `dateRange`
- `timeRange`
- `resourceVersion`
- `actions` or server-authored action affordances

Forbidden frontend dependencies:

- free-text health/reason details unless explicitly approved by #144;
- raw teacher entity;
- raw branch/tenant ownership hints in denied state;
- parent, guardian or student PII.

### Impact projection

Required safe frontend fields:

- `leaveId`
- `coverageStatus`
- `affectedLessons[]`
- `affectedLessons[].scheduleEventId`
- `affectedLessons[].occurrenceDate`
- `affectedLessons[].timeRange`
- `affectedLessons[].courseLabel`
- `affectedLessons[].studentGroupLabel`
- `affectedLessons[].roomLabel`
- `affectedLessons[].assignmentStatus`
- `affectedLessons[].assignmentId?`

Frontend must not compute affected lessons from local Schedule data.

### Candidate projection

Required safe frontend fields:

- `candidateId`
- `teacherId`
- `displayName`
- `courseEligible`
- `availabilityStatus`
- `reasonCode?`
- `finalizedByTeacherCourseAuthority`

Before #166/#176 final runtime gate, missing finalization must map to `eligibility_not_ready`. After #166/#176, candidate success may be trusted only if the backend marks eligibility through `teacher_courses` authority.

### Assignment mutation response

Required safe frontend fields:

- `assignmentId`
- `leaveId`
- `scheduleEventId`
- `coverageStatus`
- `resourceVersion`
- `affectedDailyOperationLessonIds[]` or refetch instruction

Frontend behavior:

- On create success: refetch impact and Daily Operations queue.
- On clear success: refetch impact and queue; affected current lesson must return to server-confirmed `open` if uncovered.
- On stale version: disable mutation until explicit refresh.
- On conflict: keep blocking panel visible.

## Reason-code UI mapping completion

| Backend reason code | UI state | Message stance | Control behavior |
| --- | --- | --- | --- |
| `AUTH_REQUIRED` | `auth_required` | Oturum yenilenmeli. | Disable protected actions. |
| `TENANT_CONTEXT_REQUIRED` | `tenant_context_required` | Kurum bağlamı doğrulanamadı. | Disable route actions. |
| `BRANCH_CONTEXT_REQUIRED` | `branch_context_required` | Şube bağlamı doğrulanamadı. | Disable branch actions. |
| `FORBIDDEN` | `forbidden_non_enumerating` | Bu işlem için yetkiniz yok. | Hide/disable action. |
| `RESOURCE_NOT_VISIBLE` | `forbidden_non_enumerating` | Bu kayıt görüntülenemiyor. | Safe landing route. |
| `RESOURCE_NOT_FOUND_SAME_SCOPE` | `empty_or_not_found_same_scope` | Kayıt bulunamadı veya silinmiş olabilir. | Back/reload action. |
| `VALIDATION_FAILED` | `validation_error` | Alanları kontrol edin. | Keep form data in memory only. |
| `LEAVE_VERSION_REQUIRED` | `version_required` | Kayıt sürümü doğrulanmadan işlem yapılamaz. | Block mutation. |
| `LEAVE_VERSION_MISMATCH` | `stale_version` | Kayıt güncellendi; yenileme gerekir. | No auto retry. |
| `IMPACT_ANALYSIS_NOT_READY` | `impact_analysis_not_ready` | İzin etkisi netleşmeden işlem tamamlanamaz. | Disable decision/assignment. |
| `TEACHER_COURSE_ELIGIBILITY_NOT_READY` | `eligibility_not_ready` | Öğretmen-ders uygunluk kaynağı hazır değil. | Disable assignment create. |
| `TEACHER_COURSE_MISMATCH` | `candidate_unavailable` | Seçilen aday bu ders için uygun değil. | Require server-listed candidate. |
| `SUBSTITUTE_BRANCH_ASSIGNMENT_MISSING` | `candidate_unavailable` | Seçilen aday bu şube kapsamı için uygun değil. | No cross-branch discovery. |
| `SUBSTITUTE_LEAVE_OVERLAP` | `conflict_blocking` | Seçilen öğretmenin aynı zamanda onaylı izni var. | Keep modal open. |
| `SUBSTITUTE_TIME_CONFLICT` | `conflict_blocking` | Görevlendirme mevcut program veya yedek görevle çakışıyor. | Keep modal open. |
| `ASSIGNMENT_ALREADY_EXISTS` | `locked_state` | Bu ders için aktif görevlendirme var. | Disable duplicate create. |
| `ASSIGNMENT_NOT_FOUND` | `empty_or_not_found_same_scope` | Aktif görevlendirme bulunamadı. | Refetch impact. |
| `SERVER_ERROR` | `error_retryable` | İşlem tamamlanamadı. | Retry read only by default. |
| `OFFLINE_OR_UNAVAILABLE` | `offline_or_unavailable` | Bağlantı kurulamadı. | No local authority fallback. |

## Accessibility checklist completion

Runtime implementation must verify:

- each route has one visible `h1` matching current page context;
- skip-to-content works by keyboard;
- leave form labels, descriptions and errors are programmatically associated;
- disabled assignment controls expose reason text;
- modals trap focus and return focus to opener;
- stale-version refresh action is keyboard reachable;
- conflict and eligibility-not-ready states are color-independent;
- toast/alert uses live region without stealing focus;
- forbidden state copy does not reveal hidden record existence;
- responsive smoke covers 360, 430, 768, 820, 1024 and 1440 px.

## Synthetic server-side E2E fixture completion

Fixture source must be backend/database seed only.

Required fixture cases:

1. Teacher own leave create/read.
2. Teacher cross-scope denied detail.
3. Operations same-branch queue with one pending leave.
4. Approved leave with active published schedule impact.
5. Candidate endpoint returning `TEACHER_COURSE_ELIGIBILITY_NOT_READY` where finalization is not ready.
6. Candidate endpoint returning server-finalized eligible substitute after TeacherCourse authority.
7. Assignment create success with fresh `If-Match`.
8. Assignment clear success returning lesson to `open` after refetch.
9. Stale `If-Match` returning `LEAVE_VERSION_MISMATCH`.
10. Substitute time/leave conflict returning blocking state.
11. Same-scope empty queue.
12. Cross-tenant or cross-branch non-enumerating denial.

## Boundary assertions for future runtime PR

The runtime PR must include static or E2E checks proving:

- no import from `demo-frontend`;
- no Builder or Full Vision import;
- no fake API adapter in production source;
- no localStorage/sessionStorage authority for tenant, branch, teacher, course, candidate, assignment, permission or version;
- no browser-generated `If-Match` version not sourced from server response;
- no client-computed impact, candidate eligibility, coverage or Daily Operations queue authority;
- no production-like PII fixture.

## Acceptance coverage

- Route/API/permission response expectations complete: yes.
- Reason-code UI mapping complete: yes.
- Accessibility checklist complete: yes.
- Synthetic server-side E2E fixture plan complete: yes.
- Runtime implementation added: no.
- API client code added: no.
- Fake API added: no.
- localStorage/sessionStorage authority added: no.
