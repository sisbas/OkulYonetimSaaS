# N1a — Encrypted Parent Contact / Contact Point / Student-Link Foundation

**Program:** P1B-FINAL · **Slice:** N1a (of N1) · **Issue:** #266 · **Milestone:** M6
**Related:** #259, #265, #269, #345

## Purpose

Establish the **encrypted, tenant-safe, versioned** storage foundation for
parent contact data — the storage substrate that N1b (authoritative versioned
consent) and N1c (immutable notification snapshots + public API) will build on.
Raw contact values (phone/email) live **only** in AES-256-GCM authenticated-
encryption envelopes; every public/internal read surface is masked/minimized by
default.

## Scope (N1a)

- **`parent_contacts`** — tenant-bound authorized recipient/guardian reference;
  lifecycle (`active|inactive|revoked`) + optimistic `version`. No free-text or
  unnecessary personal fields; guardian/consent authority is **not** inferred
  from name/phone existence.
- **`contact_points`** — same-tenant contact point per parent contact; supported
  channel (`sms|whatsapp|email`); **encrypted** normalized value (AES-256-GCM
  envelope `{v, keyId, nonce, ciphertext, tag}`); masked display projection;
  purpose-bound keyed blind index; verification state + trusted evidence
  reference; lifecycle + version. `verified=true` client flag is **not**
  authoritative verification.
- **`student_parent_contacts`** — same-tenant student↔contact association with
  effective-date (`effective_from`/`effective_to`)/lifecycle/version contract.
  Cross-tenant association is impossible (composite FK + tenant predicate).
  Revoked/inactive/out-of-date links are not eligible recipients. Multiple
  authorized recipients per student are modeled explicitly — no silent
  "first parent/contact" selection.
- **Encryption adapter** (`src/kvkk/contact-crypto.ts`) — AES-256-GCM, fresh
  12-byte nonce per encryption, AAD binding to `tenantId|recordId|purpose`
  (cross-tenant/record/purpose relocation fails authentication), current +
  retained previous key ring (rotation), fail-closed on unknown key-id / weak
  key / malformed envelope / wrong tag / modified ciphertext. Key material is
  **separate** from JWT signing, audit HMAC and pseudonym keys. Blind index is
  a purpose-bound keyed HMAC derivation, **not** plain SHA(contact).
- **Masked projection** (`src/parents/contact-masking.ts`) — phone/email
  masking; unknown channel fully masked (fail-safe).
- **Repository** (`src/parents/parent-contact.repository.ts`) — encrypted write,
  masked read (tenant+branch+student scoped, lifecycle/effective-date filtered),
  authorized raw read (tenant-scoped, AAD-verified), optimistic-concurrency
  lifecycle transitions. All writes run in the **caller's transaction** so
  domain mutation + encrypted write + (service-layer) audit stay atomic.
- **RBAC** — `student:parent_contact:manage` permission (operations_manager,
  tenant_admin); catalog/seed/controller consistency updated together. Teacher
  remains explicitly denied (`forbidden_403`). **No public raw-contact read
  endpoint in N1a** — raw decryption is internal-only (future N2 relay) behind
  `student:parent_contact:read` + sensitive-read audit.

## Out of scope (N1a)

- Authoritative versioned **consent** authority / resolver (N1b) — the
  `AbsenceNotificationService.resolveConsent()` `rows.some(approved)`
  resurrection fix is **N1b**, not this slice.
- Immutable source/contact/consent/template **snapshots** in the outbox (N1c).
- Public API controllers/endpoints, dispatch, retry, manual recovery, operator
  UI (N1c/N2/N3).
- Parent portal, verification provider/OTP integration, real transport (N2/N3).
- Production key generation/rotation (deployment/secret-manager boundary).
- Legacy plaintext contact migration (no legacy plaintext store exists yet; the
  transform, if ever needed, requires the key and explicit owner authority).

## N0 prerequisite / stacked dependency

