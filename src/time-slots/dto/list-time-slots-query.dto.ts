import { IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class ListTimeSlotsQueryDto {
  @IsUUID('4')
  branchId!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[1-7]$/, { message: 'dayOfWeek must be between 1 and 7' })
  dayOfWeek?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}
