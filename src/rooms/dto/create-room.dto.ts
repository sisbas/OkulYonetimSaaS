import { IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min } from 'class-validator';

export class CreateRoomDto {
  @IsUUID()
  branchId!: string;

  @IsString()
  @Length(1, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'code may contain only letters, numbers, underscore and dash' })
  code?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000)
  capacity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
