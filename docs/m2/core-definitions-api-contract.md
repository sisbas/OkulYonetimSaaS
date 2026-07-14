# M2 Core Definitions API Contract

> Scope: contract-only. This document does not introduce runtime behavior, entity implementation, controller implementation, service implementation, repository implementation, migration, seed data, or tests.

## Context

This document is the first M2 contract-only artifact under issue #51 after Permission Catalog v1 final coverage matrix issue #50 was completed.

M2 implementation remains blocked unless a later PR explicitly carries runtime implementation scope, CI evidence, RBAC/KVKK/audit impact, rollback plan, and secret-scanner clearance.

## Common API Standard

All future M2 Core Definitions endpoints must be:

- tenant scoped
- RBAC protected
- audit aware
- soft-delete aware
- paginated for list endpoints
- protected by validation error standards
- explicit about `403 PERMISSION_DENIED` and `403 TENANT_ACCESS_DENIED`
- explicit about parent/guardian contact visibility

## Common Response Standards

### Paginated list response

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 0,
    "totalPages": 0
  }
}
```

### Error response

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed.",
    "details": [
      {
        "field": "name",
        "rule": "required",
        "message": "name is required"
      }
    ],
    "requestId": "request-id"
  }
}
```

### Standard error codes

| HTTP | Code | Meaning |
|---:|---|---|
| 400 | `VALIDATION_ERROR` | DTO validation failed |
| 401 | `UNAUTHENTICATED` | Missing or invalid authentication |
| 403 | `PERMISSION_DENIED` | Role lacks required permission |
| 403 | `TENANT_ACCESS_DENIED` | Cross-tenant or tenant-scope violation |
| 404 | `RESOURCE_NOT_FOUND` | Missing or soft-deleted resource |
| 409 | `RESOURCE_CONFLICT` | Tenant-scoped uniqueness or domain conflict |
| 422 | `DOMAIN_RULE_VIOLATION` | Valid input violates domain rule |

## Contract Resources

## 1. Teacher

### Endpoints

| Method | Path | Permission | Audit | KVKK |
|---|---|---|---|---|
| GET | `/api/v1/teachers` | `teacher:read` | no | phone/email masked if not needed |
| GET | `/api/v1/teachers/:id` | `teacher:read` or `teacher:own:read` | no | phone/email masked if not needed |
| POST | `/api/v1/teachers` | `teacher:create` | yes | phone/email sensitive |
| PATCH | `/api/v1/teachers/:id` | `teacher:update` | yes | phone/email sensitive |
| DELETE | `/api/v1/teachers/:id` | `teacher:deactivate` | yes | soft delete only |

### DTO sketch

```ts
CreateTeacherDto {
  firstName: string;
  lastName: string;
  branchId?: string;
  email?: string;
  phone?: string;
  isActive?: boolean;
}
```

### Validation sketch

- `firstName`, `lastName`: required, string, min 2, max 80
- `branchId`: UUID, same tenant
- `email`: valid email, optional
- `phone`: optional, normalized phone format
- `isActive`: boolean

## 2. StudentGroup / Class

### Endpoints

| Method | Path | Permission | Audit | KVKK |
|---|---|---|---|---|
| GET | `/api/v1/student-groups` | future `student_group:read` or contract alias | no | none |
| GET | `/api/v1/student-groups/:id` | future `student_group:read` or contract alias | no | none |
| POST | `/api/v1/student-groups` | future `student_group:create` | yes | none |
| PATCH | `/api/v1/student-groups/:id` | future `student_group:update` | yes | none |
| DELETE | `/api/v1/student-groups/:id` | future `student_group:delete` | yes | soft delete only |

### DTO sketch

```ts
CreateStudentGroupDto {
  name: string;
  code?: string;
  academicTermId: string;
  branchId?: string;
  level?: string;
  track?: "SAYISAL" | "ESIT_AGIRLIK" | "SOZEL" | "DIL" | "LGS" | "GENEL";
  isActive?: boolean;
}
```

### Gap decision

