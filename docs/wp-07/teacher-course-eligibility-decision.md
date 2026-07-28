# TeacherCourse Eligibility Foundation — Architecture Decision

## Context

Issue #166 requires #144 substitute candidate filtering to use a tenant-safe TeacherCourse authority source instead of Schedule history, client payload or prior assignments.

## Architecture alternatives

| Option | Model | Strength | Weakness | Decision |
|---|---|---|---|---|
| A | Tenant-global `teacher_courses` eligibility + TeacherBranch intersection for branch membership | One eligibility source per teacher/course, avoids branch duplicate drift, keeps course expertise separate from operational branch assignment | #144 must intersect with active TeacherBranch before candidate display | **Selected** |
| B | Branch-scoped `teacher_courses` rows | Direct branch filtering | Duplicates course expertise for multi-branch teachers and makes branch transfers risky | Rejected |
| C | Infer eligibility from Schedule history or client candidate payload | No new table | Not an authority source; stale and client-influenced | Rejected |

## Branch-scope decision

TeacherCourse is **tenant scoped**, not branch scoped.

```text
TeacherCourse authority: tenant_id + teacher_id + course_id + effective period
Branch authority: TeacherBranch active membership
Candidate eligibility in #144: TeacherCourse ∩ TeacherBranch ∩ availability/conflict checks
```

## Security and KVKK rule

The read port returns only opaque identifiers, effective dates and controlled reason codes. It must not return teacher names, student data, guardian data, contact values, free text notes or raw reconciliation rows.

## Merge guard

#144 candidate Ready/Merge remains blocked until #166 has exact-head PostgreSQL/CI/scanner PASS and independent Architecture + QA/KVKK/Security approval.
