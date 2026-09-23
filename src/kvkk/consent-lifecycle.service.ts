import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';

import {
  TRANSACTIONAL_AUDIT_WRITER,
  TransactionalAuditWriter,
} from '../common/audit/transactional-audit-writer';
import { RedactionReceipt } from '../common/audit/transactional-audit.types';
import { auditSubjectRefUuid } from './consent-audit-reference';
import { maskContactField } from './contact-masking';
import {
  ConsentGatedChannel,
  ConsentLifecycleState,
  ConsentRowSnapshot,
  NOTIFICATION_CONSENT_TYPES,
  NotificationConsentDecision,
  NotificationConsentType,
  describeConsentLifecycle,
  summarizeNotificationChannels,
} from './consent-versioning';

/**
 * #266 R5 — Consent yaşam döngüsü (granüler + versioned + **withdrawable**).
 *
 * - **Geri çekme**: ilgili `consent_type`'ın yöneten (en yüksek `version`)
 *   satırı `revoked` yapılır, `kvkk_consent_events`'e olay yazılır ve durable
 *   audit (`dataprotection.consent.revoked`) **aynı transaction'da** yazılır
 *   (constitution Madde III). Geri çekilen sürümden sonra aynı tipin eski
 *   (onaylı) sürümü kanalı açmaz — karar sürüm bazlıdır
 *   (`src/kvkk/consent-versioning.ts`).
 * - **Hassas okuma**: öğrencinin onay durumu okunurken yalnızca **maskeli**
 *   iletişim alanları döner; değer zaten maskeli değilse okuma yolunda ikinci kez
 *   maskelenir (`src/kvkk/contact-masking.ts`) ve durable audit'e
 *   `redactionReceipt` kanıtıyla yazılır (ham iletişim verisi yanıta/log'a/audit'e
 *   girmez).
 * - **Süre (expires_at)**: geçmiş `expires_at` taşıyan yöneten sürüm yürürlükte
 *   sayılmaz → kanal kullanılamaz (fail-closed). Karar anında değerlendirilir;
 *   toplu "expired" damgalama R6/retention dilimine bırakılmıştır.
 * - **Tenant izolasyonu**: tüm sorgular `tenant_id` ile filtrelidir; kiracı
 *   istek gövdesinden/path'inden TÜRETİLMEZ (servis yalnız context'i alır).
 * - Ham kimlik log/audit yüzeyine yazılmaz: audit `entityId`'si öğrenci
 *   UUID'sinden türetilen deterministik, geri döndürülemez referanstır
 *   (`src/kvkk/consent-audit-reference.ts`); log satırı yalnız
 *   `consentType` + `version` taşır.
 */

export type ConsentLifecycleOutcome = 'revoked' | 'no_change' | 'not_found';

export type WithdrawConsentResult = Readonly<{
  outcome: ConsentLifecycleOutcome;
  consentType: NotificationConsentType;
  version: number | null;
  revokedAt: string | null;
}>;

export type StudentConsentStatusRow = Readonly<{
  consentType: string;
  version: number;
  /** Yaşam döngüsü durumu (active/revoked/expired/not_approved/invalid). */
  state: ConsentLifecycleState;
  status: string;
  revokedAt: string | null;
  expiresAt: string | null;
  /** Yalnız maskeli değerler (ham iletişim verisi asla dönmez). */
  contactPhoneMasked: string | null;
  contactEmailMasked: string | null;
  /**
   * Okuma yolunda yeniden maskelenen (ham olduğu yakalanan) alan adları.
   * PII taşımaz; yalnız "maskeleme fiilen çalıştı" kanıtıdır.
   */
  remaskedFields: readonly string[];
}>;

/** Okuma sonucu: ham iletişim verisi yok, yalnız maskeli değer + onay izi. */
export type StudentConsentStatus = Readonly<{
  subjectStatus: string | null;
  consents: readonly StudentConsentStatusRow[];
  /** Kanal bazlı karar özeti (bildirim kapısıyla aynı hesap). */
  channels: Readonly<Record<ConsentGatedChannel, NotificationConsentDecision>>;
  receipt: RedactionReceipt;
  evaluatedAt: string;
}>;

export interface ConsentLifecycleActor {
  actorUserId: string;
  actorSessionId: string | null;
  requestId: string;
}

type ConsentRow = {
  id: string;
  consent_type: string;
  version: number;
  status: string;
  revoked_at: Date | null;
  expires_at: Date | null;
  subject_status: string;
  contact_phone_masked: string | null;
  contact_email_masked: string | null;
};

/** Onay satırı başına değerlendirilen PII'siz alan sayısı. */
const NON_PII_FIELDS_PER_ROW = 5;

@Injectable()
export class ConsentLifecycleService {
  private readonly logger = new Logger(ConsentLifecycleService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(TRANSACTIONAL_AUDIT_WRITER)
    private readonly auditWriter: TransactionalAuditWriter,
  ) {}

