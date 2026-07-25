# Schedule Minimum Publish Source

Status: Draft implementation for #142. Ready/merge remains blocked until #140 and reference readiness close.

Decision for PR #114: port and supersede. The contract-only draft is not merged as a separate source. Its verified rules are carried into this runtime slice as `M3_CONTRACT_V1 / 1.0.0`.

## Included

- Schedule, ScheduleVersion and ScheduleEvent minimum persistence.
- Canonical reason code catalog in repository source.
- FULL validation as the only publish evidence.
- INCREMENTAL validation as editor feedback only.
- Immutable published snapshot with TimeSlot historical values.
- Published read filter by tenant, branch, teacher, date range and published version.
- Publish/unpublish plus audit through the same transaction port.

## Excluded

- Solver or automatic program generation.
- Soft constraint optimization.
- Drag-drop frontend.
- Leave mutation.
- Daily Operations write.
- Demo reason-code behavior as source of truth.

## Publish blockers

FULL validation must keep these states separate:

| State | Reason |
| --- | --- |
| Empty draft | `SCHEDULE_EMPTY` |
| Stale validation | `SCHEDULE_VALIDATION_STALE` |
| Hard conflict | `SCHEDULE_HARD_CONFLICTS_PRESENT` |
| Published period conflict | `PUBLISHED_SCHEDULE_PERIOD_CONFLICT` |
| Missing TeacherBranch | `TEACHER_BRANCH_ASSIGNMENT_MISSING` |

`teacher_branch_id` is non-null in code and migration. It is the assignment context and cannot be inferred during publish.

## Read port

Leave and Daily Operations may read only published snapshots through filters:

```text
tenantId
branchId
teacherId
from/to
publishedVersionId
```

No Leave write or Daily Operations write is introduced in this slice.

## Merge gate

This Draft PR is development evidence only until:

```text
#140 PASS
#141 / reference readiness PASS
PostgreSQL migration cycle PASS
contract tests PASS
independent approval PASS
governance SUCCESS
```
