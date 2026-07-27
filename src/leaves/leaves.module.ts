import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditLogRepository } from '../common/audit/audit-log.repository';
import {
  TRANSACTIONAL_AUDIT_WRITER,
  TypeOrmTransactionalAuditWriter,
} from '../common/audit/transactional-audit-writer';
import {
  LEAVE_AUDIT_PORT,
  TransactionalLeaveAuditAdapter,
} from './leave-audit.adapter';
import { LeaveController } from './leave.controller';
import { LeaveIdentityService } from './leave-identity.service';
import { LeaveRequest } from './leave-request.entity';
import { LeaveRepository } from './leave.repository';
import { LeaveService } from './leave.service';

@Module({
  imports: [TypeOrmModule.forFeature([LeaveRequest])],
  controllers: [LeaveController],
  providers: [
    AuditLogRepository,
    TypeOrmTransactionalAuditWriter,
    { provide: TRANSACTIONAL_AUDIT_WRITER, useExisting: TypeOrmTransactionalAuditWriter },
    TransactionalLeaveAuditAdapter,
    { provide: LEAVE_AUDIT_PORT, useExisting: TransactionalLeaveAuditAdapter },
    LeaveIdentityService,
    LeaveRepository,
    LeaveService,
  ],
  exports: [LeaveService],
})
export class LeavesModule {}
