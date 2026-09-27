import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditLogRepository } from '../common/audit/audit-log.repository';
import {
  TRANSACTIONAL_AUDIT_WRITER,
  TypeOrmTransactionalAuditWriter,
} from '../common/audit/transactional-audit-writer';
import { DailyOperationsModule } from '../daily-operations/daily-operations.module';
import { DailyOperationsRepository } from '../daily-operations/daily-operations.repository';
import {
  LEAVE_AUDIT_PORT,
  TransactionalLeaveAuditAdapter,
} from './leave-audit.adapter';
import { LEAVE_APPROVAL_IMPACT_PORT } from './leave-approval-impact.port';
import { TeachersModule } from '../teachers/teachers.module';
import { LeaveController } from './leave.controller';
import { LeaveIdentityService } from './leave-identity.service';
import { LeaveRequest } from './leave-request.entity';
import { LeaveRepository } from './leave.repository';
import { LeaveService } from './leave.service';

@Module({
  imports: [TypeOrmModule.forFeature([LeaveRequest]), TeachersModule, DailyOperationsModule],
  controllers: [LeaveController],
  providers: [
    AuditLogRepository,
    TypeOrmTransactionalAuditWriter,
    { provide: TRANSACTIONAL_AUDIT_WRITER, useExisting: TypeOrmTransactionalAuditWriter },
    TransactionalLeaveAuditAdapter,
    { provide: LEAVE_AUDIT_PORT, useExisting: TransactionalLeaveAuditAdapter },
    // R1 (#263): onayda etki + açık projeksiyon yazımı çağıranın transaction'ında
    // çalışır; port mevcut DailyOperationsRepository örneğine bağlanır.
    { provide: LEAVE_APPROVAL_IMPACT_PORT, useExisting: DailyOperationsRepository },
    LeaveIdentityService,
    LeaveRepository,
    LeaveService,
  ],
  exports: [LeaveService],
})
export class LeavesModule {}
