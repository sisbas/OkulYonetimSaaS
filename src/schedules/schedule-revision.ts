import { HttpException, HttpStatus, PreconditionFailedException } from '@nestjs/common';

/**
 * Kaynağa bağlı koşullu revizyon başlığı (#447, sözleşme §2 / §8).
 *
 * Mevcut-kaynak mutasyonları `If-Match: "schedule:<scheduleId>:v<revision>"`
 * gerektirir. Eksik başlık 428 `SCHEDULE_VERSION_REQUIRED`, uyuşmayan/başka
 * kaynağa bağlı/bozuk başlık 412 `SCHEDULE_VERSION_MISMATCH` üretir.
 *
 * Bu başlığın değeri SUNUCUDAN gelir: istemci onu `response.etag` okuyup aynen
 * yankılar; revision aritmetiği istemcide YOKTUR (#441 user story 75).
 */
export const IF_MATCH_HEADER = 'if-match';

const IF_MATCH_PATTERN =
  /^"schedule:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):v([1-9]\d*)"$/i;

export type ScheduleIfMatchToken = { scheduleId: string; revision: number };

/** 428 — başlık hiç gönderilmedi. */
export class ScheduleVersionRequiredException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.PRECONDITION_REQUIRED,
        code: 'SCHEDULE_VERSION_REQUIRED',
        message: 'İşlem için güncel program sürümü gerekli.',
      },
      HttpStatus.PRECONDITION_REQUIRED,
    );
    this.name = 'ScheduleVersionRequiredException';
  }
}

/** 412 — başlık var ama kaynak/revizyon uyuşmuyor (veya bozuk). */
export class ScheduleVersionMismatchException extends PreconditionFailedException {
  constructor(message = 'Program başka bir işlemle güncellendi. Ekranı yenileyin.') {
    super({ statusCode: 412, code: 'SCHEDULE_VERSION_MISMATCH', message });
    this.name = 'ScheduleVersionMismatchException';
  }
}

/** Başlığı okuyup ayrıştırır; 428/412 fırlatabilir. */
export function parseScheduleIfMatch(
  raw: string | string[] | undefined,
): ScheduleIfMatchToken {
  if (raw === undefined) throw new ScheduleVersionRequiredException();
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') throw new ScheduleVersionMismatchException();
  const match = IF_MATCH_PATTERN.exec(value.trim());
  if (!match) throw new ScheduleVersionMismatchException();
  return { scheduleId: match[1], revision: Number(match[2]) };
}

/** Kaynak bağını denetler; uyuşma yoksa 412. */
export function assertScheduleIfMatchResource(
  token: ScheduleIfMatchToken,
  scheduleId: string,
): ScheduleIfMatchToken {
  if (token.scheduleId.toLowerCase() !== String(scheduleId).toLowerCase()) {
    throw new ScheduleVersionMismatchException();
  }
  return token;
}

/** Sunucunun ürettiği `ETag` değeri (`res.setHeader('ETag', ...)` çağrısı için). */
export function scheduleEtag(scheduleId: string, revision: number): string {
  return `"schedule:${String(scheduleId).toLowerCase()}:v${revision}"`;
}
