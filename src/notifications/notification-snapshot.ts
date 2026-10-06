/**
 * #266 N1c — Immutable notification snapshot sözleşmesi.
 *
 * Bildirim kuyruğa alındığı anda kaynak/iletişim/onay/şablon
 * durumunu kalıcı, değişmez olarak saklar. Bir kez yazıldıktan
 * sonra güncellenmez; denetim ve operatör onayı için o anki
 * durumu korur.
 *
 * KVKK: snapshot ham PII taşımaz. Öğrenci/oturum UUID'leri
 * pseudonymize edilmiştir; iletişim kanalı ve maskelenmiş
 * gösterim dışında ham değer içermez.
 */

/** Pseudonymize edilmiş kaynak referansları. */
export type SnapshotSource = Readonly<{
  /** Pseudonymize edilmiş oturum referansı. */
  sessionRef: string;
  /** Pseudonymize edilmiş öğrenci referansı. */
  studentRef: string;
  /** Yoklama durumu (örn. 'absent'). */
  attendanceStatus: string;
  /** Oturum durumu (örn. 'locked'). */
  sessionStatus: string;
}>;

/** İletişim anlık görüntüsü (ham PII taşımaz). */
export type SnapshotContact = Readonly<{
  /** Bildirim kanalı. */
  channel: string;
  /** Maskelenmiş iletişim gösterimi (örn. '+90 532 *** ** 12'). */
  maskedDisplay: string | null;
  /** İletişim noktası doğrulama durumu. */
  verificationStatus: string | null;
}>;

/** Onay kararı anlık görüntüsü. */
export type SnapshotConsent = Readonly<{
  /** Onay verildi mi? */
  approved: boolean;
  /** Engel kodu (onay verilmediyse). */
  reason: string | null;
  /** Kararın dayandığı consent satırı kimliği. */
  consentId: string | null;
  /** Kararın dayandığı consent sürümü. */
  consentVersion: number | null;
}>;

/** Şablon anlık görüntüsü. */
export type SnapshotTemplate = Readonly<{
  /** Olay türü (örn. 'attendance.absent.locked'). */
  eventType: string;
  /** Kanal. */
  channel: string;
  /** Şablon referansı (eventType:channel). */
  templateRef: string;
}>;

/**
 * Immutable notification snapshot.
 *
 * Bir kez oluşturulduktan sonra değiştirilemez. Tüm alanlar
 * salt-okunur (readonly) ve ham PII içermez.
 */
export type NotificationSnapshot = Readonly<{
  /** Kaynak anlık görüntüsü. */
  source: SnapshotSource;
  /** İletişim anlık görüntüsü. */
  contact: SnapshotContact;
  /** Onay anlık görüntüsü. */
  consent: SnapshotConsent;
  /** Şablon anlık görüntüsü. */
  template: SnapshotTemplate;
  /** Snapshot oluşturulma zamanı (ISO 8601). */
  enqueuedAt: string;
}>;

/**
 * Snapshot builder — enqueue sırasında çağrılır.
 *
 * Tüm pseudonymize edilmiş referanslar ve maskelenmiş değerler
 * burada üretilir; ham PII asla snapshot'a yazılmaz.
 */
export function buildNotificationSnapshot(input: Readonly<{
  sessionRef: string;
  studentRef: string;
  attendanceStatus: string;
  sessionStatus: string;
  channel: string;
  maskedDisplay?: string | null;
  verificationStatus?: string | null;
  consentApproved: boolean;
  consentReason: string | null;
  consentId: string | null;
  consentVersion: number | null;
  eventType: string;
  enqueuedAt?: Date;
}>): NotificationSnapshot {
  const snapshot: NotificationSnapshot = {
    source: Object.freeze({
      sessionRef: input.sessionRef,
      studentRef: input.studentRef,
      attendanceStatus: input.attendanceStatus,
      sessionStatus: input.sessionStatus,
    }),
    contact: Object.freeze({
      channel: input.channel,
      maskedDisplay: input.maskedDisplay ?? null,
      verificationStatus: input.verificationStatus ?? null,
    }),
    consent: Object.freeze({
      approved: input.consentApproved,
      reason: input.consentReason,
      consentId: input.consentId,
      consentVersion: input.consentVersion,
    }),
    template: Object.freeze({
      eventType: input.eventType,
      channel: input.channel,
      templateRef: `${input.eventType}:${input.channel}`,
    }),
    enqueuedAt: (input.enqueuedAt ?? new Date()).toISOString(),
  };
  return Object.freeze(snapshot);
}
