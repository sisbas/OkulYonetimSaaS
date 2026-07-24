import { EntityManager } from 'typeorm';

import { TransactionalAuditWriter } from '../common/audit/transactional-audit-writer';
import { AuditMetadataByEvent } from '../common/audit/transactional-audit.types';
import { TransactionalLeaveAuditAdapter } from './leave-audit.adapter';

const TENANT_ID = '10000000-0000-4000-8000-000000000100';
const LEAVE_REQUEST_ID = '20000000-0000-4000-8000-000000000100';
const ACTOR_USER_ID = '30000000-0000-4000-8000-000000000100';

function requestedMetadata(): AuditMetadataByEvent['leave.requested.v1'] {
  return {
    schemaVersion: 1,
    tenantId: TENANT_ID,
    actorUserId: ACTOR_USER_ID,
    actorSessionId: null,
    requestId: 'leave-audit-adapter-test',
    entityType: 'leave_request',
    entityId: LEAVE_REQUEST_ID,
    result: 'success',
    changedFields: ['status', 'durationKind', 'reasonCode', 'startAt', 'endAt', 'version'],
  };
}

describe('TransactionalLeaveAuditAdapter', () => {
  it('delegates the allowlisted leave event to the shared writer with the same transaction manager', async () => {
    const write = jest.fn().mockResolvedValue(undefined);
    const adapter = new TransactionalLeaveAuditAdapter({ write } as unknown as TransactionalAuditWriter);
    const manager = {} as EntityManager;
    const metadata = requestedMetadata();

    await adapter.write(manager, 'leave.requested.v1', metadata);

    expect(write).toHaveBeenCalledWith(manager, 'leave.requested.v1', metadata);
  });

  it('propagates shared writer failures so the caller transaction can roll back', async () => {
    const failure = new Error('audit insert failed');
    const adapter = new TransactionalLeaveAuditAdapter({
      write: jest.fn().mockRejectedValue(failure),
    } as unknown as TransactionalAuditWriter);

    await expect(
      adapter.write({} as EntityManager, 'leave.requested.v1', requestedMetadata()),
    ).rejects.toBe(failure);
  });
});
