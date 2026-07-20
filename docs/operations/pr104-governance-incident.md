# PR #104 Merge Verification Gap — Incident Record

## Scope

Governance-only incident record for Issue #109. No runtime, frontend, API, database or migration behavior is changed by this document or its companion hotfix.

## Merge-time timeline (UTC)

| Time | Evidence |
| --- | --- |
| 2026-07-20 17:59:45 | PR #104 opened. |
| 2026-07-20 19:04:56 | Initial automated review submitted against commit `e514e43a72...`; two P2 threads opened. |
| 2026-07-20 19:20:34–19:20:44 | P2 fixes recorded in the review threads. |
| 2026-07-20 19:27:06 | Automated review submitted against final head `19bfdd9838a0630710848c1417849bf747623602`; one additional P2 thread opened. |
| 2026-07-20 19:59:13 | Independent reviewer `semihisbas-hub` approved the final head. |
| Before merge | All three review threads were resolved; technical CI and scanners were successful. |
| Before merge | Visible PR Governance runs for the final head were `29771561558`, `29771780077`, and `29771787219`; all had workflow conclusion `cancelled`. Run `29771780077` contained `Merge Governance Enforcement=completed/failure`; the other two exposed no terminal aggregate job evidence. |
| 2026-07-20 20:12:23 | PR #104 merged as `c34fe48679375bb059bb3b93e92fcf3c1448cc61`. |

## Exact-name verification

The declared ruleset required context is exactly:

```text
Merge Governance Enforcement
```

The PR Governance aggregate job name is exactly the same string. The hotfix adds a static contract check that requires exactly one matching aggregate job and fails if the name drifts.

## Root cause

The PR Governance workflow used a PR-wide concurrency group with:

```yaml
cancel-in-progress: true
```

Commit, body-edit, ready-for-review and review events for the same PR therefore cancelled one another. This allowed the final head to have ambiguous check-suite evidence: technical checks were terminal, while the aggregate governance workflow repeatedly ended as cancelled and no visible aggregate SUCCESS existed before merge.

The incident has two controls to repair:

1. Remove workflow-level cancellation so every governance-triggering event reaches a terminal result.
2. Verify that the live active `main` rules are sourced from the expected ruleset ID and contain the exact required-check list, not merely that a policy file declares those settings.

## Fail-closed contract

The aggregate job must classify all required checks as follows:

| State | Result |
| --- | --- |
| check absent | failure: missing required check |
| check queued/in progress | failure: pending required check after polling timeout |
| check cancelled, timed out, skipped, neutral or failed | failure: non-success required check |
| check completed/success | eligible to continue |

The ruleset independently requires the exact aggregate context. Missing, pending or non-success aggregate state must therefore keep merge blocked.

## Product impact

PR #104 changed only frontend descriptor/documentation files. Technical CI and scanners passed, the final head had independent approval, and all review threads were resolved. No runtime API, migration, tenant data, PII processing or permission enforcement was introduced.

## Decision

```text
PR #104: KEEP
GOVERNANCE LAYER: HOTFIX REQUIRED
REVERT: NOT REQUIRED
```

## Closure evidence required

- Hotfix PR is a real Draft and changes governance files only.
- `Ruleset Payload Validation` proves exact aggregate name and no `cancel-in-progress: true`.
- `Live Main Ruleset Verification` proves exact required checks and ruleset source binding.
- Disposable PR evidence records missing, pending and cancelled aggregate states as merge-blocking.
- Final current-head independent approval, zero unresolved threads and all required checks SUCCESS.
- Repository Admin, DevOps and QA closure note is added to Issue #109 before closure.
