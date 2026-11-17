# Production Auth Environment Contract for #332

## Amaç
Resolves issue #332 by documenting and validating the production environment contract that prevents `/api/v1` from booting with missing authentication and audit secrets.

## Kapsam
Adds a value-free production environment contract, a secret-safe environment diagnostic, an opt-in production authentication smoke test, workflow wiring, and the supporting documentation.

## Kapsam dışı
Provisioning production secrets, changing Vercel settings, deploying production, and completing a real synthetic-teacher observation remain post-merge operational steps.

## Changes
- Adds the value-free contract and secret-safe diagnostics.
- `scripts/production-env-contract.cjs` — value-free env contract schema
- `scripts/check-production-env.cjs` — secret-free presence/length validation
- `scripts/production-auth-smoke.cjs` — auth smoke test (reachability or full teacher login)
- `KVKK_PSEUDONYM_KEY` and `KVKK_CONTACT_KEY` remain explicitly deferred; their fail-closed runtime behavior is documented.

## Acceptance criteria
- [x] Production contract lists bootstrap, lazy, and optional variables without secret values.
- [x] Environment diagnostics measure each variable against its configured minimum or exact byte contract.
- [x] Auth smoke requires credentials unless the explicit reachability-only opt-out is enabled.
- [x] Reachability-only mode accepts only documented HTTP 400 or 401 application errors.
- [x] Authenticated smoke uses the always-available `/api/v1/context` endpoint.
- [x] Receipts contain verdicts and scrubbed metadata without credentials or tokens.

## Test çıktısı
Local validation passed: `node --check scripts/production-auth-smoke.cjs`, `node --check scripts/check-production-env.cjs`, and `node --check scripts/production-env-contract.cjs`. Existing CI run 41309940586 provides the governance and repository test execution reference; the new commit will trigger a fresh run.

## KVKK/audit etkisi
No secret values, credentials, JWTs, email addresses, or contact payloads are written to logs or artifacts. KVKK pseudonym and parent-contact keys remain deferred and their lazy runtime paths continue to fail closed; audit key identifiers are validated without exposing key material.

## Rollback
If the new contract or smoke behavior causes an operational regression, revert the commit that introduced these scripts and workflow changes, then restore the previous production-observation workflow. No database migration or irreversible data change is included, so a Git revert is sufficient.

## CI run referansı
GitHub Actions run 41309940586: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/41309940586. The post-fix push will produce the authoritative current-head check runs.