Dedicated `student_group:*` permission seed is not yet implemented. Runtime implementation is blocked until a separate seed/catalog PR defines the final permission keys.

## 3. Course

### Endpoints

| Method | Path | Permission | Audit | KVKK |
|---|---|---|---|---|
| GET | `/api/v1/courses` | `course:read` | no | none |
| GET | `/api/v1/courses/:id` | `course:read` | no | none |
| POST | `/api/v1/courses` | `course:create` | yes | none |
| PATCH | `/api/v1/courses/:id` | `course:update` | yes | none |
| DELETE | `/api/v1/courses/:id` | `course:delete` | yes | soft delete only |

### DTO sketch

```ts
CreateCourseDto {
  name: string;
  code?: string;
  category?: "TYT" | "AYT" | "LGS" | "GENEL";
  isActive?: boolean;
}
```

## 4. Room

### Endpoints

| Method | Path | Permission | Audit | KVKK |
|---|---|---|---|---|
| GET | `/api/v1/rooms` | `room:read` | no | none |
| GET | `/api/v1/rooms/:id` | `room:read` | no | none |
| POST | `/api/v1/rooms` | `room:create` | yes | none |
| PATCH | `/api/v1/rooms/:id` | `room:update` | yes | none |
| DELETE | `/api/v1/rooms/:id` | `room:delete` | yes | soft delete only |

### DTO sketch

```ts
CreateRoomDto {
  name: string;
  code?: string;
  branchId?: string;
  capacity?: number;
  isActive?: boolean;
}
```

## 5. TimeSlot

### Endpoints

| Method | Path | Permission | Audit | KVKK |
|---|---|---|---|---|
| GET | `/api/v1/time-slots` | `time_slot:read` | no | none |
| GET | `/api/v1/time-slots/:id` | `time_slot:read` | no | none |
| POST | `/api/v1/time-slots` | `time_slot:create` | yes | none |
| PATCH | `/api/v1/time-slots/:id` | `time_slot:update` | yes | none |
| DELETE | `/api/v1/time-slots/:id` | `time_slot:delete` | yes | soft delete only |

### DTO sketch

```ts
CreateTimeSlotDto {
  name: string;
  dayOfWeek?: number;
  startTime: string;
  endTime: string;
  orderIndex?: number;
  isActive?: boolean;
}
```

### Validation sketch

- `dayOfWeek`: optional integer, 1-7
- `startTime`, `endTime`: `HH:mm`
- `endTime` must be greater than `startTime`

## 6. Student Basic

### Endpoints

| Method | Path | Permission | Audit | KVKK |
|---|---|---|---|---|
| GET | `/api/v1/students` | `student:read` | no | parent contact hidden |
| GET | `/api/v1/students/:id` | `student:read` | no | parent contact hidden |
| POST | `/api/v1/students` | `student:create` | yes | student PII sensitive |
| PATCH | `/api/v1/students/:id` | `student:update` | yes | student PII sensitive |
| DELETE | `/api/v1/students/:id` | `student:deactivate` | yes | soft delete only |

### DTO sketch

```ts
CreateStudentBasicDto {
  firstName: string;
  lastName: string;
  studentNumber?: string;
  studentGroupId?: string;
  branchId?: string;
  isActive?: boolean;
}
```

### Default response rule

Student basic responses must not include parent/guardian contact or KVKK consent details by default.

## 7. Parent Contact Visibility

### Endpoint

| Method | Path | Permission | Audit | KVKK |
|---|---|---|---|---|
| GET | `/api/v1/students/:id/parent-contact` | `student:parent_contact:read` | yes | forbidden for teacher, consent aware |

### Role visibility

| Role | Access |
|---|---|
| `tenant_admin` | allow within tenant |
| `operations_manager` | allow if operationally required |
| `teacher` | deny with `403 PERMISSION_DENIED` |
| cross-tenant | deny with `403 TENANT_ACCESS_DENIED` |

### Audit event sketch

- `student.parent_contact.read`
- `student.parent_contact.denied`
- `student.parent_contact.consent_denied`

