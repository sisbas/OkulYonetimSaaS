import { EntityManager } from 'typeorm';

/** `parent_notification` temel onay türü (#266). */
export const PARENT_NOTIFICATION_CONSENT_TYPE = 'parent_notification';

/** Kanal → kanal bazlı onay türü eşleşmesi. */
export const CHANNEL_CONSENT_TYPES: Readonly<
  Record<string, 'sms_notification' | 'whatsapp_notification' | 'email_notification'>
> = {
  sms: 'sms_notification',
  whatsapp: 'whatsapp_notification',
  email: 'email_notification',
};

/** Karar nedenleri (outbox `reason` sütunuyla aynı sözleşme). */
export const BLOCKED_CONSENT = 'blocked_consent';
export const BLOCKED_CHANNEL_CONSENT = 'blocked_channel_consent';

/** `kvkk_consent_subjects.subject_type` CHECK değeri. */
export type ConsentSubjectType =
  | 'student'
  | 'parent'
  | 'teacher'
  | 'user'
  | 'other';

export type ConsentSubjectRef = Readonly<{
  tenantId: string;
  subjectType: ConsentSubjectType;
  /** Subject'in domain referansı (örn. öğrenci UUID'si). */
  subjectRefId: string;
}>;

export type ConsentDecision = Readonly<{
  approved: boolean;
  reason: typeof BLOCKED_CONSENT | typeof BLOCKED_CHANNEL_CONSENT | null;
  /** Kararın dayandığı güncel consent satırının kimliği. */
  consentId: string | null;
  /** Kararın dayandığı güncel consent satırının lineage version'ı. */
  consentVersion: number | null;
}>;

type ConsentRow = {
  id: string;
  consent_type: string;
  status: string;
  revoked_at: Date | null;
  expires_at: Date | null;
  version: number | null;
  created_at: Date | null;
};

/**
 * Authoritative versioned consent authority/resolver (#266 N1b).
 *
 * Sözleşme:
 * - **Tek karar noktası**: bildirim onayı yalnız bu authority
 *   üzerinden çözülür; caller'lar kendi SQL'leriyle onay
 *   çıkarmaz.
 * - **Versioned lineage**: özne başına `(consent_type)` bazında
 *   en yüksek `version`'lı satır güncel karardır. Eski satırlar
 *   (version eksik/1) için `created_at`, sonra `id` tiebreak'i
 *   deterministik sıralama sağlar.
 * - **Resurrection düzeltmesi**: geçmişteki `approved` satırı,
 *   üzerindeki daha yeni bir `revoked`/`rejected`/`expired`
 *   satırı karşılığında onay vermeyi **durdurur** (eski
 *   `rows.some(approved)` davranışının tersi).
 * - **Fail-closed**: özne/subject bulunamaz, inactive veya hiçbir
 *   consent satırı yoksa karar `blocked_consent` olur.
 * - **Tenant-safe**: sorgu tenant + subject predicate'leriyle
 *   zorunludur; cross-tenant consent görünmez.
 */
export class ConsentAuthority {
  async resolveNotificationConsent(
    entityManager: EntityManager,
    input: Readonly<{ subject: ConsentSubjectRef; channel: string }>,
  ): Promise<ConsentDecision> {
    const channelType = CHANNEL_CONSENT_TYPES[input.channel] ?? null;
    const rows = (await entityManager.query(
      `SELECT c.id, c.consent_type, c.status, c.revoked_at, c.expires_at,
              c.version, c.created_at
         FROM kvkk_consents c
         JOIN kvkk_consent_subjects s
           ON s.id = c.subject_id AND s.tenant_id = c.tenant_id
        WHERE c.tenant_id = $1
          AND s.subject_ref_id = $2
          AND s.subject_type = $3
          AND s.status = 'active'
          AND c.consent_type IN ('parent_notification', $4)`,
      [
        input.subject.tenantId,
        input.subject.subjectRefId,
        input.subject.subjectType,
        channelType,
      ],
    )) as ConsentRow[];

    const latest = this.latestByConsentType(rows);
    const parent = latest.get(PARENT_NOTIFICATION_CONSENT_TYPE);
    if (parent === undefined || !isApprovedRow(parent)) {
      return {
        approved: false,
        reason: BLOCKED_CONSENT,
        consentId: parent?.id ?? null,
        consentVersion: parent?.version ?? null,
      };
    }

    if (channelType !== null) {
      const channelRow = latest.get(channelType);
      if (channelRow === undefined || !isApprovedRow(channelRow)) {
        return {
          approved: false,
          reason: BLOCKED_CHANNEL_CONSENT,
          consentId: channelRow?.id ?? null,
          consentVersion: channelRow?.version ?? null,
        };
      }
    }

    return {
      approved: true,
      reason: null,
      consentId: parent.id,
      consentVersion: parent.version ?? null,
    };
  }

  /**
   * Her `consent_type` için güncel (max-version) satırı seçer.
   * Sıralama: `version DESC` → `created_at DESC` → `id DESC`.
   */
  private latestByConsentType(rows: readonly ConsentRow[]): Map<string, ConsentRow> {
    const latest = new Map<string, ConsentRow>();
    for (const row of rows) {
      const current = latest.get(row.consent_type);
      if (current === undefined || this.isNewer(row, current)) {
        latest.set(row.consent_type, row);
      }
    }
    return latest;
  }

  private isNewer(candidate: ConsentRow, current: ConsentRow): boolean {
    const candidateVersion = candidate.version ?? 1;
    const currentVersion = current.version ?? 1;
    if (candidateVersion !== currentVersion) {
      return candidateVersion > currentVersion;
    }
    const candidateAt = candidate.created_at
      ? new Date(candidate.created_at).getTime()
      : 0;
    const currentAt = current.created_at
      ? new Date(current.created_at).getTime()
      : 0;
    if (candidateAt !== currentAt) {
      return candidateAt > currentAt;
    }
    return candidate.id > current.id;
  }
}

function isApprovedRow(row: ConsentRow | undefined): boolean {
  if (row === undefined) {
    return false;
  }
  return (
    row.status === 'approved' &&
    row.revoked_at === null &&
    (row.expires_at === null ||
      new Date(row.expires_at).getTime() > Date.now())
  );
}
