import { Inject, Injectable, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import {
  TRANSACTIONAL_AUDIT_WRITER,
  TransactionalAuditWriter,
} from '../common/audit/transactional-audit-writer';
import {
  AttendanceAuditEventName,
  AuditMetadataByEvent,
} from '../common/audit/transactional-audit.types';

export const ATTENDANCE_AUDIT_PORT = Symbol('ATTENDANCE_AUDIT_PORT');

/**
 * Attendance yaşam döngüsü olaylarının durable audit portu (#259, #265 AC-5).
 *
 * Port, domain servisinin transaction'ında çağrılır; böylece audit kaydı
 * domain mutasyonuyla birlikte commit/rollback olur.
 */
export interface AttendanceAuditPort {
  write<E extends AttendanceAuditEventName>(
    entityManager: EntityManager,
    eventName: E,
    metadata: AuditMetadataByEvent[E],
  ): Promise<void>;
}

@Injectable()
export class TransactionalAttendanceAuditAdapter implements AttendanceAuditPort {
  private readonly logger = new Logger(TransactionalAttendanceAuditAdapter.name);

  constructor(
    @Inject(TRANSACTIONAL_AUDIT_WRITER)
    private readonly auditWriter: TransactionalAuditWriter,
  ) {}

  async write<E extends AttendanceAuditEventName>(
    entityManager: EntityManager,
    eventName: E,
    metadata: AuditMetadataByEvent[E],
  ): Promise<void> {
    await this.auditWriter.write(entityManager, eventName, metadata);
    // Kanıt logu: PII taşımaz (yalnız olay + tenant + aktör kimliği).
    this.logger.log(
      JSON.stringify({
        event: 'attendance.audit.persisted',
        auditEvent: eventName,
        tenantId: metadata.tenantId,
        entityId: metadata.entityId,
      }),
    );
  }
}