Audit metadata must not log raw phone, email, message body, notification payload, guidance note, credential, or token values.

## 8. Academic Term

### Endpoints

| Method | Path | Permission | Audit | KVKK |
|---|---|---|---|---|
| GET | `/api/v1/academic-terms` | future `academic_term:read` | no | none |
| GET | `/api/v1/academic-terms/:id` | future `academic_term:read` | no | none |
| POST | `/api/v1/academic-terms` | future `academic_term:create` | yes | none |
| PATCH | `/api/v1/academic-terms/:id` | future `academic_term:update` | yes | none |
| DELETE | `/api/v1/academic-terms/:id` | future `academic_term:delete` | yes | soft delete only |

### DTO sketch

```ts
CreateAcademicTermDto {
  name: string;
  startsAt: string;
  endsAt: string;
  isActive?: boolean;
}
```

### Gap decision

Dedicated `academic_term:*` permission seed is not yet implemented. Runtime implementation is blocked until a separate seed/catalog PR defines the final permission keys.

## Permission Dependencies

### Existing seeded keys used by this contract

- `teacher:read`, `teacher:own:read`, `teacher:create`, `teacher:update`, `teacher:deactivate`
- `student:read`, `student:create`, `student:update`, `student:deactivate`, `student:parent_contact:read`, `student:group_students:read`
- `course:read`, `course:create`, `course:update`, `course:delete`
- `room:read`, `room:create`, `room:update`, `room:delete`
- `time_slot:read`, `time_slot:create`, `time_slot:update`, `time_slot:delete`
- `tenant:branch:read`, `tenant:branch:create`, `tenant:branch:update`, `tenant:branch:deactivate`

### Contract-only pending keys

- `student_group:read`, `student_group:create`, `student_group:update`, `student_group:delete`
- `academic_term:read`, `academic_term:create`, `academic_term:update`, `academic_term:delete`

Pending keys must not be used in runtime guards until they are seeded and tested in a separate non-contract PR.

## Test Plan Sketch

| Test ID | Scope | Expected |
|---|---|---|
| `M2-CONTRACT-001` | tenant admin list endpoint | 200 + paginated response |
| `M2-CONTRACT-002` | missing permission | 403 `PERMISSION_DENIED` |
| `M2-CONTRACT-003` | cross-tenant resource access | 403 `TENANT_ACCESS_DENIED` |
| `M2-CONTRACT-004` | invalid DTO | 400 `VALIDATION_ERROR` |
| `M2-CONTRACT-005` | soft-deleted resource read | 404 unless explicit includeDeleted/admin contract exists |
| `M2-CONTRACT-006` | teacher parent contact access | 403 |
| `M2-CONTRACT-007` | student basic response | parent/guardian contact fields absent |
| `M2-CONTRACT-008` | operations manager security boundary | tenant settings / role assignment denied |
| `M2-CONTRACT-009` | audit create/update/delete | audit event emitted in future implementation |
| `M2-CONTRACT-010` | audit redaction | raw phone/email/token/message/guidance absent |

## Implementation-blocked Note

The following changes are explicitly blocked in this PR and in any M2 PR that claims #51-only scope:

- entity implementation
- controller implementation
- service implementation
- repository implementation
- migration implementation
- seed implementation
- runtime authorization behavior changes
- KVKK/audit behavior changes

## Merge Policy

A future implementation PR must not be recommended for merge unless:

- Sprint 1 Quality Gate is PASS
- Gate 1 CI is PASS
- DB Smoke Tests is PASS
- Backend CI is PASS
- GitGuardian / secret scanner is clear or documented as remediated / false-positive
- KVKK/audit impact is explicit
- rollback plan is explicit
- Codex review threads are resolved or outdated

## Audit Event Registry v1

> Scope: contract-only. This registry defines required event names, audit flags, redaction profiles, and merge-hold decisions for later M2 implementation. It does not add runtime audit persistence, outbox processing, controllers, services, entities, migrations, seeds, or tests while issue #51 remains open.

### Registry decision

