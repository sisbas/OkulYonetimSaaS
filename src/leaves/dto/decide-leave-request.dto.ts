import { IsEnum } from 'class-validator';
import { LeaveDecisionStatus } from '../leave-request.entity';

export class DecideLeaveRequestDto {
  @IsEnum([LeaveDecisionStatus.APPROVED, LeaveDecisionStatus.REJECTED])
  decision!: LeaveDecisionStatus.APPROVED | LeaveDecisionStatus.REJECTED;
}
