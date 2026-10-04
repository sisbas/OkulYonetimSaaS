# N0 — legacy send quarantine / scoped pending read

Program P1B-FINAL; issue #266, milestone M6; Refs #266 #259 #269.
Owner-selected design: LEGACY SEND QUARANTINE. N0 is an internal authority
seam repair before N2 wiring, not public-leak, complete lifecycle or pilot acceptance.

## Contract

- `ParentNotificationService.sendToParent` and `NotificationEligibilityService.send`
  reject every input with HTTP 403 / `NOTIFICATION_LEGACY_SEND_QUARANTINED`.
  They do not inspect caller input, evaluate it, enqueue, persist or log. Approved
  consent/verified contact/allowed channel do not authorize legacy execution.
- Existing signatures/DI and startup pseudonym-key fail-closed checks are retained.
  Pure `evaluate` and `NotificationApprovalGuard.canSend` remain separate pure seams.
- `findPending(entityManager, trustedRequestContext, limit)` requires tenant and
  branch before storage. Only authenticated/server-authoritative, persisted and
  validated upstream request context is permitted. DTO/query/header claims cannot
  be passed as scope. Presence validation does not create membership/role authority;
  existing authentication/default-deny/current-authority guards remain required.
- SQL explicitly scopes outbox tenant, joins session id **and tenant equality**,
  scopes session branch, reads due pending only, and projects `id`, `tenantId`,
  `channel`. No raw payload/contact/aggregate is returned. Limits must be safe
  positive integers, capped at 500. Infrastructure failures propagate.
- This read is neither eligibility nor dispatch authority; no global worker,
  claim/lease, retry, SKIP LOCKED or provider wiring is added.
- Canonical locked-absence transactional enqueue is unchanged. Draft/published
  and NOT_MARKED do not produce intent. Consent denial is not a send. Existing
  masked/pseudonym payloads, tenant-scoped unique dedupe and caller transaction
  remain authoritative.

## Data and rollback

No migration, historical rewrite, new API/UI or external dependency. Existing
varchar log status and outbox CHECK remain. Historical `sent` / CreateDateColumn
`sent_at` are not actual-send/delivery evidence or reliable delivery KPI inputs.
Lifecycle/timestamp design is N2; encrypted contact/versioned consent is N1.

Rollback is a reviewed source revert PR followed by lint, focused KVKK/notification
and real PostgreSQL regression verification. No migration down/data backfill is
needed. Reverting quarantine re-enables unsafe enqueue-to-`sent` semantics and
legacy log mutation; reverting scope hardening re-enables unscoped pending reads.
Do not represent rollback as risk-free, and do not execute production rollback
automatically.

## Evidence boundary

`test/database/notification-outbox-scope.spec.ts` uses real PostgreSQL with
session-local ON COMMIT DROP fixtures for query/transaction regressions only.
Its exact-file acceptance-guard exception has an explicit non-acceptance reason
and participates in existing stale-entry validation. It is not a business/UI
journey, receipt/delivery proof, notification lifecycle acceptance or pilot PASS.
The mocked migration smoke test is not substituted for this SQL evidence.

Required behavior: A/X isolation from A/Y and B; tenant/session mismatch exclusion;
blocked/future/dispatched/failed exclusion; alias; bounded limit; pre-query scope
and invalid-limit denial; real storage error propagation; canonical no-intent,
consent rejection, dedupe, redaction and caller-transaction rollback.
Executed evidence and current-head review/CI are recorded in `artifacts/N0/evidence.md`
and the PR. SKIPPED/CANCELLED/NEUTRAL/ENVIRONMENT_UNAVAILABLE are never PASS.