M2 contract-level audit mapping is **PASS** for inclusion in this contract. Runtime implementation remains **HOLD** while the non-contract M2 guardrail is open and until permission seed/test gaps, transactional audit persistence, bulk import, and sensitive-read contracts are implemented in separately scoped PRs.

### Architecture decision for future implementation

The future implementation target is a hybrid audit architecture:

1. **Permission Policy Registry**: route, action, resource, permission, `audit_required`, deny state, and redaction profile are read from a single policy source.
2. **Guard/interceptor layer**: centralizes `authorization.denied`, `tenant.access.denied`, request context, and correlation metadata.
3. **Domain Audit Service**: emits domain-specific create, update, deactivate, reactivate, sensitive-read, and bulk-import events with reason codes.
4. **Transactional Outbox**: writes data changes and audit events in the same database transaction so audit sink outages cannot silently drop sensitive read/write evidence.

Transactional outbox implementation is a runtime change and must not be merged under #51-only contract scope.

### AuditEventV1 envelope

```ts
interface AuditEventV1 {
  eventId: string;
  eventVersion: "1.0";
  occurredAt: string;

  tenantId: string;
  actorId: string;
  actorRole: string;

  requestId: string;
  traceId?: string;

  eventName: string;
  action: string;
  resourceType: string;
  resourceId?: string;

  result: "success" | "denied" | "failed" | "partial";
  permission?: string;
  reasonCode?: string;
  purposeCode?: string;

  changedFields?: string[];
  source?: "api" | "bulk_import" | "system";
  batchId?: string;

  clientIpFingerprint?: string;
  userAgentFamily?: string;

  metadata?: Record<string, boolean | number | string | string[]>;
}
```

Audit events must never include request bodies, response bodies, authorization headers, cookies, access or refresh tokens, raw IP addresses, full user-agent strings, raw email or phone values, parent/guardian contact values, student notes, notification message bodies, rejected import row contents, complete DTO JSON, or complete entity JSON.

### Resource coverage

The same audit event standard applies to these M2 resource types:

- `teacher`
- `student_group`
- `course`
- `room`
- `time_slot`
- `student`
- `academic_term`

### CRUD and lifecycle event mapping

| Operation | Event | `audit_required` | Allowed metadata | Forbidden metadata |
|---|---|---:|---|---|
| Create | `<resource>.created` | true | resource ID, actor, tenant, changed field names, source | field values |
| Update | `<resource>.updated` | true | `changedFields`, entity version, result | before/after PII |
| Active to passive | `<resource>.deactivated` | true | previous state, reason code, `changedFields` | free-text reason |
| Passive to active | `<resource>.reactivated` | true | previous state, reason code | PII |
| Hard-delete attempt | `<resource>.hard_delete.denied` | true | permission, reason code | entity snapshot |
| Security-relevant failed domain update | `<resource>.update.failed` | conditional | error code, action, resource ID | validation input values |

Deactivation must not be represented only as generic `<resource>.updated`; it requires a lifecycle-specific event. Routine expected validation errors do not all require audit events, but authorization, tenant-scope, manipulation, and sensitive-field failures must be auditable.

### Sensitive read event mapping

| Sensitive data | Allow event | Deny event | Permission | `audit_required` |
|---|---|---|---|---:|
| Teacher full email/phone | `teacher.contact.read` | `teacher.contact.read_denied` | `teacher:contact:read` | true |
| Parent contact | `student.parent_contact.read` | `student.parent_contact.denied` | `student:parent_contact:read` | true |
| Guardian contact | `student.guardian_contact.read` | `student.guardian_contact.denied` | `student:guardian_contact:read` | true |
| KVKK consent status | `student.consent.read` | `student.consent.read_denied` | `student:consent:read` | true |
| Notification eligibility | `student.notification_eligibility.read` | `student.notification_eligibility.denied` | `student:notification_eligibility:read` | true |
| Student note | `student.note.read` | `student.note.read_denied` | `student:note:read` | true |

Teacher list/detail endpoints may remain `audit_required=false` only when full email/phone values are absent or masked. A full-contact teacher response requires a separate sensitive-read contract with `audit_required=true`.

