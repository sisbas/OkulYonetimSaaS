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
