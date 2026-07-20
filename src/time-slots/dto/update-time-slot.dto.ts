import { IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class UpdateTimeSlotDto {
  @IsOptional()
  @IsUUID('4')
  branchId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  dayOfWeek?: number;

  @IsOptional()
  @IsString()
  @Matches(TIME_PATTERN, { message: 'startTime must use HH:mm format' })
  startTime?: string;

  @IsOptional()
  @IsString()
  @Matches(TIME_PATTERN, { message: 'endTime must use HH:mm format' })
  endTime?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  orderIndex?: number;
}
