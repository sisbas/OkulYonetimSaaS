import { Module } from '@nestjs/common';

import { AuditLogRepository } from '../common/audit/audit-log.repository';
import {
  TRANSACTIONAL_AUDIT_WRITER,
  TypeOrmTransactionalAuditWriter,
} from '../common/audit/transactional-audit-writer';
import { DailyOperationsController, DailyOperationsQueueController } from './daily-operations.controller';
import { DailyOperationsRepository } from './daily-operations.repository';
import { DailyOperationsService } from './daily-operations.service';

@Module({
  controllers: [DailyOperationsController, DailyOperationsQueueController],
  providers: [
    AuditLogRepository,
    TypeOrmTransactionalAuditWriter,
    { provide: TRANSACTIONAL_AUDIT_WRITER, useExisting: TypeOrmTransactionalAuditWriter },
    DailyOperationsRepository,
    DailyOperationsService,
  ],
})
export class DailyOperationsModule {}
