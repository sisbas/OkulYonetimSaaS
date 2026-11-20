import { HttpException, HttpStatus } from '@nestjs/common';

import { CanonicalScheduleReasonCode } from './m3-schedule-contract';

/**
 * #453 — yayın reddinin HTTP sınıfı nedene bağlıdır. Dört kapalı kapı aynı
 * 422'ye düşmez: dönem çakışması 409, diğer üçü 422'dir. Kod her zaman
 * gövdede taşınır; istemci kodu üretmez.
 */
const REASON_STATUS: Partial<Record<CanonicalScheduleReasonCode, number>> = {
  SCHEDULE_EMPTY: HttpStatus.UNPROCESSABLE_ENTITY,
  SCHEDULE_VALIDATION_STALE: HttpStatus.UNPROCESSABLE_ENTITY,
  SCHEDULE_HARD_CONFLICTS_PRESENT: HttpStatus.UNPROCESSABLE_ENTITY,
  PUBLISHED_SCHEDULE_PERIOD_CONFLICT: HttpStatus.CONFLICT,
  PUBLISHED_SCHEDULE_IMMUTABLE: HttpStatus.CONFLICT,
};

export function publishDeniedStatus(code: CanonicalScheduleReasonCode): number {
  return REASON_STATUS[code] ?? HttpStatus.UNPROCESSABLE_ENTITY;
}

export class SchedulePublishDeniedException extends HttpException {
  constructor(code: CanonicalScheduleReasonCode, message?: string) {
    super(
      {
        statusCode: publishDeniedStatus(code),
        code,
        reasonCode: code,
        message: message ?? publishDeniedMessage(code),
      },
      publishDeniedStatus(code),
    );
    this.name = 'SchedulePublishDeniedException';
  }
}

function publishDeniedMessage(code: CanonicalScheduleReasonCode): string {
  const messages: Partial<Record<CanonicalScheduleReasonCode, string>> = {
    SCHEDULE_EMPTY: 'Boş program yayınlanamaz.',
    SCHEDULE_VALIDATION_STALE: 'Program değişti; güncel tam doğrulama gerekli.',
    SCHEDULE_HARD_CONFLICTS_PRESENT: 'Çözülmemiş zorunlu çakışmalar nedeniyle yayınlanamaz.',
    PUBLISHED_SCHEDULE_PERIOD_CONFLICT: 'Bu şube ve tarih aralığında yayınlanmış başka bir program var.',
    PUBLISHED_SCHEDULE_IMMUTABLE: 'Yayınlanmış program değiştirilemez.',
  };
  return messages[code] ?? 'Program yayınlanamaz.';
}
