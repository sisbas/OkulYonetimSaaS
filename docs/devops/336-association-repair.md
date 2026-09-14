# #336 — Exact merged PR association repair

Correlation: P1B-GOV-20260914-001
Baseline: 95869c4680f3a438f4d866cbccd241e4e43fdde5
Status: bounded repair proposal; release and full #336 closure HOLD.

## Evidence and root-cause boundary
The incident for bf8a7a34d52465f2f2d5b4aef17ba31dd31083da reported no associated merged PR.
GitHub now returns PR #335 as merged, with merge_commit_sha exactly equal to that commit and merged_at 2026-08-30T05:18:32Z.
The prior investigation recorded the audit about seven seconds after the merge. The original raw association response was not retained; eventual indexing delay is a hypothesis, not a demonstrated historical root cause.
Current absence of an association at one instant is insufficient to assert a direct push. Current thread state also cannot prove historical merge-time resolution.

Evidence:
- https://github.com/sisbas/OkulYonetimSaaS/pull/335
- https://github.com/sisbas/OkulYonetimSaaS/issues/336
- https://github.com/sisbas/OkulYonetimSaaS/actions/runs/33294405083

## Reproduction and repair
The existing audit samples associations once and picks the first merged main PR without checking its merge_commit_sha.
A delayed empty response causes false absence; an ancestor association can select the wrong PR.
The helper paginates associations and reads PR details, accepts only an exact merged SHA on main in this repository, and retries missing evidence at most three times (1, 3, 6 seconds).
Permanent absence remains an incident and job failure. Ambiguity and API errors throw and fail the job, never authorize a merge.
Full required-check and review processing remains unchanged after association selection.
The workflow checks out its exact push SHA with no persisted Git credentials to load the helper.

## Tests and acceptance boundary
Node built-in tests cover exact success, delayed association, permanent absence, ancestor mismatch, unmerged/wrong-base/foreign repository, malformed head/time, API failure, ambiguity, duplicate association, and malformed SHA.
The PR includes a Node 22 CI workflow requiring no npm dependencies.
Authoring environment was unavailable; no local Node, TypeScript, PostgreSQL or full product test PASS is claimed.
These are association regression tests. They do not prove missing/pending/failed required-check canaries, historical thread status, HCO receipts or complete #336 remediation.
Existing rulesets and required checks are unchanged. Strict branch freshness and full governance reconciliation remain separate obligations.

## Scope and rollback
Four implementation/test/workflow files plus this evidence note. No product code, auth secrets, database, ruleset or deployment mutations.
Rollback by reverting this bounded commit through the normal PR path; no DB rollback.
After eventual authorized merge, observe Main Governance Audit on the exact merged SHA and verify selected PR/head/check evidence. A green isolated test workflow does not authorize merge.

## Next dependencies
#339 context and branch authorization remains unimplemented in this delivery.
#332 still requires authorized environment-secret management and a fresh successful production login/API smoke.
No issue is closed by this PR.
