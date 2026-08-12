# [WP-07F][B1] Restore nested production /api/v1 routing authority

## Authority
Implements issue #195 only. Normal repository governance applies (issue → bounded branch → Draft PR → tests/review → Ready/Merge gates). Does not alter #185/#145 state. No production observation dispatched.

## Source-of-truth state (from handoff)
- base/main candidate: `37b40f243dfb496c55349876d3d865bfeaed35b3`
- current production: `/api/v1/health` → Nest JSON (OK)
- current production: `/api/v1/daily-operations/today`, `/api/v1/leaves/me` → Vercel `404 NOT_FOUND` (BROKEN)

## Root-cause analysis (Required exploration)
The Nest-side handler (`api/v1/index.ts` → `restoreRewrittenApiRequestUrl`) is **correct and fully tested** (9/9 routing-authority tests pass locally — see Acceptance). It already:
1. Reads `__vercelApiPath` from the rewrite query marker and rebuilds `/api/v1/<nested>`,
2. Falls back to the original nested path when the marker is absent,
3. Strips the internal marker before Nest sees the request,
4. Rejects unsafe path segments (`.`/`..`),
5. Preserves method, body, query, auth headers, and `x-tenant-id`.

Because the handler is proven correct, the production `404` must originate in the **Vercel function topology**, not the code. The repo defines `api/v1/index.ts` and `api/v1/[...path].ts`, but `vercel.json` never explicitly declares `api/v1/index.ts` as a serverless function. When `outputDirectory` is set to a static build (`hosted-demos-static-dist`), Vercel's auto-detection of `api/` functions is unreliable, so nested `/api/v1/*` traffic falls through to the static/404 layer instead of reaching the function.

## Chosen solution
Add an explicit `functions` block to `vercel.json` declaring `api/v1/index.ts` as a serverless function. This is the **smallest route-topology correction**: it makes Vercel's rewrite target (`/api/v1?__vercelApiPath=:path*`) resolve to a known function instead of falling through.

```json
"functions": {
  "api/v1/index.ts": { "maxDuration": 30 }
}
```

No changes to `api/v1/index.ts`, `api/v1/[...path].ts`, controllers, or any backend contract. Single Nest bootstrap preserved (no parallel business API).

## Rejected alternatives
1. **Rewrite wildcards without a functions declaration** — already the current state; it 404s in production. Insufficient.
2. **Catch-all `api/v1/[...path].ts` re-implementation** — the catch-all already exists and only re-exports `index.ts`; rewriting it would duplicate the handler and widen blast radius. Rejected for code duplication.
3. **Parallel business API implementation** — violates Constitution Principle I (Backend API Scope Is Authoritative) and the issue's "do not create a parallel business API" constraint. Rejected.

## Scope
- `vercel.json`: add `functions` block (5 lines).

## Non-scope
- No controller, DTO, auth, tenant, RBAC, or audit changes.
- No #185/#145 state changes.
- No production observation workflows.

## Acceptance criteria (proven locally)
`npm run test:runtime-integration` → `api-routing-authority.spec.ts`: **9 passed, 9 total**.
- `/api/v1/health` → 200 Nest JSON
- `/api/v1/daily-operations/today` → 401 Nest JSON (not platform NOT_FOUND)
- `/api/v1/leaves/me` → 401 Nest JSON (not platform NOT_FOUND)
- Vercel-rewritten shape `/api/v1?__vercelApiPath=...` → reaches Nest, strips marker
- POST + JSON body + query + auth headers + `x-tenant-id` survive routing into Nest validation/tenant context
- Unknown nested route → Nest-controlled 404 JSON (never platform HTML)

## KVKK / audit impact
None. No PII, tokens, cookies, auth headers, or raw response bodies are persisted. No audit metadata changes. Existing redaction and scanner gates preserved.

## Rollback
Revert `vercel.json` to remove the `functions` block (single-file, no migration, no data impact).

## CI reference
- `npm run test:runtime-integration` (routing authority spec)
- `npm run build` (vercel.json JSON validity + build)
- Secret scanner / governance gates unchanged.

## Post-merge
Stop after merge evidence. Do not run production observation. Return merge commit SHA + CI/review evidence to CTO.
