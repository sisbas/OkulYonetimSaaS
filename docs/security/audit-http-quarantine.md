# Audit HTTP boundary — permanent quarantine (#373)

## Decision

**Global audit chain verification is permanently quarantined from all HTTP
surfaces.** No tenant, operations, or platform-authority endpoint publishes
`GET /api/v1/audit/verify`. The route is not registered; requests receive
application-controlled 404.

This supersedes the temporary quarantine applied in #367/PR #366, which
registered the route with a controlled 403. The route registration is now
removed entirely — a registered 403 would imply a permission-gated surface
exists; no such surface is approved.

## Rationale

The global audit hash chain cannot be tenant-filtered. Any HTTP surface that
scans it exposes cross-tenant metadata (row counts, checkpoint head hashes,
sequence numbers) to the caller. Existing tenant-scoped permissions
(`audit_log:operations:read`) are grants within a tenant context; they are not
platform authority and must not unlock a global scan.

The pilot does not yet require live chain verification. `verifyAuditChain`
(pure function in `audit-chain.ts`) covers signature validation, key rotation,
checkpoint anchoring, and truncation detection — all unit-tested in
`audit-chain.spec.ts`. The gap is live verification during pilot observation,
which is blocked by this quarantine by design.

## Rejected alternatives

1. **Platform-only verification authority.** A separately reviewed, non-tenant
   surface that can scan the global chain. Rejected because it creates a new
   attack surface with no current consumer; the pilot does not require it, and
   the design cost (new permission model, separate security review) is not
   justified until live verification is needed.

2. **Tenant-filtered chain verification.** Filtering the global chain by
   `tenant_id` before verification. Rejected because the hash chain is
   sequential and global — filtering breaks the `prev_hash → entry_hash`
   linkage and makes truncation detection impossible. A tenant-scoped
   verification would produce a false "valid" result for a tampered global
   chain.

3. **Retaining the registered 403 route.** Keeping `GET /audit/verify`
   registered with `ForbiddenException` and a permission check. Rejected
   because a registered route implies a permission-gated surface exists; the
   permission `audit_log:operations:read` was removed from the catalogue and
   role seeds. Removing the route entirely eliminates the false surface.

## What was removed (#373)

- `AuditQueryService.verify()` method and its supporting types
  (`AuditVerificationResult`, `DEFAULT_AUDIT_VERIFY_LIMIT`,
  `MAX_AUDIT_VERIFY_LIMIT`, `clampLimit`, `toVerifiable`).
- `GET /api/v1/audit/verify` controller route and its
  `audit_log:operations:read` permission guard.
- `audit_log:operations:read` from `PERMISSION_SEED` and from the
  `operations_manager` role assignment.

## What was retained

- `verifyAuditChain` pure function in `audit-chain.ts` with full unit test
  coverage in `audit-chain.spec.ts` — signature validation, key rotation,
  checkpoint anchoring, truncation detection. Reference for future platform
  authority.
- `AuditQueryService.lastCheckpoint()` — used by `AuditRetentionService` for
  checkpoint validation during retention pruning.
- `GET /api/v1/audit/logs` — tenant-scoped, KVKK-masked audit reading with
  durable read-audit trail. Unaffected.
- `audit_log:read`, `audit_log:security:read`, `audit_log:retention:run`
  permissions — unaffected.

## Reopen conditions

A platform-only verification surface may be revisited when:

1. Pilot observation is complete and live chain verification is required for
   acceptance evidence.
2. A separately reviewed platform-authority contract defines the permission
   model (distinct from tenant grants) and the safe operational surface.
3. Independent security review approves the design.

#358 is redefined around pilot observation: `verifyAuditChain` tests already
cover signature and key-rotation correctness; the open gap is live chain
verification during pilot, which is blocked by this quarantine by design.

## Verification

- `src/common/audit/audit-query.service.spec.ts`: `verify` method absent;
  `lastCheckpoint` rejects corrupted/unknown-key/mismatched-signature
  checkpoints; `list` masks PII and audits the sensitive read.
- `test/rbac/permission-seed.spec.ts`: 122 unique permissions (was 123);
  `audit_log:operations:read` absent from catalogue and role assignments.
- `test/kvkk/gate1-kvkk.spec.ts`: teacher role does not hold audit
  verification permissions.
- `test/runtime-integration/api-routing-authority.spec.ts`: `audit/verify`
  returns 404 (unregistered route); `AuditQueryService.verify` is not a
  runtime method; `audit/logs` returns 401 unauthenticated / 403 without
  permission.
- `test/database/audit-retention.db.spec.ts`: PostgreSQL integration —
  authenticated tenant-admin with legacy grants receives 404 on
  `audit/verify`; chain rows and checkpoint count unchanged. Requires
  exact-head CI execution.
- `src/common/audit/audit-chain.spec.ts`: pure-function verification
  coverage (key rotation, truncation, tamper detection).

## Rollback

No migration or data conversion. Reverting the PR merge restores the
registered-403 quarantine from #366. The permission
`audit_log:operations:read` may reappear in the seed; existing DB rows for
the permission are harmless (no route consumes them). Preserve DB audit
records and key-ring configuration.
