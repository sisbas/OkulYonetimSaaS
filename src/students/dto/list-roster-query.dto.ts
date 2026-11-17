import { IsOptional, IsString, IsUUID } from 'class-validator';

export class ListRosterQueryDto {
  /** Verilmezse sunucunun çözümlediği aktif şube kullanılır. */
  @IsOptional()
  @IsUUID('4')
  branchId?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}
