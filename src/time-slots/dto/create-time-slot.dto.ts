import { IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateTimeSlotDto {
  @IsUUID('4')
  branchId!: string;

  @IsString()
  @Length(1, 120)
  name!: string;

  @IsInt()
  @Min(1)
  @Max(7)
  dayOfWeek!: number;

  @IsString()
  @Matches(TIME_PATTERN, { message: 'startTime must use HH:mm format' })
  startTime!: string;

  @IsString()
  @Matches(TIME_PATTERN, { message: 'endTime must use HH:mm format' })
  endTime!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  orderIndex?: number;
}
