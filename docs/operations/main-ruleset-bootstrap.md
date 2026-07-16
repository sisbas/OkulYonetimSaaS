# Main Ruleset Bootstrap

## Purpose

Activate and verify the `main-merge-governance` repository ruleset required by Issue #87 without weakening the existing fail-closed workflows.

Policy declaration:

```text
.github/rulesets/main-merge-governance.json
```

Administration and validation tool:

```text
scripts/main_ruleset.py
```

## Repository administrator preparation

Create a fine-grained GitHub access token restricted to this repository with repository Administration read/write permission. Store it only in the repository Actions secret named `REPO_ADMIN_TOKEN`.

Never place the credential value in repository files, workflow inputs, pull-request comments, issue comments, or logs.

## Apply through GitHub Actions

After the workflow exists on the default branch:

1. Open **Actions → Main Ruleset Admin → Run workflow**.
2. Select operation `apply`.
3. Run from `main`.
4. Record the successful run URL in Issue #87.
5. Run the workflow again with operation `verify`.
6. Record the verification run URL in Issue #87.

The operation is idempotent. It creates the named ruleset when absent and updates the same named ruleset when present. It fails unless the resulting ruleset is active and applies to `main`.

## Enforced controls

The declared ruleset has no bypass actors and applies to the default branch. It enforces:

- pull-request-only updates;
- one approving review;
- approval of the latest reviewable push by someone other than its author;
- stale approval dismissal after new commits;
- resolution of review conversations;
- deletion protection;
- force-push protection;
- strict branch freshness;
- the exact eleven required status checks listed in Issue #87.

## Exact required checks

```text
Sprint 1 Quality Gate
Backend CI
DB Smoke
Gate 1 CI
Sensitive Pattern Scanner
GitGuardian scan
PR Governance / Body Validation
PR Governance / Issue Reference
PR Governance / Rollback Plan
PR Governance / Acceptance Criteria
Merge Governance Enforcement
```

## Issue #87 closure evidence

Issue #87 remains open until all evidence below is attached:

- successful apply workflow run;
- successful verify workflow run;
- ruleset page showing enforcement `Active`;
- empty bypass actor list;
- exact required-check list;
- merge blocked without approval;
- merge blocked with an unresolved thread;
- merge blocked with a required-check failure;
- merge becomes eligible only after all checks, current approval, current branch, and resolved conversations.

## Incident closure order

After Issue #87 is verified:

```text
#90 → #92 → #94 → #89 → #66 → PO/QA final PASS → #86 reevaluation
```

The governance incidents are process-control incidents. Close them after recording root cause, impact, and the active preventive ruleset. Product-runtime rollback is not required unless an independent technical regression is found.
