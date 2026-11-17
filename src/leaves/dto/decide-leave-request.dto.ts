import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { MAX_APPROVAL_OCCURRENCES } from '../../daily-operations/leave-approval-impact';

/**
 * #461 F4 — onayla AYNI transaction'da yazılacak yedek seçimi.
 *
 * `scheduleEventId` yalnız istek gövdesinde yaşar; karar yanıtı ham kimlik
 * taşımaz. Her açık ders için tam bir seçim zorunludur; eksik/tekrarlı seçim
 * sunucuda reddedilir.
 */
export class LeaveSubstitutionDto {
  @IsUUID()
  scheduleEventId!: string;

  @IsUUID()
  substituteTeacherId!: string;
}

export class DecideLeaveRequestDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_APPROVAL_OCCURRENCES)
  @ValidateNested({ each: true })
  @Type(() => LeaveSubstitutionDto)
  substitutions?: LeaveSubstitutionDto[];
}
