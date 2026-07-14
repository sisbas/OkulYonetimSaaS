import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ListCoursesQueryDto {
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
  @IsString()
  includeInactive?: string;
}
