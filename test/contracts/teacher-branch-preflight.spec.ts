import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  scanTeacherBranchPreflight,
  TEACHER_BRANCH_PREFLIGHT_REASONS,
  TeacherBranchPreflightInput,
} from '../../src/teachers/teacher-branch-preflight';
import {
  teacherBranchFixtureIds,
  teacherBranchHappyPathFixture,
  teacherBranchNegativeFixture,
} from '../fixtures/m3/teacher-branch-preflight.fixture';

describe('TeacherBranch read-only preflight', () => {
  it('accepts a teacher assigned to multiple active same-tenant branches', () => {
    const before = JSON.stringify(teacherBranchHappyPathFixture);
    const result = scanTeacherBranchPreflight(teacherBranchHappyPathFixture);

    expect(result.status).toBe('PASS');
    expect(result.sourceCount).toBe(2);
    expect(result.eligibleCount).toBe(2);
    expect(result.findingCount).toBe(0);
    expect(result.partialWriteCount).toBe(0);
    expect(JSON.stringify(teacherBranchHappyPathFixture)).toBe(before);
  });

  it('detects every canonical negative fixture and performs zero partial writes', () => {
    const before = JSON.stringify(teacherBranchNegativeFixture);
    const result = scanTeacherBranchPreflight(teacherBranchNegativeFixture);

    expect(result.status).toBe('HOLD');
    expect(result.partialWriteCount).toBe(0);
    expect(JSON.stringify(teacherBranchNegativeFixture)).toBe(before);

    for (const reason of TEACHER_BRANCH_PREFLIGHT_REASONS) {
      expect(result.countsByReason[reason]).toBeGreaterThan(0);
    }
  });

  it('never chooses a default branch for ambiguous input', () => {
    const result = scanTeacherBranchPreflight(teacherBranchNegativeFixture);
    const ambiguous = result.findings.find(
      (finding) => finding.reasonCode === 'TB_AMBIGUOUS_BRANCH',
    );

    expect(ambiguous).toBeDefined();
    expect(ambiguous?.branchId).toBeNull();
  });

  it('detects overlapping non-identical source rows without duplicate pair findings', () => {
    const input: TeacherBranchPreflightInput = {
      teachers: [
        {
          teacherId: teacherBranchFixtureIds.teacherA,
          tenantId: teacherBranchFixtureIds.tenantA,
        },
      ],
      branches: [
        {
          branchId: teacherBranchFixtureIds.branchA,
          tenantId: teacherBranchFixtureIds.tenantA,
          status: 'active',
        },
      ],
      existingRanges: [],
      sourceRows: [
        {
          sourceId: '32000000-0000-4000-8000-000000000001',
          tenantId: teacherBranchFixtureIds.tenantA,
          teacherId: teacherBranchFixtureIds.teacherA,
          candidateBranchIds: [teacherBranchFixtureIds.branchA],
          effectiveFrom: '2026-09-01',
          effectiveTo: '2026-12-31',
        },
        {
          sourceId: '32000000-0000-4000-8000-000000000002',
          tenantId: teacherBranchFixtureIds.tenantA,
          teacherId: teacherBranchFixtureIds.teacherA,
          candidateBranchIds: [teacherBranchFixtureIds.branchA],
          effectiveFrom: '2026-12-01',
          effectiveTo: null,
        },
      ],
    };

    const result = scanTeacherBranchPreflight(input);
    const overlapFindings = result.findings.filter(
      (finding) => finding.reasonCode === 'TB_EFFECTIVE_RANGE_OVERLAP',
    );

    expect(result.status).toBe('HOLD');
    expect(overlapFindings).toHaveLength(2);
    expect(new Set(overlapFindings.map((finding) => finding.sourceId)).size).toBe(2);
  });

  it('exposes only opaque IDs, reason codes and counts', () => {
    const serialized = JSON.stringify(
      scanTeacherBranchPreflight(teacherBranchNegativeFixture),
    );

    expect(serialized).not.toMatch(/name|surname|fullName|email|phone|rawRow/i);
    expect(serialized).not.toContain('@');
    expect(serialized).not.toMatch(/\+\d{8,}/);
  });

  it('has no persistence or mutation surface in the scanner implementation', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/teachers/teacher-branch-preflight.ts'),
      'utf8',
    );

    for (const forbidden of [
      '.save(',
      '.insert(',
      '.update(',
      '.delete(',
      '.remove(',
      '.softRemove(',
      'QueryRunner',
      'EntityManager',
      'Repository<',
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
