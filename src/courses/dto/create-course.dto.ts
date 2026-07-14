import { IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export class CreateCourseDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'code may contain only letters, numbers, underscore and dash' })
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
