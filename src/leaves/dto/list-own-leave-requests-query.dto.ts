import { IsEnum, IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { LeaveDecisionStatus } from '../leave-request.entity';

/**
 * Öğretmenin kendi izin geçmişi filtresi (#263 AC-1).
 *
 * `teacherId` BİLİNÇLİ OLARAK yoktur: kapsam sunucuda çözülür (BOLA koruması).
 */
export class ListOwnLeaveRequestsQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsEnum(LeaveDecisionStatus)
  decisionStatus?: LeaveDecisionStatus;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}
