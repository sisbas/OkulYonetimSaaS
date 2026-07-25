export const TEACHER_BRANCH_PREFLIGHT_REASONS = [
  'TB_UNMAPPED_TEACHER',
  'TB_AMBIGUOUS_BRANCH',
  'TB_CROSS_TENANT_BRANCH',
  'TB_INACTIVE_BRANCH',
  'TB_DUPLICATE_SOURCE',
  'TB_EFFECTIVE_RANGE_INVALID',
  'TB_EFFECTIVE_RANGE_OVERLAP',
] as const;

export type TeacherBranchPreflightReason =
  (typeof TEACHER_BRANCH_PREFLIGHT_REASONS)[number];

export interface TeacherBranchSourceRow {
  sourceId: string;
  tenantId: string;
  teacherId: string | null;
  candidateBranchIds: readonly string[];
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface TeacherReference {
  teacherId: string;
  tenantId: string;
}

export interface BranchReference {
  branchId: string;
  tenantId: string;
  status: 'active' | 'inactive';
}

export interface ExistingTeacherBranchRange {
  teacherBranchId: string;
  tenantId: string;
  teacherId: string;
  branchId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface TeacherBranchPreflightInput {
  sourceRows: readonly TeacherBranchSourceRow[];
  teachers: readonly TeacherReference[];
  branches: readonly BranchReference[];
  existingRanges: readonly ExistingTeacherBranchRange[];
}

export interface TeacherBranchPreflightFinding {
  sourceId: string;
  teacherId: string | null;
  branchId: string | null;
  reasonCode: TeacherBranchPreflightReason;
}

export interface TeacherBranchPreflightReport {
  scanVersion: 'TB_PREFLIGHT_V1';
  status: 'PASS' | 'HOLD';
  sourceCount: number;
  eligibleCount: number;
  findingCount: number;
  partialWriteCount: 0;
  countsByReason: Record<TeacherBranchPreflightReason, number>;
  findings: readonly TeacherBranchPreflightFinding[];
}

const FAR_FUTURE = '9999-12-31';

function overlaps(
  leftFrom: string,
  leftTo: string | null,
  rightFrom: string,
  rightTo: string | null,
): boolean {
  return leftFrom <= (rightTo ?? FAR_FUTURE) && rightFrom <= (leftTo ?? FAR_FUTURE);
}

function emptyCounts(): Record<TeacherBranchPreflightReason, number> {
  return Object.fromEntries(
    TEACHER_BRANCH_PREFLIGHT_REASONS.map((reason) => [reason, 0]),
  ) as Record<TeacherBranchPreflightReason, number>;
}

/**
 * Pure, read-only preflight. It performs no persistence, reconciliation write,
 * default-branch selection, deletion, merge or row mutation.
 */
export function scanTeacherBranchPreflight(
  input: TeacherBranchPreflightInput,
): TeacherBranchPreflightReport {
  const teacherById = new Map(input.teachers.map((teacher) => [teacher.teacherId, teacher]));
  const branchById = new Map(input.branches.map((branch) => [branch.branchId, branch]));
  const sourceKeyCounts = new Map<string, number>();

  for (const row of input.sourceRows) {
    const key = [
      row.tenantId,
      row.teacherId ?? 'null',
      [...row.candidateBranchIds].sort().join(','),
      row.effectiveFrom,
      row.effectiveTo ?? 'null',
    ].join('|');
    sourceKeyCounts.set(key, (sourceKeyCounts.get(key) ?? 0) + 1);
  }

  const findings: TeacherBranchPreflightFinding[] = [];
  let eligibleCount = 0;

  const add = (
    row: TeacherBranchSourceRow,
    reasonCode: TeacherBranchPreflightReason,
    branchId: string | null = null,
  ): void => {
    findings.push({
      sourceId: row.sourceId,
      teacherId: row.teacherId,
      branchId,
      reasonCode,
    });
  };

  for (const row of input.sourceRows) {
    const rowFindingStart = findings.length;
    const teacher = row.teacherId ? teacherById.get(row.teacherId) : undefined;

    if (!teacher || teacher.tenantId !== row.tenantId) {
      add(row, 'TB_UNMAPPED_TEACHER');
    }

    if (row.candidateBranchIds.length !== 1) {
      add(row, 'TB_AMBIGUOUS_BRANCH');
    }

    const candidateBranchId =
      row.candidateBranchIds.length === 1 ? row.candidateBranchIds[0] : null;
    const branch = candidateBranchId ? branchById.get(candidateBranchId) : undefined;

    if (candidateBranchId && (!branch || branch.tenantId !== row.tenantId)) {
      add(row, 'TB_CROSS_TENANT_BRANCH', candidateBranchId);
    } else if (branch?.status === 'inactive') {
      add(row, 'TB_INACTIVE_BRANCH', candidateBranchId);
    }

    if (row.effectiveTo !== null && row.effectiveFrom > row.effectiveTo) {
      add(row, 'TB_EFFECTIVE_RANGE_INVALID', candidateBranchId);
    }

    const sourceKey = [
      row.tenantId,
      row.teacherId ?? 'null',
      [...row.candidateBranchIds].sort().join(','),
      row.effectiveFrom,
      row.effectiveTo ?? 'null',
    ].join('|');
    if ((sourceKeyCounts.get(sourceKey) ?? 0) > 1) {
      add(row, 'TB_DUPLICATE_SOURCE', candidateBranchId);
    }

    if (row.teacherId && candidateBranchId) {
      const hasOverlap = input.existingRanges.some(
        (range) =>
          range.tenantId === row.tenantId &&
          range.teacherId === row.teacherId &&
          range.branchId === candidateBranchId &&
          overlaps(
            row.effectiveFrom,
            row.effectiveTo,
            range.effectiveFrom,
            range.effectiveTo,
          ),
      );
      if (hasOverlap) {
        add(row, 'TB_EFFECTIVE_RANGE_OVERLAP', candidateBranchId);
      }
    }

    if (findings.length === rowFindingStart) {
      eligibleCount += 1;
    }
  }

  const countsByReason = emptyCounts();
  for (const finding of findings) {
    countsByReason[finding.reasonCode] += 1;
  }

  return {
    scanVersion: 'TB_PREFLIGHT_V1',
    status: findings.length === 0 ? 'PASS' : 'HOLD',
    sourceCount: input.sourceRows.length,
    eligibleCount,
    findingCount: findings.length,
    partialWriteCount: 0,
    countsByReason,
    findings,
  };
}
