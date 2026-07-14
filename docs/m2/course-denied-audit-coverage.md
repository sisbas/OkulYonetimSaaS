# M2 Course Denied Audit Coverage

## Purpose

Document the Course CRUD follow-up for Audit Event Registry v1 denied-event coverage.

## Event coverage

| Event | Layer | Metadata policy |
|---|---|---|
| `course.created` | `CourseAuditService.emit` | allowlist course lifecycle metadata |
| `course.updated` | `CourseAuditService.emit` | allowlist course lifecycle metadata |
| `course.deactivated` | `CourseAuditService.emit` | allowlist course lifecycle metadata |
| `course.reactivated` | `CourseAuditService.emit` | allowlist course lifecycle metadata |
| `authorization.denied` | `PermissionGuard` + `SecurityAuditService` | allowlist denial metadata only |
| `tenant.access_denied` | `CourseService` + `CourseAuditService` | allowlist tenant denial metadata only |

## Authorization denied contract

Authenticated users without the required course permission receive `403` through the existing guard path and emit:

```text
authorization.denied
```

Allowed fields:

```text
eventName
tenantId
actorId
requestId
resource
requiredPermission
outcome
reasonCode
```

## Tenant access denied contract

Tenant-scoped Course lookup still hides cross-tenant resources as `404`, but emits:

```text
tenant.access_denied
```

Allowed fields:

```text
eventName
tenantId
actorId
requestId
resource
resourceId
outcome
reasonCode
```

## Forbidden audit fields

Denied audit events must not include raw payload or PII-like keys:

```text
requestBody
responseBody
authorization
cookie
token
password
credential
email
phone
parentPhone
parentEmail
guardianContact
messageBody
notificationPayload
guidanceNote
studentName
parentName
teacherName
```

## Decision

Course CRUD success events remain unchanged. Denied-event persistence evidence is added through unit tests for `authorization.denied`, `tenant.access_denied`, metadata allowlist, and forbidden-key absence.
