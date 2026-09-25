import { LeaveCoverageStatus, LeaveDecisionStatus } from '../leaves/leave-request.entity';

/**
 * R1 (#263) — onay kararının SUNUCUDA hesaplanan etki yüzeyi.
 *
 * Bu yüzey okunabilir adlar taşır (öğretmen/sınıf/ders/oda/zaman) ve ham UUID
 * göstermez; operatör kararı adlarla denetleyebilir. Ölçüm/kuyruk yüzeyi
 * (`LeaveImpactResponse`, `DAILY_OPERATIONS_QUEUE_*`) bilinçli olarak PII-free
 * kalır ve kendi sözleşmesiyle pinlenir; iki yüzey ayrıdır.
 *
 * KVKK: adlar yalnız yanıt gövdesinde yaşar. Audit metadata'sı ve outbox
 * payload'ı ad/iletişim taşımaz (bkz. `audit-metadata-policy`).
 */
export const LEAVE_APPROVAL_LESSON_FIELDS = [
  'lessonLabel', 'courseLabel', 'groupLabel', 'roomLabel',
  'timeLabel', 'occurrenceLabel', 'teacherLabel', 'stateLabel',
] as const;

export const LEAVE_APPROVAL_CANDIDATE_FIELDS = [
  'teacherLabel', 'branchLabel', 'availabilityLabel',
] as const;

export const LEAVE_APPROVAL_RESPONSE_FIELDS = [
  'coverageStatus', 'coverageLabel', 'impactedLessonCount', 'resolvedLessonCount',
  'openLessonCount', 'zeroImpact', 'zeroImpactReason', 'zeroImpactDetail', 'lessons',
  'candidates', 'finalized', 'gapDetail', 'items', 'decisionSupportOnly',
  'decisionSupportDetail',
] as const;

/** Ham kimlik/jargon sızıntısını yakalayan sözleşme parçaları. */
export const LEAVE_APPROVAL_FORBIDDEN_FIELD_FRAGMENTS = [
  'uuid', 'name', 'email', 'phone', 'parent', 'guardian', 'token', 'cookie',
  'leaveDetail', 'healthDetail', 'requestBody', 'responseBody',
] as const;

/**
 * Ham kimlik alan adı deseni: `...Id`, `...Ids`, `...Uuid`.
 *
 * `decidedAtLabel` gibi okunabilir alanlar bu desene UYMAZ (sonda `Id` yoktur);
 * `etag` ise If-Match için zorunlu opak sürüm jetonudur ve gövdede gösterilmez.
 */
export const LEAVE_APPROVAL_RAW_IDENTIFIER_FIELD_PATTERN = /(ids?|uuid)$/i;

export const LEAVE_ZERO_IMPACT_CODES = [
  'NO_PUBLISHED_SCHEDULE_EVENT', 'NO_OVERLAPPING_OCCURRENCE',
] as const;
export type LeaveZeroImpactCode = (typeof LEAVE_ZERO_IMPACT_CODES)[number];

export const NO_LESSON_LABEL_FALLBACK = 'Ders bilgisi çözümlenemedi';
export const NO_GROUP_LABEL_FALLBACK = 'Sınıf bilgisi çözümlenemedi';
export const NO_ROOM_LABEL_FALLBACK = 'Oda belirtilmedi';
export const NO_TEACHER_LABEL_FALLBACK = 'Öğretmen bilgisi çözümlenemedi';
export const NO_BRANCH_LABEL_FALLBACK = 'Şube bilgisi çözümlenemedi';
export const CANDIDATE_AVAILABLE_LABEL = 'Şu an uygun';
export const CANDIDATE_DECISION_SUPPORT_DETAIL =
  'Aday listesi yalnız karar desteğidir; yedek görevlendirme ayrı işlemle yapılır.';
export const CANDIDATE_GAP_DETAIL =
  'Öğretmen-ders uygunluk kaynağı hazır olmadığı için aday listesi kesinleşmedi.';

export type LeaveApprovalImpactLesson = Readonly<{
  lessonLabel: string; courseLabel: string; groupLabel: string; roomLabel: string;
  timeLabel: string; occurrenceLabel: string; teacherLabel: string; stateLabel: string;
}>;

export type LeaveApprovalCandidate = Readonly<{
  teacherLabel: string; branchLabel: string; availabilityLabel: string;
}>;

export type LeaveApprovalCandidates = Readonly<{
  finalized: boolean;
  gapDetail: string | null;
  decisionSupportOnly: true;
  decisionSupportDetail: string;
  items: readonly LeaveApprovalCandidate[];
}>;

export type LeaveApprovalImpact = Readonly<{
  coverageStatus: LeaveCoverageStatus;
  coverageLabel: string;
  impactedLessonCount: number;
  resolvedLessonCount: number;
  openLessonCount: number;
  zeroImpact: boolean;
  zeroImpactReason: LeaveZeroImpactCode | null;
  zeroImpactDetail: string | null;
  lessons: readonly LeaveApprovalImpactLesson[];
  candidates: LeaveApprovalCandidates;
}>;

/** Etki hesabına giren izin alanları (kiracı kapsamı çağıran tarafta doğrulanır). */
export type LeaveApprovalImpactRequest = Readonly<{
  id: string; tenantId: string; branchId: string; teacherId: string;
  decisionStatus: LeaveDecisionStatus; coverageStatus: LeaveCoverageStatus;
  startsAt: Date; endsAt: Date; version: number;
}>;

export type LeaveApprovalImpactResult = Readonly<{
  coverageStatus: LeaveCoverageStatus;
  impact: LeaveApprovalImpact;
}>;

export function coverageLabel(status: LeaveCoverageStatus): string {
  switch (status) {
    case LeaveCoverageStatus.NOT_REQUIRED:
      return 'Karşılık gerekmiyor';
    case LeaveCoverageStatus.UNRESOLVED:
      return 'Karşılık bekliyor';
    case LeaveCoverageStatus.PARTIALLY_COVERED:
      return 'Kısmen karşılandı';
    default:
      return 'Karşılandı';
  }
}

export function lessonStateLabel(state: 'open' | 'resolved'): string {
  return state === 'resolved' ? 'Karşılandı' : 'Açık';
}

export function formatOccurrenceLabel(occurrenceDate: string): string {
  const [year, month, day] = occurrenceDate.split('-');
  if (!year || !month || !day) return occurrenceDate;
  return `${day}.${month}.${year}`;
}

export function formatTimeLabel(startTime: string, endTime: string): string {
  return `${startTime.slice(0, 5)}–${endTime.slice(0, 5)}`;
}

export function composeLessonLabel(input: {
  courseLabel: string;
  groupLabel: string;
  timeLabel: string;
  occurrenceLabel: string;
}): string {
  return [input.courseLabel, input.groupLabel, input.timeLabel, input.occurrenceLabel]
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(' · ');
}

export function zeroImpactDetailFor(code: LeaveZeroImpactCode): string {
  if (code === 'NO_OVERLAPPING_OCCURRENCE') {
    return (
      'Yayınlanmış ders programında izin dönemine denk gelen oturum bulunmadığından ' +
      'etkilenen ders yok; ders karşılığı gerekmiyor.'
    );
  }
  return (
    'Bu öğretmen için izin döneminde yayınlanmış ders programı kaydı bulunmadığından ' +
    'etkilenen ders yok; ders karşılığı gerekmiyor.'
  );
}
