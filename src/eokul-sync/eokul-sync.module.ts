import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EokulSyncRun } from './eokul-sync.entity';
import { EokulRecordEntity } from './eokul-record.entity';
import { EokulSyncService } from './eokul-sync.service';

@Module({
  imports: [TypeOrmModule.forFeature([EokulSyncRun, EokulRecordEntity])],
  providers: [EokulSyncService],
  exports: [EokulSyncService],
})
export class EokulSyncModule {}
