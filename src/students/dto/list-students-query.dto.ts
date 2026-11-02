import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ListStudentsQueryDto {
  /** Verilmezse sunucunun çözümlediği aktif şube kullanılır. */
  @IsOptional()
  @IsUUID('4')
  branchId?: string;

  @IsOptional()
  @IsUUID('4')
  studentGroupId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}
