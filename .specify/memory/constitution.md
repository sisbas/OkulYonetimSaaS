<!--
Sync Impact Report
Version change: N/A -> 1.0.0
Modified principles: None; initial constitution adoption
Added principles:
- I. Backend API Scope Is Authoritative
- II. Tenant Isolation Is Non-Negotiable
- III. RBAC, KVKK, And Audit Are Security Boundaries
- IV. Database Changes Require Runtime Evidence
- V. Quality Gates Decide Readiness
- VI. Operational Interfaces Must Be Predictable
Added sections:
- Technical Constraints
- Development Workflow
Removed sections: None
Follow-up TODOs: None
-->

# Okul Yonetim SaaS API Constitution

## Core Principles

### I. Backend API Scope Is Authoritative

This project is a backend-first NestJS API for school operations. The canonical
runtime surface is the `/api/v1` API and the `/api/v1/health` endpoint, not a
browser preview, Builder preview, or static demo artifact. Production-facing
feature work MUST preserve the backend API contract, request validation,
response shape, and documented module boundaries before adding presentation
concerns. Frontend or demo assets MAY exist as supporting artifacts, but they
MUST NOT redefine acceptance for backend API work.

Rationale: The repository README defines the project as a backend-only API core;
acceptance must follow the service that users and integrations actually depend
on.

### II. Tenant Isolation Is Non-Negotiable

Every tenant-scoped runtime operation MUST derive tenant context from the
authenticated request context, including JWT `tenant_id` where applicable.
Repositories and services that access tenant-scoped tables MUST filter reads,
lookups, creates, updates, deletes, joins, exports, and relationship checks by
the active tenant. Route params, query params, request bodies, and client
headers MUST NOT override repository tenant scope. Cross-tenant access,
association, search, export, or id-based lookup is prohibited unless the code is
a migration, permission seed, system bootstrap, or test setup path explicitly
documented as a global exception.

Rationale: Tenant isolation is the final data-access defense for a multi-tenant
school SaaS system.

### III. RBAC, KVKK, And Audit Are Security Boundaries

Protected routes MUST enforce permissions through the established RBAC guard and
permission decorators. Work that changes access, sensitive reads, lifecycle
mutations, or visibility for students, parents, guardians, teachers, schedules,
notifications, or consents MUST document RBAC, KVKK, and audit impact before it
is considered complete. Personal data, credentials, tokens, authorization
headers, cookies, notification payloads, parent or guardian contact details,
student identity fields, health notes, counseling notes, and raw request or
response bodies MUST NOT be persisted to audit metadata or logs. A reviewed
allowlist MAY permit only explicitly identified non-secret metadata fields that
are necessary for auditability and contain no raw payloads, credentials,
authorization material, cookies, tokens, contact values, or personal/sensitive
data. Success audits for lifecycle mutations MUST commit or roll back in the
same PostgreSQL transaction as the domain mutation.

Rationale: Authorization, privacy, and auditability are not optional features in
an education SaaS; they are release blockers when wrong.

### IV. Database Changes Require Runtime Evidence

Schema, migration, seed, repository, and data-source changes MUST be verified
against PostgreSQL using the project scripts before merge readiness is claimed.
Tenant-scoped repository changes MUST include tests that prove tenant filtering
and unauthorized access behavior. Migrations MUST be reversible or accompanied
by a documented rollback and data-impact plan. Runtime code MUST NOT rely on
SQLite, in-memory mocks, or demo-only persistence as acceptance evidence for
database behavior.

Rationale: The service requires a live PostgreSQL connection at runtime, and
data defects in a multi-tenant system are expensive to discover late.

### V. Quality Gates Decide Readiness

No change is merge-ready until the relevant quality gate has a completed PASS
with evidence. At minimum, backend changes MUST pass install, TypeScript static
checks, focused unit or integration tests, database migration/seed/data-source
verification when touched, RBAC/KVKK/audit tests when touched, and build. Any
failure MUST be classified before retry or merge discussion as flaky,
environment/config, real test failure, schema failure, build failure, or
release-blocking audit/redaction failure. Secret scanner findings MUST be
resolved as remediated or documented false positives before acceptance is
claimed.

Rationale: Ambiguous CI results, blind retries, and undocumented scanner
findings have the same operational value as failing checks.

### VI. Operational Interfaces Must Be Predictable

API endpoints, DTOs, error responses, health responses, CLI scripts, and CI
summaries MUST be stable, explicit, and automatable. New behavior MUST preserve
existing `/api/v1` prefixing, validation conventions, NestJS module structure,
and package scripts unless a spec and migration plan justify the change.
Runtime failures caused by missing required environment variables or unavailable
PostgreSQL MUST be reported as environment/config failures, not confused with
frontend preview failures. Observability output MUST help operators identify the
first meaningful failure without leaking sensitive data.

Rationale: A SaaS backend is operated repeatedly by humans and automation; its
interfaces must be boring in the best possible way.

## Technical Constraints

The project runtime is Node.js 22.x, NestJS 10, TypeScript, TypeORM 0.3, and
PostgreSQL. New production dependencies MUST be justified by a concrete need and
MUST fit the existing stack. Authentication uses JWT access tokens and refresh
token rotation; refresh tokens MUST be stored only as hashes. `DATABASE_URL` is
required for production-like runtime and database verification. The health
endpoint MUST NOT expose personal data, credentials, tokens, or tenant data.

Tenant-scoped tables MUST follow the repository tenant-scope contract described
in project documentation. The global exceptions are users, permissions, TypeORM
migration metadata, migrations, permission seed, system bootstrap, and test
setup. Tenant-related user listing MUST join through tenant membership scope.

## Development Workflow

Feature work starts from a written spec or issue that states scope, non-scope,
acceptance criteria, data impact, RBAC/KVKK/audit impact, and rollback plan.
Implementation MUST stay inside the approved scope and MUST NOT weaken CI, DB
smoke, RBAC, KVKK, audit, branch protection, or scanner requirements to make a
change pass.

Pull requests MUST include purpose, scope, non-scope, acceptance criteria, test
output, KVKK/audit impact, rollback, and CI reference. Protected branches
require pull request review, resolved conversations, up-to-date required status
checks, and no force-push or deletion bypass. Admin bypass is allowed only when
explicitly approved and logged. If `main` is broken, the first response is a
revert or rollback PR followed by a focused fix.

## Governance

This constitution supersedes conflicting local preferences, ad hoc prompts, or
demo acceptance criteria for this repository. Every feature spec, plan, task
breakdown, implementation, and review MUST check compliance with these
principles. A reviewer may block a change that violates tenant isolation, RBAC,
KVKK, audit integrity, database evidence, or quality gate rules even when the
code appears functionally complete.

Amendments require a documented pull request that explains the reason for the
change, affected principles, migration impact, and required updates to specs,
templates, CI, or documentation. Versioning follows semantic governance:
MAJOR for incompatible principle redefinitions or removals, MINOR for new
principles or materially expanded governance, and PATCH for wording or
non-semantic clarifications. The ratification date remains the first adoption
date; the last amended date changes whenever this file changes.

**Version**: 1.0.0 | **Ratified**: 2026-08-05 | **Last Amended**: 2026-08-05
