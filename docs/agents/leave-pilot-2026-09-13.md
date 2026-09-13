# Real leave pilot — 2026-09-13 evidence record

Correlation: `P1B-LEAVE-20260913-01`. Full pilot and merge: **HOLD**.
Checked 2026-09-13 UTC. Baseline main: `bf8a7a34d52465f2f2d5b4aef17ba31dd31083da`.
Scope owners: #263 (M4/5), #259 identity safety; umbrella #257. Solver #262 (M3/4) is a separate change.

## Current source and GATE 3.0

Labels below assess the full required dependency, not mere file existence. Sources were accessible; unexecuted acceptance is explicitly distinguished from missing implementation.

| Dependency | Status | Current-main evidence | Smallest work package / exit condition |
| --- | --- | --- | --- |
| User–teacher identity | CONFLICTING | `TeacherIdentityService` resolves effective branch; `LeaveService.safeActorTeacherId` treats every ForbiddenException as non-teacher. Missing or ambiguous identity can become an exemption. | This foundation: verify active user/member, distinguish true absence from failure without branch selection; negative tests. Decision-time transaction revalidation remains. |
| Published program | CONFLICTING | ScheduleEvent/version/effective dates exist; `ScheduleService` publisher port performs separate repository updates without a real transaction. | Schedule publish atomicity and common publication/decision locking, followed by two-connection stale-publication test. |
| Candidate suitability | CONFLICTING | TeacherCourse source and teacher-row mutation lock exist; conflict queries restrict to leave branch; candidate catch swallows every error. Work-calendar authority not proven. | This foundation: typed ineligibility and tenant-wide conflict predicates. Exit for full dependency: actual work-calendar, double-substitute and schedule-publication concurrency acceptance. |
| Transaction integrity | CONFLICTING | Existing LeaveRepository writes decision/audit/outbox atomically; DailyOperations writes assignment/coverage/projection/audit/outbox synchronously. Approval path remains blocked and no atomic captured approval impact exists. | Single decision transaction with captured occurrence/version evidence; injected audit/outbox failures and replay acceptance. No consumer delivery proof was found. |
| Authorization | CONFLICTING | Leave/DailyOperations routes use TenantScopeGuard and Permissions; RequestContext has no server-authoritative branch scope. Existing #339 owns this gap. | #339 server context/default-deny, own-scope and cross-branch/tenant HTTP negatives. |
| Runtime UI | CONFLICTING | #338 is OPEN/DRAFT at `919c609828b866fbd3109a197d2ac547fc975a8d`, based on current main. Its browser claims use intercepted responses; actual P0 browser check fails. | Preserve #338; real request → pending impact → decision → daily screen journey with PostgreSQL and refresh/new session. |

## Architecture and ownership

Three independent architecture assessments: A CONCERN, B direction APPROVE/pilot HOLD, C BLOCK for this pilot. This is the built-in subagent mechanism, not Hermes/HCO receipt evidence.

- A CRUD-first monolith reduces initial ceremony, but satisfying atomicity/concurrency requirements converges toward B.
- B small state machine + transactions + audit/outbox inside existing NestJS/PostgreSQL monolith is retained. Frontend B+ remains the target boundary; existing runtime uses static JS, so no Vite rewrite is introduced.
- C separate workflow service adds deployment and distributed consistency dependencies without measured organizational or scaling need.

Existing runtime **synchronous projection inside the mutation transaction** remains the sole P0 projection writer. Outbox persistence exists; the older architecture note calling outbox deferred is stale. No relay/consumer is claimed, and no broker or second writer is added.

Decision and coverage remain separate. Approved/unresolved is permitted by the product contract. Pending impact must be read-only and must distinguish unavailable/stale/error from verified zero. Current approved-only impact endpoint is not yet that review API. Approval remains fail-closed. Initial persisted NOT_REQUIRED still needs reconciliation before the review/approval slice; it is not proof of zero lessons.

## Bounded diff and checks

- TeacherDirectory verifies active user and tenant membership before returning teacher ID or explicit null. Historical teacher affiliations remain conservative self-decision evidence; ambiguous records fail closed.
- Decision affiliation no longer depends on resolving one active branch or catching ForbiddenException as absence.
- Candidate filter omits only typed controlled eligibility failures. Storage/dependency/unknown errors propagate, including after a partial list was collected.
- Published schedule and substitute conflict queries inspect all branches within the same tenant. Suitability/membership still requires the target branch.
- No migration, approval enablement, frontend, notification or production mutation.

Node 22.23.2: lint and build passed. Local combined focused unit/contract/RBAC/KVKK/solver run: 26 suites / 207 tests passed. Solver accounts for 12 tests and is delivered separately. The new PostgreSQL tests were **not** part of that local count.

Local PostgreSQL setup was unavailable: no server/binaries; apt update failed with setgroups/setuid permission errors. No permission or sandbox weakening was attempted. PostgreSQL checks must run in existing CI, with exact-head links recorded in PR comments. No local DB PASS claim.

New `test/database/leave-safety-queries.spec.ts` exercises real SQL against isolated temporary reference tables in CI. It does not validate all migrations or the public UI journey; it creates no approved leave, substitution, audit or projection business outcome. TeacherCourse readiness is mocked only in the query-focused candidate scenario. Migration verification remains the existing DB Smoke gate.

Independent SECURITY/DATA review: bounded code APPROVE, no new critical/high finding. Medium evidence concern: the new cross-branch schedule-busy query test does not prove the substitute-assignment-busy case because the assignment table remains empty. This remains an explicit acceptance gap; do not claim double-substitute concurrency passed. Final-head re-affirmation and CI are recorded externally after commit.

## Existing PR and governance boundary

#338 is not used as a backend base: its five changed frontend files are independent; the safety patch starts from main and leaves that work intact. It remains the future UI integration dependency.

#338 P0 browser failure: run 34082199418/job 101619492535, `qa-p0-browser-e2e.js:709`, Node is either not clickable or not an Element. This is a browser-runner failure, not proof of API/DB completion or absence. Basic DB Smoke/Backend CI checks on its head pass.

Governance #336 remains open. The active ruleset requires ten status checks, zero formal approvals, resolved threads; strict-up-to-date is false. Repository auto-merge and auto-update are false. These settings were read, not changed or bypassed. No merge/deployment is authorized by a green subset of checks.

## Remaining blockers and next trigger

1. P0 #339: authoritative branch/role context; owner Backend/Security. Exit: context + BOLA/RBAC HTTP negatives.
2. P0 #263 + Schedule: pending review, verified zero, captured publication versions, atomic publish/decision locking. Exit: pending read has no writes; stale review cannot commit; actual approve→open/covered projection journey.
3. P1 #263: actual substitute-assignment conflict/concurrency, work-calendar source, idempotent create and decision retry, audit/outbox rollback and replay acceptance.
4. P1 #269/#264: genuine PostgreSQL/browser user journey, readable names, all error/loading/stale states and refresh persistence. Existing #338 must be reused.
5. Release blockers #336/#332: governance RCA and production-equivalent environment evidence; no production probe in this foundation.

Next autonomous trigger: inspect the new draft PR exact-head DB/CI outcomes, repair valid failures, then close #339 and Schedule transaction prerequisites before enabling pending-review/approval runtime. Rollback: revert the isolated foundation commit; no DB data migration or deployment rollback is required for this unpublished diff.

Skill reuse: existing leave/Phase1b skills were read. No unverified knowledge was written into skills and no new skill was created.