### Sensitive-read purpose limitation

Each sensitive-read request must carry one controlled `purposeCode` from this allowlist:

- `PARENT_CONTACT_OPERATION`
- `ATTENDANCE_FOLLOWUP`
- `CONSENT_VERIFICATION`
- `DATA_CORRECTION`
- `SECURITY_INVESTIGATION`

Free-text purpose values are not allowed. Entity visibility does not imply sensitive-field visibility; read permission does not imply notification-use permission; contact access does not imply consent approval.

### Sensitive-read role policy

| Data | Tenant Admin | Operations Manager | Teacher |
|---|---|---|---|
| Teacher email/phone | explicit permission | only with operational need | own profile only |
| Parent/guardian contact | explicit permission | explicit permission plus purpose | deny with `403 PERMISSION_DENIED` |
| KVKK consent status | explicit compliance permission | eligibility result instead of raw status | deny |
| Notification eligibility | minimum response | boolean plus reason code | deny |
| Student note | separate permission | default deny | default deny |
| Audit log | security-specific permission | deny | deny |

### Student note contract decision

Student notes must not be added to the M2 Student Basic DTO and must not appear as list/detail preview fields. A future route may be contracted separately as:

```http
GET /api/v1/students/:id/notes/:noteId
```

That route remains implementation-blocked until a counselor/guidance role and separate permission model are defined. Teacher and operations manager access is default-deny. Audit records must never contain note body values.

### Bulk import contract

Bulk import is contract-required for any M2 resource that later supports CSV or file-based import, and every bulk-import endpoint is `audit_required=true`.

| Stage | Event | Allowed metadata |
|---|---|---|
| Start | `<resource>.bulk_import.started` | batchId, file SHA-256, schema version, declared row count |
| Completed | `<resource>.bulk_import.completed` | created, updated, skipped, rejected counts |
| Partial success | `<resource>.bulk_import.partial` | success/rejection counts, error-code distribution |
| Failed | `<resource>.bulk_import.failed` | batchId, failure stage, reason code |
| Row-level write | `<resource>.created` or `<resource>.updated` | source=`bulk_import`, batchId, resourceId |

Bulk import audit and error records must not include file contents, raw CSV rows, DTO dumps, rejected values, student names, email values, or phone values. Import errors may include only row number, field name, and error code. Storage references must use system-generated object keys rather than original file names.

### Failed authorization event

`authorization.denied` is always `audit_required=true` and must include actor ID, tenant ID, route template, action, resource type, required permission, actor role, `result="denied"`, and one reason code from `PERMISSION_MISSING`, `ROLE_DENIED`, or `SCOPE_DENIED`.

It must not include raw tokens, headers, request body, or sensitive target-record information.

### Tenant denied event

`tenant.access.denied` is always `audit_required=true` and must include actor tenant ID, route template, action, resource type, requested resource fingerprint, `reasonCode="TENANT_MISMATCH"`, and `severity="high"`.

HTTP responses must use `403 TENANT_ACCESS_DENIED`, must not reveal whether the target record exists, and must not return another tenant's ID or resource details. The audit event should store the attacker-provided resource ID only as a keyed-HMAC fingerprint.

### Redaction requirements

| Field | Audit behavior |
|---|---|
| `email` | omit raw value; optionally emit `email_changed=true` |
| `phone` | omit raw value; optionally emit `phone_changed=true` |
| `parentPhone` | omit completely |
| `parentEmail` | omit completely |
| `guardianContact` | omit completely |
| `kvkkConsentStatus` | generic audit may emit only `consent_status_changed=true` |
| `notificationEligibility` | emit only `eligibility_changed=true` or controlled reason code |
| `studentNote` | omit completely; optionally emit `note_changed=true` |
| notification/message body | omit completely |
| credential/token/secret | omit completely |
| IP | keyed-HMAC fingerprint or truncation only |
| User-Agent | browser/device family only |

