import { Module } from '@nestjs/common';
import { AuditLogRepository } from '../common/audit/audit-log.repository';
import {
  TRANSACTIONAL_AUDIT_WRITER,
  TypeOrmTransactionalAuditWriter,
} from '../common/audit/transactional-audit-writer';
import { ConsentManagerService } from './consent-manager.service';
import { KvkkConsentController } from './kvkk-consent.controller';

/**
 * Stage 5 — KVKK consent yönetim modülü.
 *
 * Guard/service katmanlarının aksine bu modül HTTP yüzeyini taşır:
 * `GET /consents` (list) ve `POST /consents/revoke` (authority event).
 */
@Module({
  controllers: [KvkkConsentController],
  providers: [
    AuditLogRepository,
    TypeOrmTransactionalAuditWriter,
    { provide: TRANSACTIONAL_AUDIT_WRITER, useExisting: TypeOrmTransactionalAuditWriter },
    ConsentManagerService,
  ],
  exports: [ConsentManagerService],
})
export class KvkkModule {}