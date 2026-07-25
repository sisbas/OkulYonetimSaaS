import { TeacherBranchPreflightInput } from '../../../src/teachers/teacher-branch-preflight';

const tenantA = '00000000-0000-4000-8000-000000000001';
const tenantB = '00000000-0000-4000-8000-000000000002';
const teacherA = '10000000-0000-4000-8000-000000000001';
const teacherMulti = '10000000-0000-4000-8000-000000000002';
const branchA = '20000000-0000-4000-8000-000000000001';
const branchB = '20000000-0000-4000-8000-000000000002';
const branchOtherTenant = '20000000-0000-4000-8000-000000000003';
const branchInactive = '20000000-0000-4000-8000-000000000004';

const teachers = [
  { teacherId: teacherA, tenantId: tenantA },
  { teacherId: teacherMulti, tenantId: tenantA },
] as const;

const branches = [
  { branchId: branchA, tenantId: tenantA, status: 'active' as const },
  { branchId: branchB, tenantId: tenantA, status: 'active' as const },
  { branchId: branchOtherTenant, tenantId: tenantB, status: 'active' as const },
  { branchId: branchInactive, tenantId: tenantA, status: 'inactive' as const },
] as const;

export const teacherBranchHappyPathFixture: TeacherBranchPreflightInput = {
  teachers,
  branches,
  existingRanges: [],
  sourceRows: [
    {
      sourceId: '30000000-0000-4000-8000-000000000001',
      tenantId: tenantA,
      teacherId: teacherMulti,
      candidateBranchIds: [branchA],
      effectiveFrom: '2026-09-01',
      effectiveTo: null,
    },
    {
      sourceId: '30000000-0000-4000-8000-000000000002',
      tenantId: tenantA,
      teacherId: teacherMulti,
      candidateBranchIds: [branchB],
      effectiveFrom: '2026-09-01',
      effectiveTo: null,
    },
  ],
};

export const teacherBranchNegativeFixture: TeacherBranchPreflightInput = {
  teachers,
  branches,
  existingRanges: [
    {
      teacherBranchId: '40000000-0000-4000-8000-000000000001',
      tenantId: tenantA,
      teacherId: teacherA,
      branchId: branchA,
      effectiveFrom: '2026-01-01',
      effectiveTo: null,
    },
  ],
  sourceRows: [
    {
      sourceId: '31000000-0000-4000-8000-000000000001',
      tenantId: tenantA,
      teacherId: '10000000-0000-4000-8000-000000000099',
      candidateBranchIds: [branchA],
      effectiveFrom: '2026-09-01',
      effectiveTo: null,
    },
    {
      sourceId: '31000000-0000-4000-8000-000000000002',
      tenantId: tenantA,
      teacherId: teacherA,
      candidateBranchIds: [branchA, branchB],
      effectiveFrom: '2026-09-01',
      effectiveTo: null,
    },
    {
      sourceId: '31000000-0000-4000-8000-000000000003',
      tenantId: tenantA,
      teacherId: teacherA,
      candidateBranchIds: [branchOtherTenant],
      effectiveFrom: '2026-09-01',
      effectiveTo: null,
    },
    {
      sourceId: '31000000-0000-4000-8000-000000000004',
      tenantId: tenantA,
      teacherId: teacherA,
      candidateBranchIds: [branchInactive],
      effectiveFrom: '2026-09-01',
      effectiveTo: null,
    },
    {
      sourceId: '31000000-0000-4000-8000-000000000005',
      tenantId: tenantA,
      teacherId: teacherA,
      candidateBranchIds: [branchB],
      effectiveFrom: '2026-09-01',
      effectiveTo: null,
    },
    {
      sourceId: '31000000-0000-4000-8000-000000000006',
      tenantId: tenantA,
      teacherId: teacherA,
      candidateBranchIds: [branchB],
      effectiveFrom: '2026-09-01',
      effectiveTo: null,
    },
    {
      sourceId: '31000000-0000-4000-8000-000000000007',
      tenantId: tenantA,
      teacherId: teacherA,
      candidateBranchIds: [branchB],
      effectiveFrom: '2026-10-10',
      effectiveTo: '2026-10-01',
    },
    {
      sourceId: '31000000-0000-4000-8000-000000000008',
      tenantId: tenantA,
      teacherId: teacherA,
      candidateBranchIds: [branchA],
      effectiveFrom: '2026-09-01',
      effectiveTo: '2026-12-31',
    },
  ],
};

export const teacherBranchFixtureIds = {
  tenantA,
  tenantB,
  teacherA,
  teacherMulti,
  branchA,
  branchB,
  branchOtherTenant,
  branchInactive,
} as const;
