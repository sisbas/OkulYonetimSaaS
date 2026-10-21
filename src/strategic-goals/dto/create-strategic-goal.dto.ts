import { IsNumber, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * #457 — Stratejik hedef oluştur.
 *
 * Akademik dönem CRUD bu fazın kapsamı dışında olduğu için akademik yıl,
 * okulun girdiği yıl-aralığı etiketidir. Tekillik (tenant, yıl, metrik)
 * üzerinden kurulduğu için etiket biçimi canonical tutulur: "2026-2027".
 */
export class CreateStrategicGoalDto {
  @IsString()
  @Matches(/^\d{4}-\d{4}$/, { message: 'academicYear must be a year range like 2026-2027' })
  academicYear!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  metricKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  metricLabel?: string | null;

  @IsNumber()
  targetValue!: number;
}
