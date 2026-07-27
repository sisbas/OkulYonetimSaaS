# ADR: Production Frontend Runtime Preflight

Status: Proposed  
Issue: #145  
Gate dependency: #144 API/contract outputs must be stable before runtime implementation.  
Date: 2026-07-27

## Context

Okul Yönetim SaaS Faz 1 MVP now has a backend-first API core and preflight permission/API work. The next frontend step is not a demo prototype. It is a production runtime that will later bind to real auth, RBAC, tenant/branch scope and API responses after #144 passes.

This ADR defines the preflight decision boundary before implementation starts. It intentionally does not add runtime frontend code, an API client, fake API binding, localStorage authority, Builder.io imports, Vercel demo logic or production-like PII fixtures.

## Decision

Use a production frontend workspace only after #144 passes, with the following preflight constraints:

1. The frontend runtime must treat backend auth/session, tenant, branch, teacher, course and permission state as server-authoritative.
2. Client-provided tenant, branch, teacher, course or schedule identifiers must never be treated as authority.
3. Route access, action visibility and UI state must be derived from API responses and canonical reason codes, not hard-coded role strings alone.
4. Forbidden and missing-resource outcomes must avoid cross-tenant enumeration. The UI must not reveal whether a denied object exists in another tenant or branch.
5. Demo, Builder and full-vision artefacts must be boundary-tested and must not be imported into production runtime code.
6. Browser E2E, accessibility and scanner evidence are required at the runtime implementation gate; this preflight PR only prepares those artefacts.

## Production workspace stance

The runtime workspace may be introduced in a later PR as a separate app/package or as a clearly isolated frontend entrypoint. That later PR must prove:

- Build command and CI target.
- Real API client wiring.
- Auth/session bootstrap.
- RBAC/Permission Catalog integration.
- Tenant and branch selection from server-authoritative context.
- P0 browser E2E coverage.
- No imports from demo frontend, Builder exports or full-vision prototypes.

This preflight PR does not choose an irreversible framework implementation detail. It defines acceptance boundaries that any framework choice must satisfy.

## Accepted future runtime properties

- Real browser routes for Faz 1 operational flows only.
- Server-authoritative session and scope resolution.
- Typed API contract layer generated or verified from stable #144 outputs.
- Canonical reason-code mapping for loading, empty, forbidden, stale, conflict and offline states.
- Role-sensitive rendering for Teacher and Operations Manager without exposing raw permissions or cross-tenant record existence.
- Explicit audit/KVKK guardrails in UI state design.

## Rejected in this preflight

- Runtime implementation.
- API client code.
- Fake API adapters.
- localStorage, sessionStorage or cookie-backed authority.
- Demo fixture import.
- Builder.io or Vercel presentation artefact import.
- Production-like PII fixtures.
- New dashboard or design-system rewrite.
- Faz 2 or Faz 3 screens.

## Rationale

The main product risk is treating the previous clickable demo as a production frontend base. The demo is useful for presentation, but not a safe runtime foundation because it uses deterministic local state and intentionally lacks auth, API and RBAC. Production work must start from real contracts after #144 and must preserve non-enumerating, tenant-safe behavior.

## Consequences

- Runtime frontend work remains blocked until #144 API/contract outputs are stable.
- This PR can be opened before #144 because it only adds preflight documentation and test plans.
- Future runtime PRs must reference this ADR and prove the boundary checks.
- Any runtime implementation that imports demo, Builder or full-vision artefacts fails the release gate.

## Acceptance coverage

- Production frontend ADR ready: yes.
- Runtime implementation added: no.
- Fake API/localStorage authority used: no.
- API binding added: no.
