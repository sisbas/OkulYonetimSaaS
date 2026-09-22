import { Module } from '@nestjs/common';

import { AuditLogRepository } from './audit-log.repository';
import {
  TRANSACTIONAL_AUDIT_WRITER,
  TypeOrmTransactionalAuditWriter,
} from './transactional-audit-writer';
import { AuditQueryService } from './audit-query.service';
import { AuditRetentionService } from './audit-retention.service';
import { AuditController } from './audit.controller';

/**
 * Audit okuma/doğrulama/retention modülü (#259).
 *
 * Bu modül yalnız `audit_logs` + `audit_chain_checkpoints` ile çalışır; domain
 * modülleri (leaves/attendance/...) kendi audit writer sağlayıcılarını taşır.
 */
@Module({
  controllers: [AuditController],
  providers: [
    AuditLogRepository,
    TypeOrmTransactionalAuditWriter,
    { provide: TRANSACTIONAL_AUDIT_WRITER, useExisting: TypeOrmTransactionalAuditWriter },
    AuditQueryService,
    AuditRetentionService,
  ],
  exports: [AuditQueryService, AuditRetentionService, AuditLogRepository],
})
export class AuditModule {}
