import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { AuditLogRepository } from './audit-log.repository';
import { validateTransactionalAuditMetadata } from './audit-metadata-policy';
import { AuditMetadataByEvent, TransactionalAuditEventName } from './transactional-audit.types';

export const TRANSACTIONAL_AUDIT_WRITER = Symbol('TRANSACTIONAL_AUDIT_WRITER');

export interface TransactionalAuditWriter {
  write<E extends TransactionalAuditEventName>(
    entityManager: EntityManager,
    eventName: E,
    allowlistedMetadata: AuditMetadataByEvent[E],
  ): Promise<void>;
}

@Injectable()
export class TypeOrmTransactionalAuditWriter implements TransactionalAuditWriter {
  constructor(private readonly auditLogs: AuditLogRepository) {}

  async write<E extends TransactionalAuditEventName>(
    entityManager: EntityManager,
    eventName: E,
    allowlistedMetadata: AuditMetadataByEvent[E],
  ): Promise<void> {
    const record = validateTransactionalAuditMetadata(eventName, allowlistedMetadata);
    await this.auditLogs.insert(entityManager, record);
  }
}
