import { IsEnum, IsISO8601, IsUUID } from 'class-validator';
import { LeaveDurationType, LeaveReasonCode } from '../leave-request.entity';

export class CreateLeaveRequestDto {
  @IsUUID()
  branchId!: string;

  @IsEnum(LeaveDurationType)
  durationType!: LeaveDurationType;

  @IsEnum(LeaveReasonCode)
  reasonCode!: LeaveReasonCode;

  @IsISO8601()
  startsAt!: string;

  @IsISO8601()
  endsAt!: string;
}
