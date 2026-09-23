/**
 * #266 R5 — Granüler + versioned + withdrawable consent politikası.
 *
 * KVKK onay kararı **sürüm bazlıdır**: her `consent_type` için yalnızca en
 * yüksek `version` satırı "yöneten" kayıttır. Geri çekme (revoked_at) veya süre
 * dolması (expires_at) yöneten sürümde gerçekleştiğinde, aynı tipin eski
 * (onaylı) sürümü kanalı AÇMAZ — aksi hâlde bir geri çekme sessizce
 * etkisiz kalırdı (KVKK açısından kabul edilemez).
 *
 * Fail-closed davranışlar:
 * - Yöneten sürüm `approved` değilse, iptal edilmişse ya da süresi dolmuşsa →
 *   kanal kullanılamaz.
 * - Aynı en yüksek sürümde çelişen birden fazla satır varsa (legacy veri) →
 *   karar REDDEDİLİR (`ambiguous: true`).
 * - Hiç satır yoksa → sürüm izi `null` (karar zaten bloke).
 *
 * PII: bu modül yalnız sürüm/statü alanlarıyla çalışır; iletişim verisi,
 * isim veya serbest metin görmez.
 */

export const PARENT_NOTIFICATION_CONSENT_TYPE = 'parent_notification';

export const NOTIFICATION_CONSENT_TYPES = [
  'parent_notification',
  'sms_notification',
  'whatsapp_notification',
  'email_notification',
] as const;

export type NotificationConsentType = (typeof NOTIFICATION_CONSENT_TYPES)[number];

/** Kanal → kanal bazlı onay tipi (granüler consent modeli). */
export const CHANNEL_CONSENT_TYPE: Readonly<Record<string, NotificationConsentType>> = {
  sms: 'sms_notification',
  whatsapp: 'whatsapp_notification',
  email: 'email_notification',
};

export type ConsentDecisionReason = 'blocked_consent' | 'blocked_channel_consent';

/**
 * Onay satırının yaşam döngüsü durumu (PII taşımaz; API/audit yüzeyinde
 * gösterilebilir). `revoked` geri çekilmiş, `expired` süresi geçmiş,
 * `not_approved` hiç onaylanmamış (pending/rejected) satırı anlatır.
 */
export type ConsentLifecycleState =
  | 'active'
  | 'revoked'
  | 'expired'
  | 'not_approved'
  | 'invalid';

/** Onay satırının karar için gerekli (PII'siz) projeksiyonu. */
export type ConsentRowSnapshot = Readonly<{
  consentType: string;
  version: number;
  status: string;
  revokedAt: Date | null;
  expiresAt: Date | null;
}>;

export type NotificationConsentDecision = Readonly<{
  allowed: boolean;
  reason: ConsentDecisionReason | null;
  /**
   * Kararın dayandığı **yöneten sürüm** (outbox `consent_version` izi).
   *
   * - `blocked_channel_consent` → kanal onayının yöneten sürümü (kanal kapısı
   *   kapandı; izi kanal satırında tutulur),
   * - diğer tüm hâller → `parent_notification` yöneten sürümü (bildirimin hukuki
   *   dayanağı).
   *
   * Karar yalnız parent sürümünü yönetiyorsa kanal sürümüne düşülmez; hiç satır
   * yoksa `null` (izlenecek bir onay sürümü de yoktur — karar bloke).
   */
  consentVersion: number | null;
  /** Tip bazlı iz: hangi onay tipinin hangi sürümü yönetiyor. */
  versions: Readonly<{
    parentNotification: number | null;
    channelNotification: number | null;
  }>;
  /** Aynı en yüksek sürümde çelişen kayıt var mı (fail-closed tetikleyicisi). */
  ambiguous: boolean;
}>;

/** Bir onay satırı verilen anda yürürlükte mi (approved + iptal edilmemiş + süresi dolmamış). */
export function isConsentActiveAt(row: ConsentRowSnapshot, now: Date): boolean {
  if (!isVersionValid(row.version)) return false;
  if (row.status !== 'approved') return false;
  if (row.revokedAt !== null) return false;
  if (row.expiresAt === null) return true;
  return new Date(row.expiresAt).getTime() > now.getTime();
}

/** Yaşam döngüsü durumunu (PII'siz) tek satır için özetler. */
export function describeConsentLifecycle(
  row: ConsentRowSnapshot,
  now: Date,
): ConsentLifecycleState {
  if (!isVersionValid(row.version) || Number.isNaN(new Date(row.expiresAt ?? 0).getTime())) {
    return 'invalid';
  }
  if (row.revokedAt !== null) return 'revoked';
  if (row.status !== 'approved') return 'not_approved';
  if (row.expiresAt !== null && new Date(row.expiresAt).getTime() <= now.getTime()) {
    return 'expired';
  }
  return 'active';
}