  /**
   * Öğrencinin bildirim onaylarını sürümleriyle döndürür (**hassas okuma**).
   * Dönen iletişim alanları maskelidir; okuma durable audit'e yazılır.
   */
  async listStudentConsentStatus(input: {
    tenantId: string;
    studentId: string;
    actor: ConsentLifecycleActor;
  }): Promise<StudentConsentStatus> {
    return this.dataSource.transaction(async (manager) => {
      const rows = await this.selectConsentRows(manager, input.tenantId, input.studentId);
      const evaluatedAt = new Date();
      const consents = rows.map((row) => toStatusRow(row, evaluatedAt));
      const receipt = buildReadReceipt(consents);
      const channels = summarizeNotificationChannels(
        rows.map(toSnapshot),
        evaluatedAt,
      );

      // KVKK: hassas okuma denetlenebilir olmalı (maskeleme kanıtıyla). Audit
      // entityId'si ham öğrenci UUID'si DEĞİL, ondan türetilen referanstır.
      await this.auditWriter.write(manager, 'dataprotection.export.redacted', {
        schemaVersion: 1,
        tenantId: input.tenantId,
        actorUserId: input.actor.actorUserId,
        actorSessionId: input.actor.actorSessionId,
        requestId: input.actor.requestId,
        entityType: 'dataprotection',
        entityId: auditSubjectRefUuid({
          tenantId: input.tenantId,
          studentId: input.studentId,
        }),
        result: 'success',
        changedFields: ['purpose', 'format', 'recordCount', 'redactionStrategy'],
        redactionReceipt: receipt,
      });

      return {
        subjectStatus: rows[0]?.subject_status ?? null,
        consents,
        channels,
        receipt,
        evaluatedAt: evaluatedAt.toISOString(),
      };
    });
  }

  /**
   * Yöneten onay sürümünü geri çeker. Domain mutasyonu + consent olayı +
   * durable audit aynı transaction'dadır; koşullu `UPDATE` sayesinde eşzamanlı
   * iki geri çekme **tek** geçiş üretir (ikinci çağrı `no_change`).
   */
  async withdrawConsent(input: {
    tenantId: string;
    studentId: string;
    consentType: NotificationConsentType;
    actor: ConsentLifecycleActor;
  }): Promise<WithdrawConsentResult> {
    if (!NOTIFICATION_CONSENT_TYPES.includes(input.consentType)) {
      throw new TypeError(
        `consentType must be one of: ${NOTIFICATION_CONSENT_TYPES.join(', ')}`,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const rows = await this.selectConsentRows(
        manager,
        input.tenantId,
        input.studentId,
        input.consentType,
      );
      const governing = rows[0];
      if (!governing) {
        return {
          outcome: 'not_found' as const,
          consentType: input.consentType,
          version: null,
          revokedAt: null,
        };
      }

      const revokedAt = new Date();
      const updated = (await manager.query(
        `UPDATE kvkk_consents
            SET status = 'revoked', revoked_at = $4, updated_at = $4
          WHERE tenant_id = $1 AND id = $2 AND version = $3 AND status <> 'revoked'
          RETURNING version`,
        [input.tenantId, governing.id, governing.version, revokedAt],
      )) as Array<{ version?: number }>;

      if (updated.length === 0) {
        // Eşzamanlı geri çekme ya da sürüm değişimi: yeni geçiş yok → ikinci
        // audit/olay yazılmaz (idempotent, çift kayıt üretmez).
        return {
          outcome: 'no_change' as const,
          consentType: input.consentType,
          version: Number(governing.version),
          revokedAt: governing.revoked_at
            ? new Date(governing.revoked_at).toISOString()
            : null,
        };
      }

      await manager.query(
        `INSERT INTO kvkk_consent_events
           (tenant_id, consent_id, actor_user_id, event_type, request_id, metadata_json)
         VALUES ($1, $2, $3, 'revoked', $4, $5::jsonb)`,
        [
          input.tenantId,
          governing.id,
          input.actor.actorUserId,
          input.actor.requestId,
          JSON.stringify({ schemaVersion: 1, version: Number(governing.version) }),
        ],
      );

      // Durable audit: domain mutasyonuyla AYNI transaction (KVKK madde 12).
      await this.auditWriter.write(manager, 'dataprotection.consent.revoked', {
        schemaVersion: 1,
        tenantId: input.tenantId,
        actorUserId: input.actor.actorUserId,
        actorSessionId: input.actor.actorSessionId,
        requestId: input.actor.requestId,
        entityType: 'dataprotection',
        // entityId = consent satırı: sürüm izi satırın kendisinde durur.
        entityId: governing.id,
        result: 'success',
        changedFields: ['purpose', 'legalBasis'],
        redactionReceipt: buildMutationReceipt(revokedAt),
      });

      this.logger.log(
        JSON.stringify({
          event: 'kvkk.consent.withdrawn',
          tenantId: input.tenantId,
          consentType: input.consentType,
          consentVersion: Number(governing.version),
          outcome: 'revoked',
        }),
      );

      return {
        outcome: 'revoked' as const,
        consentType: input.consentType,
        version: Number(governing.version),
        revokedAt: revokedAt.toISOString(),
      };
    });
  }

