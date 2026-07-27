import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  CANONICAL_SCHEDULE_REASON_CODES,
  M3_SCHEDULE_CONTRACT_ID,
  M3_SCHEDULE_CONTRACT_VERSION,
} from '../../src/schedules/m3-schedule-contract';

const contractPath = join(process.cwd(), 'docs/m3/schedule-contract-v1.md');
const contract = readFileSync(contractPath, 'utf8');
const reasonCatalog = contract.match(
  /## 5\. Canonical reason-code catalog\s*([\s\S]*?)\n## 6\./,
)?.[1] ?? '';

const REQUIRED_REASON_CODES = [
  'TEACHER_TIME_OVERLAP',
  'STUDENT_GROUP_TIME_OVERLAP',
  'ROOM_TIME_OVERLAP',
  'TIMESLOT_INACTIVE',
  'TEACHER_INACTIVE',
  'STUDENT_GROUP_INACTIVE',
  'TEACHER_BRANCH_ASSIGNMENT_MISSING',
  'TEACHER_COURSE_MISMATCH',
  'TENANT_REFERENCE_MISMATCH',
  'BRANCH_REFERENCE_MISMATCH',
  'PUBLISHED_SCHEDULE_IMMUTABLE',
  'SCHEDULE_EMPTY',
  'SCHEDULE_VALIDATION_STALE',
  'SCHEDULE_HARD_CONFLICTS_PRESENT',
  'PUBLISHED_SCHEDULE_PERIOD_CONFLICT',
  'SCHEDULE_VERSION_MISMATCH',
  'SCHEDULE_VERSION_REQUIRED',
] as const;

const DISTINCT_PUBLISH_STATES = [
  'publish_blocked_empty',
  'publish_blocked_stale',
  'publish_blocked_conflicts',
  'publish_blocked_period',
] as const;

describe('M3 Schedule Contract v1 consistency', () => {
  it('pins the canonical contract identity and semantic version', () => {
    expect(contract).toContain('M3_CONTRACT_V1');
    expect(contract).toContain('1.0.0');
    expect(contract).toContain('Contract versioning and change control');
    expect(contract).toContain('pre-acceptance errata');
  });

  it.each(REQUIRED_REASON_CODES)('contains canonical catalog row for %s', (code) => {
    expect(reasonCatalog).toContain(`| \`${code}\` |`);
  });

  it('keeps publish-block reasons as distinct UI states', () => {
    for (const state of DISTINCT_PUBLISH_STATES) {
      expect(contract).toContain(`\`${state}\``);
    }
    expect(new Set(DISTINCT_PUBLISH_STATES).size).toBe(4);
  });

  it('forbids INCREMENTAL validation from becoming publish evidence', () => {
    expect(contract).toContain('incrementalIsPublishEvidence: false');
    expect(contract).toContain('Always `false`');
    expect(contract).toContain('canPublish: boolean; // always false for INCREMENTAL');
  });

  it('requires the TeacherBranch reference to be non-null', () => {
    expect(contract).toContain('teacherBranchId: UUIDv4;');
    expect(contract).toContain('teacher_branch_id NOT NULL');
  });

  it('pins the TimeSlot historical snapshot fields', () => {
    for (const field of [
      'dayOfWeek',
      'startTime',
      'endTime',
      'label',
      'orderIndex',
      'sourceTimeSlotUpdatedAt',
    ]) {
      expect(contract).toContain(field);
    }
  });

  it('requires active rooms to be validated in tenant and branch scope', () => {
    expect(contract).toContain('activeRoomIds: UUIDv4[];');
    expect(contract).toContain('including `activeRoomIds`, are additionally scoped to `branchId`');
    expect(contract).toContain("'activeRoomIds'");
  });

  it('keeps draft create outside If-Match and existing mutations inside it', () => {
    expect(contract).toContain('draftCreateRequiresIfMatch: false');
    expect(contract).toContain('existingMutationRequiresIfMatch: true');
    expect(contract).toContain('**no If-Match**');
    expect(contract).toContain('428 SCHEDULE_VERSION_REQUIRED');
    expect(contract).toContain('412 SCHEDULE_VERSION_MISMATCH');
  });

  it('defines management-only draft list and detail reads', () => {
    expect(contract).toContain('GET /api/v1/schedules/drafts');
    expect(contract).toContain('GET /api/v1/schedules/:scheduleId');
    expect(contract).toContain('| Draft list/detail read | management draft-read capability | Yes | Yes | **Hidden** | **Hidden** |');
    expect(contract).toContain('does not invent a new permission key');
  });

  it('pins canonical frontend states and marks earlier aliases superseded', () => {
    expect(contract).toContain("canonicalGridStates: ['weekly_grid_ready_draft', 'weekly_grid_ready_published']");
    expect(contract).toContain('blocked_full_validation_required');
    expect(contract).toContain('superseded');
  });

  it('keeps tenant and branch mismatches non-enumerating', () => {
    expect(contract).toContain('REFERENCE_NOT_FOUND');
    expect(contract).toContain('must not reveal whether the reference exists in another tenant or branch');
  });

  it('keeps Teacher and Viewer draft discovery hidden', () => {
    expect(contract).toContain('| Draft discovery | management permissions | Yes | Yes | **Hidden** | **Hidden** |');
    expect(contract).toContain('Teacher and Viewer cannot discover draft or unpublished schedules');
  });

  it('keeps runtime and migration code out of the contract freeze scope', () => {
    expect(contract).toContain('runtime controller/service/repository');
    expect(contract).toContain('migration');
    expect(contract).toContain('Runtime or migration code is prohibited in a contract-freeze PR');
  });
});

describe('M3 Schedule Contract v1 source of truth', () => {
  it('pins the contract identity and all canonical reason codes', () => {
    expect(M3_SCHEDULE_CONTRACT_ID).toBe('M3_CONTRACT_V1');
    expect(M3_SCHEDULE_CONTRACT_VERSION).toBe('1.0.0');
    expect(CANONICAL_SCHEDULE_REASON_CODES).toEqual(
      expect.arrayContaining([...REQUIRED_REASON_CODES]),
    );
    expect(new Set(CANONICAL_SCHEDULE_REASON_CODES).size).toBe(17);
  });
});
