import { IsUUID } from 'class-validator';

export class CreateSubstitutionAssignmentDto {
  @IsUUID()
  substituteTeacherId!: string;
}
