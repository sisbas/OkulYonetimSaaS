# N0 HCO checkpoint and evidence

- Main/base snapshot: `4af681e6fb2bc8bca53717cfab3fe93d0c4c1902` (live fetched 2026-10-04).
- Branch: `task/n0-266-quarantine`; isolated worktree; user/WIP tree preserved.
- Program: P1B-FINAL; slice N0; primary #266 / M6; related #259 #269 #345.
- Mode: MERGE_READY_ONLY; AUTO_MERGE OFF; PILOT_READY NO; Phase 2 expansion OFF.
- HCO: PLAN_CONSULTATION complete (owner design); IMPLEMENTING complete;
  TESTING local complete / PostgreSQL awaiting CI; REVIEWING awaiting independent review;
  MERGE_ELIGIBILITY pending. No background execution or merge claimed.
- Contract/rollback: `docs/notifications/n0-quarantine-contract.md`.

## Executed local evidence (implementation tree)

1. `npm ci --ignore-scripts`: exit 0, existing lockfile unchanged.
2. Behavioral RED on original main source:
   `npx jest --runInBand src/notifications/legacy-send-quarantine.spec.ts`:
   compiled and executed, 5 failures. Approved input resolved `sent`; draft and
   blocked input resolved instead of denial; malformed input disclosed its getter
   error. This is behavioral RED, not a compile failure.
3. Same test GREEN after quarantine; combined command
   `npx jest --runInBand src/notifications test/kvkk`: 12 suites / 58 tests PASS.
4. `npm run lint`: exit 0; `npm run build`: exit 0.
5. `npx jest --runInBand src test/rbac test/kvkk test/database test/contracts`:
   109 suites / 989 tests passed; 10 suites / 81 tests SKIPPED (PostgreSQL absent).
   The real N0 PostgreSQL cases were not executed locally; pre-storage negatives
   executed. These skips are not PostgreSQL PASS.
6. `npm run test:e2e:guard`: 11 tests PASS, including exact-file/stale exemption checks.

## Live policy snapshot

Main ruleset 19052349: deletion/force-push protection; approving review count 0;
stale approvals dismissed; resolved threads required. Required contexts:
Sprint 1 Quality Gate; Backend CI; DB Smoke; Gate 1 CI; Sensitive Pattern Scanner;
GitGuardian scan; PR Governance / Body Validation; PR Governance / Issue Reference;
PR Governance / Rollback Plan; PR Governance / Acceptance Criteria.
Independent review remains mandatory regardless of human approval count.
#368 scoped exception covers PR365 only; no N0 waiver inferred. Any actionable
thread subject to conflicting policy requires scoped owner decision before resolution.

## Current-head delivery

PR/current-head CI URLs, independent review and finding dispositions will be
published in the PR evidence comment after execution. This snapshot is not a
replacement for live source/GitHub state. #266 remains open. No schema or historical
data mutation; rollback risks are documented in the contract.