N0 (PR #377, LEGACY SEND QUARANTINE) is **not yet merged**. Per the N1 master
instruction, N1a proceeds on an isolated branch as schema/contract/test
preparation only:

- Legacy helpers (`ParentNotificationService.sendToParent`,
  `NotificationEligibilityService.send`) are **not** wired to any N1a API.
- N1a does **not** claim operational/readiness acceptance; that gate stays
  blocked until N0 lands.
- Stacking: **N1a (this) → N1b (consent authority) → N1c (snapshots + API)**,
  each an explicit dependent Draft PR with unique file ownership and per-head
  evidence. N1a owns `src/kvkk/contact-crypto.*`, `src/parents/*`,
  `src/database/migrations/1830000000000-*`, and the RBAC seed/catalog
  `student:parent_contact:manage` entries.

Canonical absence path is preserved and unchanged: published occurrence →
attendance session/records → locked authoritative absence → transactional
outbox intent. `NOT_MARKED != ABSENT`. Contact or consent grant alone never
produces an attendance notification intent.

## Encryption / key-management contract

- Env (variable names only — **no key values**): `KVKK_CONTACT_KEY` (current,
  exactly 32 bytes), `KVKK_CONTACT_KEY_ID`, `KVKK_CONTACT_PREVIOUS_KEY`,
  `KVKK_CONTACT_PREVIOUS_KEY_ID`.
- Local/test isolated key is returned **only** outside production; production
  with a missing/weak key fails closed at construction (no plaintext/success
  fallback).
- Ciphertext is bound to tenant/record/purpose via GCM AAD; relocation to
  another context fails authentication.
- Rollback preserves `keyId`/envelope metadata; old application versions that
  cannot parse the encrypted schema must not blindly `down()`/revert
  (data-bearing destructive rollback additionally requires owner authority).

## Migration / rollback

- Immutable follow-up migration `1830000000000-CreateParentContactFoundation`
  (timestamp after the last allocated block `1829000000000`; not a blind
  reuse). DDL is idempotent (`IF NOT EXISTS` / `IF EXISTS`), passes
  `npm run check:migrations`.
- Postconditions: CHECK constraints on status/channel/verification; composite
  same-tenant FKs; UNIQUE `(tenant_id, id)` on each table; UNIQUE
  `(tenant_id, student_id, parent_contact_id, branch_id)` link constraint.
- `down()` drops indexes then tables in dependency order (link → contact point
  → parent contact). No data-bearing destructive operation.

## Test evidence

- `src/kvkk/contact-crypto.spec.ts` — round-trip, fresh nonce, wrong key/tag/
  ciphertext rejection, unknown key-id, rotation (previous decrypts legacy),
  cross-tenant/record/purpose relocation denial, production missing/weak-key
  fail-closed, blind-index determinism + tenant/purpose separation.
- `src/parents/contact-masking.spec.ts` — phone/email/unknown-channel masking.
- `test/database/parent-contact-foundation.migration.spec.ts` — DDL shape
  (mocked QueryRunner).
- `test/database/parent-contact-foundation.db.spec.ts` — **real PostgreSQL**:
  CHECK enforcement, encrypted-value-never-plaintext, masked-read-never-raw,
  cross-tenant composite-FK denial, tenant+branch isolation,
  lifecycle/effective-date filtering, optimistic-concurrency (exactly one
  winner), stale-version rejection, duplicate-link prevention. (Local PostgreSQL
  unavailable in this environment — executed via CI DB Smoke with real
  PostgreSQL16; `SKIPPED != PASS`.)

## KVKK / audit impact

- Data minimization: raw contact value never persisted in plaintext, never
  returned by masked reads, never logged (envelope/DTO carry no raw value).
- Sensitive raw reads are purpose/trust-actor bound and must be durably
  audited by the calling service (N1c wires the transactional audit writer).
- Contact encryption key is distinct from JWT/audit-HMAC/pseudonym key
  material; pseudonymization is not used as an encryption substitute.
