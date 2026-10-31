import { BadRequestException } from '@nestjs/common';

import { LeaveDurationType } from './leave-request.entity';

/**
 * İzin penceresi sözleşmesi (#263 AC-3).
 *
 * "Geçerli takvim tarihleri, sınırlı aralık, tenant/şube saat dilimi" kuralları
 * tek bir saf fonksiyonda toplanır; böylece DB'ye hiç dokunmadan unit/property
 * olarak test edilebilir.
 *
 * Kurallar (hepsi tenant saat diliminde değerlendirilir):
 * - `start < end` zorunlu.
 * - Toplam aralık `LEAVE_MAX_RANGE_DAYS` günü aşamaz (sınırsız/yanlış aralık
 *   onay anındaki occurrence üretimini de sınırlar).
 * - `hourly`  : toplam süre <= 24 saat ve en fazla bir yerel gün sınırı aşılabilir
 *   (gece yarısını aşan 23:00 -> 01:00 gibi gerçek durumlar reddedilmez).
 * - `full_day`: iki uç da yerel gece yarısı (00:00) ve tam 1 gün.
 * - `multi_day`: iki uç da yerel gece yarısı ve >= 2 gün.
 *
 * Saat dilimi çözülemezse sessizce UTC'ye düşmek YASAK: istek reddedilir
 * (fail-closed) — aksi hâlde gece yarısı hizalaması yanlış hesaplanır.
 */

/** Onay etkisi ve occurrence üretimi için üst sınır (gün). */
export const LEAVE_MAX_RANGE_DAYS = 366;

export type LeaveWindowCode =
  | 'INVALID_RANGE'
  | 'RANGE_TOO_LONG'
  | 'INVALID_TIME_ZONE'
  | 'UNKNOWN_DURATION'
  | 'HOURLY_RANGE_TOO_LONG'
  | 'FULL_DAY_NOT_ALIGNED'
  | 'MULTI_DAY_NOT_ALIGNED';

export class LeaveWindowError extends BadRequestException {
  constructor(
    readonly code: LeaveWindowCode,
    message: string,
  ) {
    super(message);
  }
}

export type LeaveWindowInput = Readonly<{
  durationType: LeaveDurationType | string;
  startsAt: Date;
  endsAt: Date;
  /** Tenant (gerekirse şube) saat dilimi; IANA adı. */
  timeZone: string;
}>;

export type LeaveWindowResult = Readonly<{
  timeZone: string;
  /** Yerel takvim günü farkı (full_day: 1, multi_day: >= 2). */
  localDaySpan: number;
  totalHours: number;
}>;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Saat dilimini doğrular; geçersizse fail-closed hata verir. */
export function resolveLeaveTimeZone(timeZone: string | null | undefined): string {
  const candidate = (timeZone ?? '').trim();
  if (candidate === '') {
    throw new LeaveWindowError('INVALID_TIME_ZONE', 'Tenant time zone is required for leave requests');
  }
  try {
    // Geçersiz IANA adı RangeError fırlatır.
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date(0));
  } catch {
    throw new LeaveWindowError('INVALID_TIME_ZONE', 'Tenant time zone is not a valid IANA time zone');
  }
  return candidate;
}

/** Anı, verilen saat diliminde yerel takvim günü + saat/dakika olarak ayrıştırır. */
export function localCalendarParts(
  instant: Date,
  timeZone: string,
): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(instant);
  const pick = (type: string): string => parts.find((part) => part.type === type)?.value ?? '';
  // `en-CA` 24:00 yerine 00:00 üretir; yine de savunmacı olarak normalize edilir.
  const hour = pick('hour') === '24' ? '00' : pick('hour');
  return {
    date: `${pick('year')}-${pick('month')}-${pick('day')}`,
    time: `${hour}:${pick('minute')}`,
  };
}

function localDayNumber(date: string): number {
  const [year, month, day] = date.split('-').map((value) => Number(value));
  return Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

/**
 * İzin penceresini doğrular. Hata durumunda `LeaveWindowError` (400) fırlatır;
 * çağıran hiçbir satır yazmaz.
 */
export function assertLeaveWindow(input: LeaveWindowInput): LeaveWindowResult {
  const timeZone = resolveLeaveTimeZone(input.timeZone);
  const start = input.startsAt;
  const end = input.endsAt;

  if (!(start instanceof Date) || !(end instanceof Date)) {
    throw new LeaveWindowError('INVALID_RANGE', 'Leave request period is invalid');
  }
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start.getTime() >= end.getTime()) {
    throw new LeaveWindowError('INVALID_RANGE', 'Leave request date range is invalid');
  }

  const totalHours = (end.getTime() - start.getTime()) / (60 * 60 * 1000);
  if (totalHours > LEAVE_MAX_RANGE_DAYS * 24) {
    throw new LeaveWindowError(
      'RANGE_TOO_LONG',
      `Leave request period cannot exceed ${LEAVE_MAX_RANGE_DAYS} days`,
    );
  }

  const startParts = localCalendarParts(start, timeZone);
  const endParts = localCalendarParts(end, timeZone);
  const localDaySpan = localDayNumber(endParts.date) - localDayNumber(startParts.date);
  const atLocalMidnight = startParts.time === '00:00' && endParts.time === '00:00';

  switch (input.durationType) {
    case LeaveDurationType.HOURLY:
      if (totalHours > 24 || localDaySpan > 1) {
        throw new LeaveWindowError(
          'HOURLY_RANGE_TOO_LONG',
          'Hourly leave cannot exceed 24 hours or span more than two local calendar days',
        );
      }
      break;
    case LeaveDurationType.FULL_DAY:
      if (!atLocalMidnight || localDaySpan !== 1) {
        throw new LeaveWindowError(
          'FULL_DAY_NOT_ALIGNED',
          'Full-day leave must span exactly one full local calendar day (midnight to midnight)',
        );
      }
      break;
    case LeaveDurationType.MULTI_DAY:
      if (!atLocalMidnight || localDaySpan < 2) {
        throw new LeaveWindowError(
          'MULTI_DAY_NOT_ALIGNED',
          'Multi-day leave must span at least two full local calendar days (midnight to midnight)',
        );
      }
      break;
    default:
      throw new LeaveWindowError('UNKNOWN_DURATION', 'Leave duration type is not supported');
  }

  return { timeZone, localDaySpan, totalHours };
}
