import { IsNumber, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * #457 — Stratejik hedef güncelle. Hedef ve gerçekleşme elle girilir;
 * metrik anahtarı/yılı sonradan DEĞİŞTİRİLMEZ (tekillik kimliği sabit kalır).
 */
export class UpdateStrategicGoalDto {
  @IsOptional()
  @IsNumber()
  targetValue?: number;

  @IsOptional()
  @IsNumber()
  progressValue?: number | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  metricLabel?: string | null;
}
