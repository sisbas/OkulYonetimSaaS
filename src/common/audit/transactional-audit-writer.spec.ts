import { EntityManager } from 'typeorm';

import { AuditLogRepository } from './audit-log.repository';
import { FORBIDDEN_AUDIT_METADATA_KEYS, validateTransactionalAuditMetadata } from './audit-metadata-policy';
import { AuditMetadataByEvent } from './transactional-audit.types';
import { TypeOrmTransactionalAuditWriter } from './transactional-audit-writer';

const TENANT_ID = '10000000-0000-4000-8000-000000000100';
const ENTITY_ID = '20000000-0000-4000-8000-000000000100';

type ForbiddenMetadataKey =
  | 'requestBody'
  | 'responseBody'
  | 'authorization'
  | 'cookie'
  | 'credential'
  | 'token'
  | 'studentName'
  | 'parentPhone'
  | 'guardianContact'
  | 'notificationPayload'
  | 'guidanceNote';

type AssertNever<T extends never> = T;
type _ForbiddenKeysCannotEnterMetadata = AssertNever<
  Extract<keyof AuditMetadataByEvent['course.created'], ForbiddenMetadataKey>
>;

function courseMetadata(): AuditMetadataByEvent['course.created'] {
  return {
    schemaVersion: 1,
    tenantId: TENANT_ID,
    actorUserId: null,
    actorSessionId: null,
    requestId: 'audit-writer-unit-test',
    entityType: 'course',
    entityId: ENTITY_ID,
    result: 'success',
    changedFields: ['status', 'name'],
  };
}

function leaveMetadata(): AuditMetadataByEvent['leave.approved.v1'] {
  return {
    schemaVersion: 1,
    tenantId: TENANT_ID,
    actorUserId: '30000000-0000-4000-8000-000000000100',
    actorSessionId: null,
    requestId: 'leave-audit-policy-test',
    entityType: 'leave_request',
    entityId: ENTITY_ID,
    result: 'success',
    changedFields: ['version', 'coverageStatus', 'status'],
  };
}

describe('TypeOrmTransactionalAuditWriter', () => {
  it('uses the supplied manager and waits for the repository insert', async () => {
    let releaseInsert: (() => void) | undefined;
    const insert = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseInsert = resolve;
        }),
    );
    const repository = { insert } as unknown as AuditLogRepository;
    const writer = new TypeOrmTransactionalAuditWriter(repository);
    const manager = {} as EntityManager;

    let settled = false;
    const writePromise = writer.write(manager, 'course.created', courseMetadata()).then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(insert).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        action: 'course.created',
        tenantId: TENANT_ID,
        entityId: ENTITY_ID,
        metadataJson: {
          schemaVersion: 1,
          result: 'success',
          changedFields: ['name', 'status'],
        },
      }),
    );
    expect(settled).toBe(false);

    releaseInsert?.();
    await writePromise;
    expect(settled).toBe(true);
  });

  it('does not swallow repository failures', async () => {
    const failure = new Error('audit insert failed');
    const repository = {
      insert: jest.fn().mockRejectedValue(failure),
    } as unknown as AuditLogRepository;
    const writer = new TypeOrmTransactionalAuditWriter(repository);

    await expect(writer.write({} as EntityManager, 'course.created', courseMetadata())).rejects.toBe(failure);
  });
});

describe('transactional audit production metadata policy', () => {
  it('accepts only the event-specific metadata keys and normalizes changed fields', () => {
    expect(validateTransactionalAuditMetadata('course.created', courseMetadata())).toEqual({
      tenantId: TENANT_ID,
      actorUserId: null,
      actorSessionId: null,
      action: 'course.created',
      entityType: 'course',
      entityId: ENTITY_ID,
      requestId: 'audit-writer-unit-test',
      metadataJson: {
        schemaVersion: 1,
        result: 'success',
        changedFields: ['name', 'status'],
      },
    });
  });

  it.each(FORBIDDEN_AUDIT_METADATA_KEYS)('rejects forbidden or unknown metadata key %s', (forbiddenKey) => {
    const input = {
      ...courseMetadata(),
      [forbiddenKey]: 'must-not-enter-audit',
    };

    expect(() => validateTransactionalAuditMetadata('course.created', input)).toThrow(
      /non-allowlisted keys/,
    );
  });

  it('rejects event fields outside the event-specific changedFields allowlist', () => {
    expect(() =>
      validateTransactionalAuditMetadata('course.created', {
        ...courseMetadata(),
        changedFields: ['name', 'studentName'],
      }),
    ).toThrow(/changedFields contains non-allowlisted fields/);
  });

  it('requires branch metadata only for branch-scoped events', () => {
    expect(() =>
      validateTransactionalAuditMetadata('room.created', {
        schemaVersion: 1,
        tenantId: TENANT_ID,
        actorUserId: null,
        actorSessionId: null,
        requestId: 'room-audit-test',
        entityType: 'room',
        entityId: ENTITY_ID,
        result: 'success',
        changedFields: ['name'],
      }),
    ).toThrow(/missing required keys: branchId/);
  });

  it('accepts versioned leave lifecycle events without personal or health detail fields', () => {
    expect(validateTransactionalAuditMetadata('leave.approved.v1', leaveMetadata())).toEqual({
      tenantId: TENANT_ID,
      actorUserId: '30000000-0000-4000-8000-000000000100',
      actorSessionId: null,
      action: 'leave.approved.v1',
      entityType: 'leave_request',
      entityId: ENTITY_ID,
      requestId: 'leave-audit-policy-test',
      metadataJson: {
        schemaVersion: 1,
        result: 'success',
        changedFields: ['coverageStatus', 'status', 'version'],
      },
    });
  });

  it.each(['healthNote', 'reasonDetail', 'teacherName'])(
    'rejects leave audit detail field %s',
    (forbiddenKey) => {
      expect(() => validateTransactionalAuditMetadata('leave.rejected.v1', {
        ...leaveMetadata(),
        [forbiddenKey]: 'must-not-enter-audit',
      })).toThrow(/non-allowlisted keys/);
    },
  );

  it('requires an authenticated actor for leave lifecycle events', () => {
    expect(() => validateTransactionalAuditMetadata('leave.approved.v1', {
      ...leaveMetadata(),
      actorUserId: null,
    })).toThrow(/actorUserId is required/);
  });
});
