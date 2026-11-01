# Production Auth Environment Contract for #332

## Summary
Resolves issue #332: production `/api/v1` fails with `500 FUNCTION_INVOCATION_FAILED` due to missing production auth secrets.

## Changes

### New scripts
- `scripts/production-env-contract.cjs` — value-free env contract schema
- `scripts/check-production-env.cjs` — secret-free presence/length validation
- `scripts/production-auth-smoke.cjs` — auth smoke test (reachability or full teacher login)

### Modified files
- `.env.example` — added `KVKK_CONTACT_KEY` / `_ID`
- `.github/workflows/wp07f-production-observation.yml` — added auth smoke step + receipt artifact
- `docs/production-observation-prerequisite-332.md` — env contract table + residual gaps
- `package.json` — added `check:production-env` / `smoke:production-auth` scripts
- `scripts/diagnose-vercel-deployment.cjs` — added KVKK contact key inventory

### This round's scope: JWT + audit secrets only
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `AUDIT_HMAC_KEY`, `AUDIT_HMAC_KEY_ID=key-1`
- `KVKK_PSEUDONYM_KEY` / `KVKK_CONTACT_KEY` deferred (residual fail-closed gaps documented)

### Residual gates (open issues)
- `KVKK_PSEUDONYM_KEY` / `KVKK_CONTACT_KEY` deferred → parent-contact/pseudonym flows fail-closed in production
- Production env vars + redeploy to be performed after merge (authorized separate step)

## Next steps (post-merge)
1. Add prod env vars to Vercel
2. Git-source production deploy + observation
3. Auth smoke with real synthetic teacher
4. Set `VERCEL_API_TOKEN` + run `WP-07F Production Observation`
5. Record evidence + close #332

**Residential**: no secret values in repo, logs, artifacts. Fail-closed behavior preserved.