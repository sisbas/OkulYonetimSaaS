# Audit HTTP boundary — #367 / PR #366

The pilot runtime registers `AuditModule`, including authenticated and
permission-protected `GET /api/v1/audit/logs`. `GET /api/v1/audit/verify`
is registered but returns a controlled 403 even with a legacy operations grant:
global chain verification is not tenant authority. It performs no scan and
publishes no cross-tenant counts/checkpoints. A usable platform verification
surface requires an owner-approved authority model and separate runtime evidence.
`AuditQueryService` validates the HMAC key ring during Nest provider construction.

Global retention is **out of the tenant-facing HTTP release scope**. Neither
`retention/plan` nor `retention/run` is a controller route (GET or POST). There
is no environment switch to re-enable these routes. The service remains an
internal provider; retention policy, pruning, checkpoint format and dry-run
semantics are unchanged. No new retention operator or runtime worker is added.

Existing `audit_log:retention:run` permissions, including previously persisted
role grants, cannot publish a removed route. The permission catalogue and seed
are retained for compatibility; a grant is not platform authority. Reintroducing
HTTP retention requires a separately reviewed platform-authority contract.

## Verification

- `src/app.module.spec.ts`: module registration regression contract.
- `test/runtime-integration/api-routing-authority.spec.ts`: real Nest graph,
  audit routes return 401 without authentication and 403 without permission;
  removed retention routes return application-controlled 404 even for an
  authenticated tenant-admin holding the legacy grant, and do not invoke the
  retention service; malformed/weak/duplicate historical key configuration rejects boot.
  This test uses a stub data source/auth session, not PostgreSQL acceptance.
- `test/database/audit-retention.db.spec.ts`: PostgreSQL service semantics plus
  authenticated HTTP quarantine probe using real login and persisted tenant-admin
  role/legacy permission grants, proving two tenants' audit rows and checkpoint
  count remain unchanged. Reference permission setup works with and without the
  permission seed. This is security integration evidence, not a business UI
  journey. Local PostgreSQL was unavailable; require exact-head CI execution.
- Existing audit-chain key-ring unit tests also cover duplicate active key IDs.

This fail-closed security repair changes the originally requested usable verify
contract. #367 verifier runtime acceptance remains BLOCKED pending owner decision;
do not check it complete merely because the denial route is registered.
Registration is not checkpoint trust-anchor acceptance (#358). No full-chain,
truncation-detection, production-health or pilot-readiness claim follows from
this bounded repair.

## Rollback

No migration or data conversion. Reverting the complete PR merge restores the
previous disconnected audit runtime. Reverting only the quarantine repair while
keeping module registration would expose destructive global retention and is
not a safe rollback. Use the complete merge revert or remove `AuditModule` from
runtime registration in a reviewed emergency rollback PR. Preserve DB audit
records and key-ring configuration.
