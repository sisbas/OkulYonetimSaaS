import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
  PreconditionFailedException,
} from '@nestjs/common';

export const LEAVE_NOT_FOUND_MESSAGE = 'Leave request not found';

export class LeaveNotFoundException extends NotFoundException {
  constructor() {
    super(LEAVE_NOT_FOUND_MESSAGE);
  }
}

export class LeaveExpectedVersionRequiredException extends HttpException {
  constructor() {
    super('Expected leave request version is required', 428);
  }
}

export class LeaveStaleVersionException extends PreconditionFailedException {
  constructor() {
    super('Leave request version mismatch');
  }
}

export class LeaveTerminalStateException extends ConflictException {
  constructor() {
    super('Only pending leave requests can be decided');
  }
}

export class LeaveSelfDecisionException extends ConflictException {
  constructor() {
    super('Leave request owner cannot approve or reject their own request');
  }
}

export class LeaveIdentityFoundationRequiredException extends HttpException {
  constructor() {
    super('Teacher identity foundation is required before leave own-scope runtime can be enabled', 424);
  }
}

/**
 * Onay etkisi için hesaplanacak occurrence sayısı üst sınırı aşıldı (#263 review P1).
 *
 * Sessiz kırpma YASAKTIR: çok büyük ama biçimsel olarak geçerli bir izin aralığı,
 * açık-uçlu yayınlanmış programla birlikte yüz binlerce satır üretip event loop'u
 * bloke edebilir ve transaction'ı uzatabilir. Bu durumda istek REDDEDİLİR ve
 * çağıran, aralığı daraltması gerektiğini açıkça görür (fail-closed).
 */
export class LeaveImpactRangeTooLargeException extends HttpException {
  constructor(readonly maxOccurrences: number) {
    super(
      `Leave period affects more than ${maxOccurrences} schedule occurrences; narrow the period or split the request`,
      422,
    );
  }
}

export class LeaveOverlapException extends ConflictException {
  constructor() {
    super('Leave request period overlaps an existing request');
  }
}

/**
 * #461 F4 — yedeksiz onay yok.
 *
 * Etkilenen her ders için onayla AYNI transaction'da yedek seçilmelidir;
 * eksik kapsama onayı engeller ve hangi sayıda dersin açık kaldığını söyler.
 */
export class LeaveCoverageRequiredException extends ConflictException {
  constructor(readonly openLessonCount: number) {
    super({
      statusCode: 409,
      code: 'LEAVE_COVERAGE_REQUIRED',
      message:
        'Leave cannot be approved while impacted lessons have no substitute coverage',
      openLessonCount,
    });
  }
}

/** #461 F4 — onay gövdesindeki yedek seçimi geçersiz (bilinmeyen/yinelenen olay). */
export class LeaveSubstitutionInvalidException extends BadRequestException {
  constructor() {
    super({
      statusCode: 400,
      code: 'LEAVE_SUBSTITUTION_INVALID',
      message: 'Substitutions must cover each impacted lesson exactly once',
    });
  }
}

/** #461 F4 — seçilen yedek uygun değil; onay yazılmaz. */
export class LeaveSubstituteIneligibleException extends ConflictException {
  constructor(readonly reasonCode?: string) {
    super({
      statusCode: 409,
      code: 'LEAVE_SUBSTITUTE_INELIGIBLE',
      message: 'Selected substitute is not eligible for every impacted lesson',
      reasonCode: reasonCode ?? null,
    });
  }
}

/**
 * #461 F4 — yedek uygunluğu doğrulanamıyor.
 *
 * Öğretmen-ders uygunluk kaynağı yokken "uygun" varsayımı yapılamaz; onay
 * fail-closed reddedilir (424), böylece karar yanlış kapsama ile yazılmaz.
 */
export class LeaveSubstituteEligibilityNotReadyException extends HttpException {
  constructor() {
    super(
      'Substitute eligibility source is not ready; leave approval cannot be validated',
      424,
    );
  }
}

