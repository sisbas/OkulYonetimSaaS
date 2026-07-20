import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TimeSlotAuditService } from './time-slot-audit.service';
import { TimeSlotController } from './time-slot.controller';
import { TimeSlot } from './time-slot.entity';
import { TimeSlotRepository } from './time-slot.repository';
import { TimeSlotService } from './time-slot.service';

@Module({
  imports: [TypeOrmModule.forFeature([TimeSlot])],
  controllers: [TimeSlotController],
  providers: [TimeSlotAuditService, TimeSlotRepository, TimeSlotService],
  exports: [TimeSlotService],
})
export class TimeSlotsModule {}
