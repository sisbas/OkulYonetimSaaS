import { Injectable, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { pseudonymize, resolvePseudonymKey } from '../kvkk/pseudonym';
import {
  CHANNEL_CONSENT_TYPE,
  ConsentDecisionReason,
  evaluateNotificationConsent,
} from '../kvkk/consent-versioning';
import {
  NotificationOutboxRepository,
  EnqueueOutboxRow,
} from './notification-outbox.repository';

export const ABSENCE_NOTIFICATION_EVENT_TYPE = 'attendance.absent.locked';
export const DEFAULT_ABSENCE_NOTIFICATION_CHANNEL = 'sms';

export type AbsenceNotificationOutcome = Readonly<{
  sessionStatus: string | null;
  absentStudents: number;
  intendedPending: number;
  intendedBlockedConsent: number;
  insertedRows: number;
  duplicatesSkipped: number;
}>;

export interface AbsenceNotificationInput {
  tenantId: string;
  sessionId: string;
  actorUserId: string;
  channel?: string;
}

/** Onay kararı + kararın dayandığı sürüm izi (outbox `consent_version`). */
type ConsentDecision = Readonly<{
  approved: boolean;
  reason: ConsentDecisionReason | null;
  consentVersion: number | null;
}>;
type AbsentRow = { student_id: string };
type ConsentRow = {
  consent_type: string;
  version: number;
  status: string;
  revoked_at: Date | null;
  expires_at: Date | null;
};

/**
 * Kilitlenen oturumun devamsızlıklarından **idempotent** bildirim olayı üretir
 * (#266, #265 AC-6).
 *
 * Kurallar (fail-closed):
 * - Yalnız `locked` oturum bildirim üretir; `draft`/`published` oturumda hiç
 *   satır yazılmaz (yoklaması tamamlanmamış ders veliye duyurulmaz).
 * - Her (oturum, öğrenci) için `dedupe_key` üretilir → tekrar işleme satır
 *   çoğaltmaz (outbox `UNIQUE` + ON CONFLICT DO NOTHING).
 * - KVKK: `parent_notification` onayı **ve** kanal onayı (varsa) approved,
 *   iptal edilmemiş ve süresi dolmamış olmalı; aksi hâlde satır
 *   `blocked_consent` / `blocked_channel_consent` yazılır (gönderim yok, neden
 *   kayıtlı).
 * - KVKK (R5): karar **sürüm bazlıdır**; her onay tipinin yalnız en yüksek
 *   `version` satırı yönetir → geri çekilen sürümden sonra eski onaylı sürüm
 *   kanalı açamaz. Satır, kararın dayandığı sürümü `consent_version` olarak
 *   taşır (izlenebilirlik).
 * - `payload_masked` **minimize edilmiş + pseudonymize** içerik taşır: olay türü,
 *   durum, kanal ve kiracıya kilitli deterministik referanslar (`studentRef`,
 *   `sessionRef`). Ham öğrenci/oturum UUID'si payload'a, log'a veya audit
 *   kaydına YAZILMAZ (#266 review P2 — "PII'siz" ifadesi ham UUID taşırken
 *   yanlıştı; bkz. src/kvkk/pseudonym.ts).
 *
 * Çağıran, bu metodu **kendi transaction'ı içinde** çalıştırır; bildirim niyeti
 * domain mutasyonuyla atomik kalıcılaşır.
 */
@Injectable()
export class AbsenceNotificationService {
  private readonly logger = new Logger(AbsenceNotificationService.name);

  constructor(private readonly outbox: NotificationOutboxRepository) {
    // Fail-closed konfigürasyon kontrolü: eksik/zayıf pseudonym anahtarı süreci
    // ilk bildirim üretiminde (kilit transaction'ı içinde) değil BAŞLANGIÇTA
    // durdurur. Ham kimlik pseudonym'lenemediği için fail-closed davranış
    // zorunludur (#266 review P2).
    resolvePseudonymKey();
  }

  async enqueueLockedAbsenceNotifications(
    entityManager: EntityManager,
    input: AbsenceNotificationInput,
  ): Promise<AbsenceNotificationOutcome> {
    const channel = input.channel ?? DEFAULT_ABSENCE_NOTIFICATION_CHANNEL;

    const sessions = (await entityManager.query(
      `SELECT status FROM attendance_sessions WHERE tenant_id = $1 AND id = $2`,
      [input.tenantId, input.sessionId],
    )) as Array<{ status: string }>;
    const sessionStatus = sessions[0]?.status ?? null;
    if (sessionStatus === null) {
      throw new Error('AttendanceSession not found for absence notification');
    }

    const empty: AbsenceNotificationOutcome = {
      sessionStatus,
      absentStudents: 0,
      intendedPending: 0,
      intendedBlockedConsent: 0,
      insertedRows: 0,
      duplicatesSkipped: 0,
    };
    // AC-6: draft/published oturum bildirim üretemez.
    if (sessionStatus !== 'locked') return empty;

    const absent = (await entityManager.query(
      `SELECT student_id FROM attendance_records
        WHERE tenant_id = $1 AND session_id = $2 AND status = 'absent'
        ORDER BY student_id ASC`,
      [input.tenantId, input.sessionId],
    )) as AbsentRow[];
    if (absent.length === 0) return empty;

    // KVKK (A3 redaction): ham öğrenci/oturum UUID'si payload'a veya log'a
    // yazılmaz. Yerine kiracıya kilitli, geri döndürülemez deterministik
    // pseudonym referansları üretilir (aynı kiracı+kapsam+özne → aynı değer;
    // kiracılar arası eşleştirme yapılamaz).
    const pseudonymKey = resolvePseudonymKey();
    const sessionRef = pseudonymize(
      { tenantId: input.tenantId, scope: 'session', rawId: input.sessionId },
      pseudonymKey,
    );

    const rows: EnqueueOutboxRow[] = [];
    let intendedBlockedConsent = 0;
    for (const record of absent) {
      const decision = await this.resolveConsent(
        entityManager,
        input.tenantId,
        record.student_id,
        channel,
      );
      if (!decision.approved) intendedBlockedConsent += 1;
      rows.push({
        tenantId: input.tenantId,
        dedupeKey: `attendance.absent:${input.sessionId}:${record.student_id}`,
        eventType: ABSENCE_NOTIFICATION_EVENT_TYPE,
        studentId: record.student_id,
        sessionId: input.sessionId,
        channel,
        status: decision.approved ? 'pending' : 'blocked_consent',
        payloadMasked: {
          eventType: ABSENCE_NOTIFICATION_EVENT_TYPE,
          sessionRef,
          studentRef: pseudonymize(
            {
              tenantId: input.tenantId,
              scope: 'student',
              rawId: record.student_id,
            },
            pseudonymKey,
          ),
          status: 'absent',
          channel,
        },
        reason: decision.approved ? null : decision.reason,
        // Sürüm izi (AC): satır, kararın dayandığı yöneten onay sürümünü taşır.
        consentVersion: decision.consentVersion,
        createdById: input.actorUserId,
      });
    }

    const insertedRows = await this.outbox.enqueueMany(entityManager, rows);
    const outcome: AbsenceNotificationOutcome = {
      sessionStatus,
      absentStudents: absent.length,
      intendedPending: absent.length - intendedBlockedConsent,
      intendedBlockedConsent,
      insertedRows,
      duplicatesSkipped: rows.length - insertedRows,
    };

    this.logger.log(
      JSON.stringify({
        event: 'notification.outbox.enqueued',
        tenantId: input.tenantId,
        sessionRef,
        channel,
        ...outcome,
      }),
    );
    return outcome;
  }

  /**
   * Onay kararı: `parent_notification` + kanala özel onay (**granüler**) `approved`,
   * iptal edilmemiş ve süresi dolmamış olmalı. Karar **sürüm bazlıdır**: her tipin
   * yalnız en yüksek `version` satırı yönetir, böylece geri çekme (revoked_at)
   * sessizce etkisiz kalamaz (#266 R5, `src/kvkk/consent-versioning.ts`).
   */
  private async resolveConsent(
    entityManager: EntityManager,
    tenantId: string,
    studentId: string,
    channel: string,
  ): Promise<ConsentDecision> {
    const channelType = CHANNEL_CONSENT_TYPE[channel] ?? null;
    const rows = (await entityManager.query(
      `SELECT c.consent_type, c.version, c.status, c.revoked_at, c.expires_at
         FROM kvkk_consents c
         JOIN kvkk_consent_subjects s
           ON s.id = c.subject_id AND s.tenant_id = c.tenant_id
        WHERE c.tenant_id = $1
          AND s.subject_ref_id = $2
          AND s.subject_type = 'student'
          AND s.status = 'active'
          AND c.consent_type IN ('parent_notification', $3)`,
      [tenantId, studentId, channelType],
    )) as ConsentRow[];

    const decision = evaluateNotificationConsent({
      rows: rows.map((row) => ({
        consentType: row.consent_type,
        version: Number(row.version),
        status: row.status,
        revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
        expiresAt: row.expires_at ? new Date(row.expires_at) : null,
      })),
      channel,
    });

    return {
      approved: decision.allowed,
      reason: decision.reason,
      consentVersion: decision.consentVersion,
    };
  }
}