/**
 * Sürüm fail-closed doğrulaması: `version` pozitif tam sayı olmalıdır
 * (migration CHECK `version >= 1`). Bozuk sürüm karar için kullanılamaz —
 * aksi hâlde `Math.max` NaN üretip "en yüksek sürüm" seçimi sessizce bozulurdu.
 */
function isVersionValid(version: number): boolean {
  return Number.isInteger(version) && version >= 1;
}

type GoverningConsent = Readonly<{
  /** En yüksek sürüm; hiç satır yoksa null. */
  latest: ConsentRowSnapshot | null;
  /** Yöneten sürüm yürürlükte mi. */
  active: boolean;
  /** Aynı en yüksek sürümde çelişki ya da bozuk sürüm (fail-closed tetikleyicisi). */
  ambiguous: boolean;
}>;

/**
 * Bir tipin yöneten sürümünü seçer. Aynı sürümde birden fazla satır varsa
 * çelişki aranır: satırlardan biri yürürlükte değilse fail-closed olarak
 * `active: false` döner. Geçersiz sürüm taşıyan satır varsa karar reddedilir.
 */
export function governingConsent(
  rows: readonly ConsentRowSnapshot[],
  consentType: string,
  now: Date,
): GoverningConsent {
  const ofType = rows.filter((row) => row.consentType === consentType);
  if (ofType.length === 0) return { latest: null, active: false, ambiguous: false };

  if (ofType.some((row) => !isVersionValid(row.version))) {
    // Bozuk/eksik sürüm: hangi sürümün yöneteceği bilinemez → fail-closed.
    return { latest: ofType[0], active: false, ambiguous: true };
  }

  const maxVersion = Math.max(...ofType.map((row) => row.version));
  const governing = ofType.filter((row) => row.version === maxVersion);
  const activeFlags = governing.map((row) => isConsentActiveAt(row, now));
  const ambiguous = new Set(activeFlags).size > 1;

  return {
    latest: governing[0],
    active: !ambiguous && activeFlags.every(Boolean),
    ambiguous,
  };
}

/**
 * Bildirim kararı: `parent_notification` (genel bildirim onayı) **ve** kanala
 * özel onay tipi (varsa) yöneten sürümlerinde yürürlükte olmalıdır.
 */
export function evaluateNotificationConsent(input: {
  rows: readonly ConsentRowSnapshot[];
  channel: string;
  now?: Date;
}): NotificationConsentDecision {
  const now = input.now ?? new Date();
  const channelConsentType = CHANNEL_CONSENT_TYPE[input.channel] ?? null;

  const parent = governingConsent(input.rows, PARENT_NOTIFICATION_CONSENT_TYPE, now);
  const channel =
    channelConsentType === null
      ? { latest: null, active: true, ambiguous: false }
      : governingConsent(input.rows, channelConsentType, now);

  const versions = {
    parentNotification: parent.latest?.version ?? null,
    channelNotification: channel.latest?.version ?? null,
  };

  const blockedReason: ConsentDecisionReason | null = !parent.active
    ? 'blocked_consent'
    : !channel.active
      ? 'blocked_channel_consent'
      : null;

  // Sürüm izi: kararı veren kapının yöneten sürümü (kanal kapısı kapandıysa
  // kanal sürümü, aksi hâlde parent sürümü). Eski sürüme düşülmez — aksi hâlde
  // iz, kararı vermeyen bir satırı işaret ederdi.
  const consentVersion =
    blockedReason === 'blocked_channel_consent'
      ? versions.channelNotification
      : versions.parentNotification;

  return {
    allowed: blockedReason === null,
    reason: blockedReason,
    consentVersion,
    versions,
    ambiguous: parent.ambiguous || channel.ambiguous,
  };
}

/** Onay kapısı tanımlı bildirim kanalları (granüler consent matrisi). */
export const CONSENT_GATED_CHANNELS = ['sms', 'whatsapp', 'email'] as const;

export type ConsentGatedChannel = (typeof CONSENT_GATED_CHANNELS)[number];

/**
 * Onay yüzeyi için kanal bazlı karar özeti (PII taşımaz: izin/neden/sürüm).
 * Bildirim gönderim kapısı (`blocked_*` nedenleri) ile aynı fonksiyonu kullanır,
 * böylece okunan karar ile gönderim kararı ayrışamaz.
 */
export function summarizeNotificationChannels(
  rows: readonly ConsentRowSnapshot[],
  now: Date = new Date(),
): Readonly<Record<ConsentGatedChannel, NotificationConsentDecision>> {
  return {
    sms: evaluateNotificationConsent({ rows, channel: 'sms', now }),
    whatsapp: evaluateNotificationConsent({ rows, channel: 'whatsapp', now }),
    email: evaluateNotificationConsent({ rows, channel: 'email', now }),
  };
}
