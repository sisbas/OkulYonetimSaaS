import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  LEAVE_APPROVAL_CANDIDATE_FIELDS,
  LEAVE_APPROVAL_FORBIDDEN_FIELD_FRAGMENTS,
  LEAVE_APPROVAL_LESSON_FIELDS,
  LEAVE_APPROVAL_RAW_IDENTIFIER_FIELD_PATTERN,
  LEAVE_APPROVAL_RESPONSE_FIELDS,
  LEAVE_ZERO_IMPACT_CODES,
} from '../../src/daily-operations/leave-approval-impact';
import { parseLeaveExpectedVersion } from '../../src/daily-operations/leave-impact.types';
import { LEAVE_DECISION_RESPONSE_FIELDS } from '../../src/leaves/leave-decision-labels';

const leavesDir = join(process.cwd(), 'src', 'leaves');
const dailyOperationsDir = join(process.cwd(), 'src', 'daily-operations');

function directorySource(directory: string): string {
  return readdirSync(directory)
    .filter((file) => file.endsWith('.ts'))
    .map((file) => readFileSync(join(directory, file), 'utf8'))
    .join('\n');
}

describe('R1 leave decision impact contract (#263)', () => {
  it('removes the unconditional impact quarantine from the leaves module', () => {
    const source = directorySource(leavesDir);
    expect(source).not.toContain('IMPACT_ANALYSIS_NOT_READY');
    expect(source).not.toContain('LeaveImpactAnalysisNotReadyException');
    // Karantina kalkarken zayıflatılan değil, güçlenen bir kapı bırakılır.
    expect(source).toContain('Deny-safe kapı');
  });

  it('runs decision, impact, projections, audit and outbox in one transaction', () => {
    const repository = readFileSync(join(leavesDir, 'leave.repository.ts'), 'utf8');
    const dailyOperations = readFileSync(
      join(dailyOperationsDir, 'daily-operations.repository.ts'),
      'utf8',
    );
    expect(repository).toContain('this.dataSource.transaction');
    expect(repository).toContain('await this.impact.prepareApprovalImpact(manager, ctx, existing)');
    expect(repository).toContain('await this.audit.write(manager');
    expect(repository).toContain('await this.insertOutbox(manager, eventName, saved, impact)');
    expect(repository).toContain("lock: { mode: 'pessimistic_write' }");

    // Etki motoru KENDİ transaction'ını açmaz: manager çağırandan gelir, böylece
    // karar + projeksiyon + audit + outbox tek commit/rollback sınırındadır.
    const engine = dailyOperations.slice(
      dailyOperations.indexOf('async prepareApprovalImpact'),
      dailyOperations.indexOf('private async approvalCandidates'),
    );
    expect(engine.length).toBeGreaterThan(0);
    expect(engine).not.toContain('dataSource.transaction');
    expect(engine).toContain('await this.project(manager, leave, events, [])');
  });

  it('states a zero-impact outcome explicitly instead of returning a silent empty result', () => {
    expect(LEAVE_ZERO_IMPACT_CODES).toEqual(['NO_PUBLISHED_SCHEDULE_EVENT', 'NO_OVERLAPPING_OCCURRENCE']);
    const dailyOperations = readFileSync(
      join(dailyOperationsDir, 'daily-operations.repository.ts'),
      'utf8',
    );
    expect(dailyOperations).toContain('zeroImpact: lessons.length === 0');
    expect(dailyOperations).toContain('zeroImpactDetailFor(zeroImpactReason)');
    expect(dailyOperations).toContain("return publishedEventCount === 0 ? 'NO_PUBLISHED_SCHEDULE_EVENT'");
  });

  it('keeps the If-Match version contract on the decision surface', () => {
    expect(() => parseLeaveExpectedVersion(undefined, 'leave-1')).toThrow('LEAVE_VERSION_REQUIRED');
    expect(() => parseLeaveExpectedVersion('"leave:other:v2"', 'leave-1')).toThrow(
      'LEAVE_VERSION_MISMATCH',
    );
    expect(parseLeaveExpectedVersion('"leave:leave-1:v2"', 'leave-1')).toBe(2);
  });

  it('exposes readable labels and no raw identifier fields on the decision surface', () => {
    const fields = [
      ...LEAVE_DECISION_RESPONSE_FIELDS, ...LEAVE_APPROVAL_RESPONSE_FIELDS,
      ...LEAVE_APPROVAL_LESSON_FIELDS, ...LEAVE_APPROVAL_CANDIDATE_FIELDS,
    ];
    for (const field of fields) {
      expect(LEAVE_APPROVAL_RAW_IDENTIFIER_FIELD_PATTERN.test(field)).toBe(false);
      for (const fragment of LEAVE_APPROVAL_FORBIDDEN_FIELD_FRAGMENTS) {
        expect(field.toLowerCase()).not.toContain(fragment.toLowerCase());
      }
    }
    // Tek istisna: If-Match sözleşmesi için sunucu üretimi opak sürüm jetonu.
    expect(LEAVE_DECISION_RESPONSE_FIELDS).toContain('etag');
    expect(LEAVE_DECISION_RESPONSE_FIELDS).toContain('impactDetail');
  });

  it('keeps resolved names out of audit metadata and outbox payloads', () => {
    const repository = readFileSync(join(leavesDir, 'leave.repository.ts'), 'utf8');
    expect(repository).not.toContain('teacherLabel');
    expect(repository).not.toContain('full_name');
    expect(repository).toContain('changedFields: impact');
  });
});
