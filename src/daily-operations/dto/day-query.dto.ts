import { IsOptional, IsUUID, Matches } from 'class-validator';

/**
 * #461 F2 — günlük operasyon okuma sorgusu.
 *
 * `branchId` verilmezse sunucunun çözdüğü aktif şube kullanılır. Takvim
 * geçerliliği (ör. 30 Şubat) servis katmanında ayrıca doğrulanır.
 */
export class DayQueryDto {
  @IsOptional()
  @IsUUID('4')
  branchId?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must use YYYY-MM-DD',
  })
  date?: string;
}
