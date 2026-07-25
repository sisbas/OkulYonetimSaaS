# WP-07 Governance Recovery

## Scope

This record joins incident #109, superseded PR #115, incident #136 and recovery issue #140 into one governance-only resolution. No runtime, migration, database or frontend file is part of the recovery branch.

## PR #133 merge-time timeline

- Current-head independent approval: 2026-07-24 07:46:28 UTC.
- PR merged: 2026-07-24 07:52:36 UTC.
- Codex review and new unresolved thread created: 2026-07-24 07:52:37 UTC.
- Main Governance Audit started reading repository state: 2026-07-24 07:52:45 UTC.
- The PR Governance run protecting merge contained successful Body Validation, Issue Reference, Rollback Plan, Acceptance Criteria and Merge Governance Enforcement jobs.

## #136 root cause

The original main audit used current post-merge state instead of a merge-time snapshot:

1. It counted every currently unresolved thread, including a thread created one second after merge.
2. It requested `filter: latest` check runs after merge. The post-merge review event started a newer PR Governance run whose jobs were queued or in progress, shadowing the successful checks that protected the merge.
3. PR Governance used `cancel-in-progress: true`, allowing later review/body events to cancel earlier workflow runs and make aggregate evidence ambiguous.

Therefore #136 is an audit race/false-positive, not proof that PR #133 bypassed approval or merge checks.

## Recovery design

- Remove workflow-level cancellation from PR Governance.
- Preserve exact required check names and fail-closed missing, pending, cancelled and failed handling.
- Bind Main Governance Audit to `merged_at`:
  - approvals must be submitted at or before merge;
  - post-merge-created review threads are excluded;
  - Checks API is queried with `filter: all` so historical runs are visible;
  - the newest exact check context whose `started_at <= merged_at` is selected;
  - that exact run must have `status=completed`, `completed_at <= merged_at` and `conclusion=success`;
  - the audit cannot fall back to an older successful run when a newer pre-merge run was pending, cancelled, failed or completed after merge.
- Verify active `main-merge-governance` ruleset source, strict required checks, latest-push approval, independent approval count and thread-resolution requirement.

## PR #115 decision

PR #115 is superseded by the `wp07/governance-recovery` branch because it predates #136, does not repair the post-merge audit race and does not contain the complete disposable matrix evidence. Its useful concurrency and source-binding changes are carried forward here.

## Merge decision

The recovery PR remains blocked until:

- all required checks succeed on its current head;
- an independent current-head approval exists;
- unresolved review-thread count is zero;
- disposable merge attempts prove missing, pending, cancelled, failed, approval-missing and unresolved-thread states are blocked;
- an all-success protected merge is accepted by the ruleset;
- Repository Admin, DevOps and QA closure comments are recorded on #140.
