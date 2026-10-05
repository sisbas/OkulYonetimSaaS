import { Injectable, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import {
  ConsentAuthority,
  ConsentDecision,
} from '../kvkk/consent-authority';
import { pseudonymize, resolvePseudonymKey } from '../kvkk/pseudonym';
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

type AbsentRow = { student_id: string };

/**
 * Kilitlenen oturumun devamsızlıklarından **idempotent** bildirim olayı üretir
 * (#266, #265 AC-6).
 *
 * Kurallar (fail-closed):
 * - Yalnız `locked` oturum bildirim üretir; `draft`/`published` oturumda hiç
 *   satır yazılmaz (yoklaması tamamlanmamış ders veliye duyurulmaz).
 * - Her (oturum, öğrenci) için `dedupe_key` üretilir → tekrar işleme satır
 *   çoğaltmaz (outbox `UNIQUE` + ON CONFLICT DO NOTHING).
 * - KVKK: `parent_notification` onayı **ve** kanal onayı (varsa),
 *   **authoritative consent authority** (N1b) üzerinden çözülen
 *   güncel (max-version) consent satırı açısından approved,
 *   iptal edilmemiş ve süresi dolmamış olmalı; aksi hâlde satır
 *   `blocked_consent` yazılır (gönderim yok, neden kayıtlı).
 *   Outbox satırı kararın dayandığı `consent_version`'ı taşır.
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
  private readonly consentAuthority = new ConsentAuthority();

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
   * Onay kararı: **authoritative consent authority** üzerinden
   * çözülür (N1b). Authority özne başına `(consent_type)`
   * bazında en yüksek `version`'lı satırı seçer; yalnız
   * **güncel** satır approved, iptal edilmemiş ve süresi
   * dolmamış olursa onay verir. Geçmişteki onay satırı,
   * üzerindeki daha yeni bir iptal/red satırı karşılığında
   * onay vermeyi durdurur (`rows.some(approved)` resurrection
   * düzeltmesi).
   */
  private async resolveConsent(
    entityManager: EntityManager,
    tenantId: string,
    studentId: string,
    channel: string,
  ): Promise<ConsentDecision> {
    return this.consentAuthority.resolveNotificationConsent(entityManager, {
      subject: {
        tenantId,
        subjectType: 'student',
        subjectRefId: studentId,
      },
      channel,
    });
  }
}
