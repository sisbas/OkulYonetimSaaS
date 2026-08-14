import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportDefinition } from './report-definition.entity';
import { ReportRun } from './report-run.entity';
import { ReportsService } from './reports.service';
// attendance_records aggregate için AttendanceRecord entity'si paylaşılır.
import { AttendanceRecord } from '../attendance/attendance.entity';

/**
 * Reporting Module (OKUL-09).
 * Rapor tanımı/çalıştırma entity'leri + aggregate servisi.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ReportDefinition, ReportRun, AttendanceRecord]),
  ],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
