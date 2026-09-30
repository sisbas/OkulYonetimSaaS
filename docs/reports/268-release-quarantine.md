# #268 bounded release quarantine — projected, unlanded

Refs #268 #258 #269.

Baseline main: `9bd8d5dc333cdfe575e2500ff6e2828673edcc84`. This branch is
`p1b/final-report-quarantine`; this document describes an **unlanded projection**,
not a claim about current main. The global truth matrix is not reconciled here.
At the baseline, AppModule already defaults `ENABLE_REPORTS` and
`ENABLE_EOKUL_SYNC` OFF; the hidden services still generate completed reports
(including empty summaries) and mock-backed sync results. This change removes
those service success paths.

## Selected release scope

| Module | Selected outcome | Release classification | Evidence |
| --- | --- | --- | --- |
| Reporting | Quarantine | planning-only; explicitly out-of-release-scope | default-OFF AppModule gates, provider absence + public API 404, unconditional service 503 |
| Eokul sync | Quarantine | planning-only; explicitly out-of-release-scope | default-OFF AppModule gates, provider absence + public API 404, unconditional service 503 |

Quarantine is the terminal **product scope decision** for this bounded slice.
Neither module is a runtime/pilot-ready release capability. This does not create
completion obligations for their hidden entities, adapters, migration, UI or
vertical slices. Future activation requires a separately scoped product decision.
The older truth matrix's all-rows-runtime closure rule and remaining-plan's
13/13 target must not be applied to these excluded capabilities. This note only
projects that exclusion; it does not declare overall Phase 1b readiness.

## Enforcement and export safety

AppModule is owned by the audit-module agent and is unchanged. Explicit env
opt-in does not unlock service generation, history or sync: they always return a
stable 503 quarantine code before any repository or adapter access. There is no
empty-table, unsupported-type or mock success fallback. No report or sync
business result is created and no raw payload is logged.

There is no scoped export surface. Default-OFF public report/export paths are
404, with no download header or result payload; direct service calls are denied
equally for different tenants, empty scope and formula-bearing input. This is
**export denial**, not a claim that a CSV sanitizer or future exporter is complete.
Cross-tenant data, raw sensitive fields and formula-bearing cells cannot be
exported through this selected scope because no export is produced.

## Verification contract

- `src/reports/reports.service.spec.ts` and
  `src/eokul-sync/eokul-sync.service.spec.ts`: services compile without repository
  providers and deny all tested entry points before persistence/adapter access.
- Existing `test/database/datasource.spec.ts`: genuine Nest AppModule + PostgreSQL,
  health 200, quarantine providers absent, GET/POST report/export/sync paths 404.
  No SQL business-outcome seed; no acceptance-guard exemption or weakening.
- `npm ci`, `npm run lint`, `npm run build`, focused Jest, full Jest and
  `npm run test:e2e:guard`. PostgreSQL tests skipped locally are not PASS evidence;
  exact-head DB Smoke and public-API test execution are required before readiness.
- No migration changed. Existing fresh/upgrade migration gates remain required;
  the test reads the migrated database and boots without querying quarantine tables.

## Verdict and rollback

Product selected quarantine; implementation is bounded to that decision.
Data/Backend/QA/Security-KVKK terminal independent verdicts remain pending until
review and exact-head PostgreSQL/API CI evidence are attached to the Draft PR.
No role verdict is inferred from passing unit mocks. #368 owner decision remains
pending; no thread resolution or merge is authorized here.

Rollback is a revert of this slice; the existing default-OFF runtime gates still
apply. Restoring hidden success behavior is not release activation authorization.
