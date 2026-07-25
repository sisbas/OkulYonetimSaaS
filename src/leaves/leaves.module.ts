import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeaveController } from './leave.controller';
import { LeaveIdentityService } from './leave-identity.service';
import { LeaveRequest } from './leave-request.entity';
import { LeaveRepository } from './leave.repository';
import { LeaveService } from './leave.service';

@Module({
  imports: [TypeOrmModule.forFeature([LeaveRequest])],
  controllers: [LeaveController],
  providers: [LeaveIdentityService, LeaveRepository, LeaveService],
  exports: [LeaveService],
})
export class LeavesModule {}
