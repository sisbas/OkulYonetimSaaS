import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ListRoomsQueryDto {
  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsUUID('4')
  branchId?: string;

  @IsOptional()
  @IsString()
  includeInactive?: string;
}
