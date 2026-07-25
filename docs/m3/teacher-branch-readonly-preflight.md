# TeacherBranch Read-only Preflight v1

## Authority and scope

- Parent readiness issue: #106
- Evidence issue: #112
- Scan contract: `TB_PREFLIGHT_V1`
- Purpose: production-like read-only scan and deterministic reconciliation evidence
- Out of scope: migration, backfill write, TeacherBranch CRUD, Schedule runtime and automatic remediation

## Security invariants

1. Scanner cannot write, delete, merge or mutate data.
2. Ambiguous records never receive a default branch.
3. Negative results are fail-closed and produce `partialWriteCount = 0`.
4. Output contains only opaque UUIDs, canonical reason codes and aggregate counts.
5. Names, surnames, e-mail addresses, phone numbers and raw row dumps are prohibited.
6. Reconciliation is a proposed count only; it is not a write plan and does not authorize migration.

## Fixture data dictionary

| Fixture | Trigger | Expected result |
| --- | --- | --- |
| `TB_UNMAPPED_TEACHER` | Teacher reference absent or tenant-mismatched | HOLD; no branch assignment |
| `TB_AMBIGUOUS_BRANCH` | Zero or more than one candidate branch | HOLD; `branchId = null`; no default |
| `TB_CROSS_TENANT_BRANCH` | Candidate branch belongs to another tenant or is unresolved | HOLD; opaque IDs only |
| `TB_INACTIVE_BRANCH` | Candidate branch is inactive | HOLD |
| `TB_DUPLICATE_SOURCE` | Exact normalized source row appears more than once | HOLD; no merge/dedupe write |
| `TB_EFFECTIVE_RANGE_INVALID` | `effectiveFrom > effectiveTo` | HOLD |
| `TB_EFFECTIVE_RANGE_OVERLAP` | Proposed range overlaps an existing same teacher/branch range | HOLD |
| Multi-branch happy path | One teacher has two explicit active same-tenant branch rows | PASS; two eligible rows |

Fixture identifiers are deterministic UUIDv4-shaped opaque values. No personal or operational display data is stored in fixtures.

## Scan-result schema

```ts
interface TeacherBranchPreflightReport {
  scanVersion: 'TB_PREFLIGHT_V1';
  status: 'PASS' | 'HOLD';
  sourceCount: number;
  eligibleCount: number;
  findingCount: number;
  partialWriteCount: 0;
  countsByReason: Record<TeacherBranchPreflightReason, number>;
  findings: Array<{
    sourceId: UUIDv4;
    teacherId: UUIDv4 | null;
    branchId: UUIDv4 | null;
    reasonCode: TeacherBranchPreflightReason;
  }>;
}
```

No source payload, row snapshot, display label or free-text diagnostic is returned.

## Reconciliation count contract

| Measure | Meaning | Write authorization |
| --- | --- | --- |
| `sourceCount` | Number of scanned source records | None |
| `eligibleCount` | Records with no finding | None |
| `findingCount` | Total findings; one row can have multiple reasons | None |
| `countsByReason` | Canonical aggregate by reason | None |
| `partialWriteCount` | Always `0` | Must remain zero |

Happy-path fixture expectation:

```text
sourceCount = 2
eligibleCount = 2
findingCount = 0
partialWriteCount = 0
status = PASS
```

Negative fixture expectation:

```text
all seven canonical reason codes have count > 0
partialWriteCount = 0
status = HOLD
```

## Zero-write evidence

The scanner is a pure function over immutable input arrays. It imports no database repository, `EntityManager` or `QueryRunner` and exposes no persistence adapter.

Static contract tests reject persistence/mutation tokens including:

```text
.save(
.insert(
.update(
.delete(
.remove(
.softRemove(
QueryRunner
EntityManager
Repository<
```

Tests also serialize the input before and after scanning and require byte-equivalent JSON, proving the fixture object was not mutated.

## KVKK and redaction control

Allowed report fields:

- opaque source UUID
- opaque teacher UUID or null
- opaque branch UUID or null
- canonical reason code
- integer counts
- fixed scan version and PASS/HOLD status

Prohibited fields:

- name, surname or display name
- e-mail or telephone
- staff number or external identity
- raw database row
- source payload
- free-text notes
- cross-tenant branch metadata beyond opaque identifiers

The contract test fails if the serialized result contains common PII field names, `@` or phone-like digit sequences.

## Issue #106 recommendation

```text
READ-ONLY PREFLIGHT CONTRACT: PASS
PRODUCTION DATA SCAN: NOT YET EVIDENCED
TEACHERBRANCH BACKFILL WRITE: HOLD
M2A REFERENCE READINESS: CONDITIONAL HOLD
```

Issue #106 may accept the scanner and fixture contract as a bounded pre-gate artifact. It must not grant migration/runtime GO until a production-like read-only run records:

- source and eligible counts,
- every finding count,
- `partialWriteCount = 0`,
- KVKK/redaction PASS,
- Data Model + Backend + QA/KVKK/Security sign-off.

## Decision

The scanner provides deterministic fail-closed reconciliation evidence without changing data. Any finding keeps the backfill write gate closed. No automatic branch selection, deduplication, merge or repair is permitted.
