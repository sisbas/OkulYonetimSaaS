import { IsEnum, IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { LeaveDecisionStatus } from '../leave-request.entity';

export class ListLeaveRequestsQueryDto {
  @IsUUID()
  branchId!: string;

  @IsOptional()
  @IsEnum(LeaveDecisionStatus)
  decisionStatus?: LeaveDecisionStatus;

  @IsOptional()
  @IsUUID()
  teacherId?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}
