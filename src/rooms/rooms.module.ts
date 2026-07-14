import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RoomAuditService } from './room-audit.service';
import { RoomController } from './room.controller';
import { Room } from './room.entity';
import { RoomRepository } from './room.repository';
import { RoomService } from './room.service';

@Module({
  imports: [TypeOrmModule.forFeature([Room])],
  controllers: [RoomController],
  providers: [RoomAuditService, RoomRepository, RoomService],
  exports: [RoomService],
})
export class RoomsModule {}