Technical redaction is omit-first, recursive, and based on normalized key matching across camelCase, snake_case, kebab-case, and case variants. Audit metadata is allowlist-only. Entity/DTO serialization, sensitive endpoint body logging, exception echo of invalid values, and log-injection control characters are forbidden. CI artifacts must be scanned for raw email, phone, token, contact, and note patterns. Audit storage must be immutable, tenant-scoped, and unavailable to teacher and operations manager roles.

### Contract-stage audit-required matrix

| Endpoint class | `audit_required` |
|---|---:|
| Non-sensitive list/read | false |
| Masked/minimized student basic read | false |
| Full teacher contact read | true |
| Parent/guardian contact read | true |
| KVKK consent read | true |
| Notification eligibility read | true |
| Student note read | true |
| Create | true |
| Update | true |
| Deactivate/reactivate | true |
| Bulk import | true |
| Failed authorization | true |
| Tenant denied access | true |
| Validation error | conditional |
| Health/readiness endpoint | false |

### Security test scenarios for future implementation

| Test ID | Scenario | Expected |
|---|---|---|
| `M2-SEC-001` | teacher create with email/phone | `teacher.created`; no raw email/phone |
| `M2-SEC-002` | phone-only update | `changedFields=["phone"]`; no old/new values |
| `M2-SEC-003` | active record deactivation | `.deactivated`; not generic `.updated` only |
| `M2-SEC-004` | passive record reactivation | `.reactivated` event |
| `M2-SEC-005` | authorized parent-contact read | 200 plus purposeCode plus audit; no contact in audit |
| `M2-SEC-006` | teacher parent-contact read | 403 `PERMISSION_DENIED` plus denied event |
| `M2-SEC-007` | cross-tenant resource ID | 403 `TENANT_ACCESS_DENIED`; no existence leak |
| `M2-SEC-008` | student list/detail | parent, guardian, consent, and note fields absent |
| `M2-SEC-009` | KVKK consent change | only `consent_status_changed=true` |
| `M2-SEC-010` | student note create/update/read | body absent from all logs and audit records |
| `M2-SEC-011` | successful bulk import | batch summary plus source-linked entity events |
| `M2-SEC-012` | partial import failure | row number/error code present; rejected value absent |
| `M2-SEC-013` | nested contact payload | camel/snake/nested aliases redacted |
| `M2-SEC-014` | authorization header/cookie/token | absent from log artifacts |
| `M2-SEC-015` | audit writer unavailable | sensitive write/read fails closed or writes atomically to outbox |
| `M2-SEC-016` | repeated request | idempotency key prevents duplicate event |
| `M2-SEC-017` | audit update/delete attempt | DB or service-level deny |
| `M2-SEC-018` | audit log cross-tenant query | empty result or 403 plus security event |
| `M2-SEC-019` | log injection payload | newline/control characters neutralized |
| `M2-SEC-020` | CI sensitive log scan | build fails on raw PII |

### Audit merge-hold conditions

A future M2 implementation must remain on **HOLD** if any of these conditions apply:

1. Runtime controller, service, entity, migration, or authorization changes are proposed while #51 guardrail is still open.
2. Route to permission to role to `audit_required` mapping has gaps.
3. Bulk import contract or secure error model is missing for an implemented import endpoint.
4. Sensitive read endpoints are embedded in generic CRUD routes.
5. `student_group:*` permission seed/tests are missing for runtime guard usage.
6. `academic_term:*` permission seed/tests are missing for runtime guard usage.
7. Audit event registry or event version standard is absent.
8. Audit persistence is not atomic with data changes for sensitive writes/reads.
9. Audit sink outage behavior is undefined.
10. Raw email, phone, contact, token, or student note appears in test/log artifacts.
11. RBAC tests fail.
12. Tenant isolation tests fail.
13. KVKK and audit-redaction tests fail.
14. DB Smoke, Backend CI, Sprint 1 Quality Gate, or build fails.
15. GitGuardian/secret scanner findings are open or inconclusive.
16. Migration rollback and application rollback plans are missing.
17. Audit log read permission is expanded to teacher or operations manager roles.
