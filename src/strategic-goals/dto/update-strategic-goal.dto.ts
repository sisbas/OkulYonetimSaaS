import { IsNumber, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

/**
 * #457 — Stratejik hedef güncelle. Hedef ve gerçekleşme elle girilir;
 * metrik anahtarı/yılı sonradan DEĞİŞTİRİLMEZ (tekillik kimliği sabit kalır).
 *
 * targetValue nullable DEĞİL: `@IsOptional()` null'ı da "yok" sayıp doğrulamayı
 * atlar ve null değer NOT NULL kolona giderek 500 üretirdi. `@ValidateIf` yalnız
 * `undefined` alanı atlar; null @IsNumber ile 400'e düşer.
 */
export class UpdateStrategicGoalDto {
  @ValidateIf((_object, value) => value !== undefined)
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
