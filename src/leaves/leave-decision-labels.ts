import { DEFAULT_TENANT_TIME_ZONE } from '../daily-operations/leave-impact.types';

/**
 * R1 (#263) — karar yanıtının okunabilir etiketleri.
 *
 * Karar yanıtı ham UUID taşımaz: operatör öğretmen/şube/dönem/süre/gerekçe
 * bilgisini adlarla görür. `etag` bilinçli olarak opak bir sürüm jetonudur
 * (`"leave:<id>:v<n>"`) ve If-Match sözleşmesi için sunucu tarafından üretilir;
 * kullanıcıya gösterilen bir metin değildir.
 */
export const LEAVE_DECISION_RESPONSE_FIELDS = [
  'decisionStatus',
  'decisionLabel',
  'coverageStatus',
  'coverageLabel',
  'version',
  'etag',
  'summary',
  'impactDetail',
  'periodLabel',
  'durationLabel',
  'reasonLabel',
  'decidedAtLabel',
  'impact',
] as const;

export const LEAVE_DECISION_TIME_ZONE = DEFAULT_TENANT_TIME_ZONE;

const DURATION_LABELS: Readonly<Record<string, string>> = {
  hourly: 'Saatlik izin',
  full_day: 'Tam gün izin',
  multi_day: 'Çok günlü izin',
};

const REASON_LABELS: Readonly<Record<string, string>> = {
  annual_leave: 'Yıllık izin',
  administrative: 'İdari izin',
  health: 'Sağlık izni',
  other: 'Diğer',
};

function instantParts(date: Date, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);
  const value = Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]),
  );
  return {
    date: `${value.day}.${value.month}.${value.year}`,
    time: `${(value.hour ?? '00').padStart(2, '0')}:${value.minute}`,
  };
}

export function decisionStatusLabel(decision: 'approved' | 'rejected'): string {
  return decision === 'approved' ? 'Onaylandı' : 'Reddedildi';
}

export function durationLabel(durationType: string): string {
  return DURATION_LABELS[durationType] ?? 'Süre bilgisi çözümlenemedi';
}

export function reasonLabel(reasonCode: string): string {
  return REASON_LABELS[reasonCode] ?? 'Gerekçe bilgisi çözümlenemedi';
}

/** "14.09.2026 09:00 – 15.09.2026 18:00" (kiracı saat dilimi). */
export function periodLabel(
  startsAt: Date,
  endsAt: Date,
  timeZone: string = LEAVE_DECISION_TIME_ZONE,
): string {
  const start = instantParts(startsAt, timeZone);
  const end = instantParts(endsAt, timeZone);
  return `${start.date} ${start.time} – ${end.date} ${end.time}`;
}

export function instantLabel(
  value: Date | null,
  timeZone: string = LEAVE_DECISION_TIME_ZONE,
): string | null {
  if (!value) return null;
  const parts = instantParts(value, timeZone);
  return `${parts.date} ${parts.time}`;
}

/**
 * Kararın tek cümlelik, jargon içermeyen özeti. Sıfır etki SESSİZ geçilemez:
 * etkilenen ders yoksa gerekçe metni de yanıtta bulunur.
 */
export function decisionSummary(input: {
  decision: 'approved' | 'rejected';
  impactedLessonCount: number;
  openLessonCount: number;
  zeroImpactDetail: string | null;
}): string {
  if (input.decision === 'rejected') {
    return 'İzin talebi reddedildi; ders programı ve günlük işler değişmedi.';
  }
  if (input.impactedLessonCount === 0) {
    return `İzin onaylandı. ${input.zeroImpactDetail ?? 'Etkilenen ders yok.'}`;
  }
  return (
    `İzin onaylandı. ${input.impactedLessonCount} ders etkilendi, ` +
    `${input.openLessonCount} ders karşılık bekliyor.`
  );
}

/** Ret kararında etkinin neden hesaplanmadığını açıkça söyler. */
export const REJECTED_IMPACT_DETAIL =
  'Ret kararında ders etkisi hesaplanmaz; mevcut projeksiyon ve görevlendirmeler değişmez.';

/** Onayda projeksiyonun yazıldığını ve yedek atamasının ayrı adım olduğunu söyler. */
export const APPROVED_IMPACT_DETAIL =
  'Etkilenen her ders için açık günlük iş kaydı aynı işlemde oluşturuldu; ' +
  'yedek öğretmen ataması ayrı işlemle yapılır.';