  /**
   * Tenant-scoped onay okuması. `consentType` verilirse o tipin **yöneten**
   * (en yüksek sürüm) satırı başta olmak üzere döner.
   *
   * Geri çekmenin her koşulda mümkün olması için `subject.status` filtrelenmez
   * (KVKK: veri sahibi onayını geri çekebilmelidir); subject durumu yalnız
   * bilgi olarak döner.
   */
  private async selectConsentRows(
    manager: EntityManager,
    tenantId: string,
    studentId: string,
    consentType?: NotificationConsentType,
  ): Promise<ConsentRow[]> {
    const types = consentType ? [consentType] : [...NOTIFICATION_CONSENT_TYPES];
    return (await manager.query(
      `SELECT c.id,
              c.consent_type,
              c.version,
              c.status,
              c.revoked_at,
              c.expires_at,
              s.status AS subject_status,
              s.contact_phone_masked,
              s.contact_email_masked
         FROM kvkk_consents c
         JOIN kvkk_consent_subjects s
           ON s.id = c.subject_id AND s.tenant_id = c.tenant_id
        WHERE c.tenant_id = $1
          AND s.subject_ref_id = $2
          AND s.subject_type = 'student'
          AND c.consent_type = ANY($3::varchar[])
        ORDER BY c.consent_type ASC, c.version DESC`,
      [tenantId, studentId, types],
    )) as ConsentRow[];
  }
}

function toSnapshot(row: ConsentRow): ConsentRowSnapshot {
  return {
    consentType: row.consent_type,
    version: Number(row.version),
    status: row.status,
    revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
    expiresAt: row.expires_at ? new Date(row.expires_at) : null,
  };
}

function toStatusRow(row: ConsentRow, now: Date): StudentConsentStatusRow {
  const snapshot = toSnapshot(row);
  const phone = maskContactField(row.contact_phone_masked, 'phone');
  const email = maskContactField(row.contact_email_masked, 'email');
  const remaskedFields: string[] = [];
  if (phone.remasked) remaskedFields.push('contactPhone');
  if (email.remasked) remaskedFields.push('contactEmail');

  return {
    consentType: snapshot.consentType,
    version: snapshot.version,
    state: describeConsentLifecycle(snapshot, now),
    status: snapshot.status,
    revokedAt: snapshot.revokedAt ? snapshot.revokedAt.toISOString() : null,
    expiresAt: snapshot.expiresAt ? snapshot.expiresAt.toISOString() : null,
    contactPhoneMasked: phone.value,
    contactEmailMasked: email.value,
    remaskedFields,
  };
}

/**
 * Okuma kanıtı — alan bazlı muhasebe (KVKK madde 12):
 *
 * - `redactedFieldCount`: yanıtta **PII taşıyan ve maskelenmiş** alanlar (dolu
 *   telefon/e-posta). Ham değer yakalanıp maskelendiyse de buradadır.
 * - `skippedFieldCount`: PII taşımayan alanlar (tip, sürüm, durum, tarihler) ve
 *   boş iletişim alanları.
 * - Değişmez: `redactedFieldCount + skippedFieldCount === evaluatedFieldCount`
 *   ve `evaluatedFieldCount === satır sayısı * 7`.
 */
function buildReadReceipt(consents: readonly StudentConsentStatusRow[]): RedactionReceipt {
  const maskedContactFields = consents.reduce(
    (sum, row) =>
      sum +
      (row.contactPhoneMasked === null ? 0 : 1) +
      (row.contactEmailMasked === null ? 0 : 1),
    0,
  );
  const nonPiiFields = consents.length * NON_PII_FIELDS_PER_ROW;
  const emptyContactFields = consents.length * 2 - maskedContactFields;

  return {
    redactedFieldCount: maskedContactFields,
    skippedFieldCount: nonPiiFields + emptyContactFields,
    evaluatedFieldCount: maskedContactFields + nonPiiFields + emptyContactFields,
    strategy: maskedContactFields > 0 ? 'partial-mask' : 'none',
    appliedAt: new Date().toISOString(),
  };
}

/** Geri çekme kanıtı: mutasyon yüzeyi PII alanı içermez. */
function buildMutationReceipt(appliedAt: Date): RedactionReceipt {
  return {
    redactedFieldCount: 0,
    skippedFieldCount: 2, // consentStatus, revokedAt (PII taşımayan alanlar)
    evaluatedFieldCount: 2,
    strategy: 'none',
    appliedAt: appliedAt.toISOString(),
  };
}
