import { Inject, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import {
  TRANSACTIONAL_AUDIT_WRITER,
  TransactionalAuditWriter,
} from '../common/audit/transactional-audit-writer';
import {
  AuditMetadataByEvent,
  LeaveSuccessAuditEventName,
} from '../common/audit/transactional-audit.types';

export const LEAVE_AUDIT_PORT = Symbol('LEAVE_AUDIT_PORT');

export interface LeaveAuditPort {
  write<E extends LeaveSuccessAuditEventName>(
    entityManager: EntityManager,
    eventName: E,
    metadata: AuditMetadataByEvent[E],
  ): Promise<void>;
}

@Injectable()
export class TransactionalLeaveAuditAdapter implements LeaveAuditPort {
  constructor(
    @Inject(TRANSACTIONAL_AUDIT_WRITER)
    private readonly auditWriter: TransactionalAuditWriter,
  ) {}

  async write<E extends LeaveSuccessAuditEventName>(
    entityManager: EntityManager,
    eventName: E,
    metadata: AuditMetadataByEvent[E],
  ): Promise<void> {
    await this.auditWriter.write(entityManager, eventName, metadata);
  }
}
