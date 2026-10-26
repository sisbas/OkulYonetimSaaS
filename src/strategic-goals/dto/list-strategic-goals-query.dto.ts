import { IsOptional, Matches } from 'class-validator';

/** #457 — Stratejik hedef listeleme filtresi (akademik yıl). */
export class ListStrategicGoalsQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{4}$/, { message: 'academicYear must be a year range like 2026-2027' })
  academicYear?: string;
}
