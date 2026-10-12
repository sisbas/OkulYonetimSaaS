import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EntityManager } from 'typeorm';
import { RequestContext } from '../common/context/request-context';
import { NotificationOutboxStatus } from './notification-outbox.entity';
import { DispatchOutcome, NotificationDispatchReceipt } from './notification-dispatch-receipt.entity';

/** Kiralama (lease) süresi — saniye. Süresi dolan kiralama yeniden kiralanabilir. */
export const CLAIM_LEASE_SECONDS = 90;

/** Üst deneme sınırı: ardışık reddedilen denemeler dead-letter'a gider. */
export const MAX_ATTEMPTS = 3;

/** Backoff: min(5s · 2^(attempts-1), 300s) — milisaniye. */
export function backoffMsForAttempts(attempts: number): number {
  return Math.min(5_000 * 2 ** Math.max(attempts - 1, 0), 300_000);
}

export type NotificationOperationRow = {
  id: string;
  tenantId: string;
  dedupeKey: string;
  eventType: string;
  studentId: string;
  sessionId: string;
  channel: string;
  status: NotificationOutboxStatus;
  reason: string | null;
  consentVersion: number | null;
  snapshot: Record<string, unknown> | null;
  version: number;
  attempts: number;
  availableAt: Date;
  dispatchedAt: Date | null;
  cancelledAt: Date | null;
  deadLetteredAt: Date | null;
  lastErrorCode: string | null;
  createdAt: Date;
};

export type ClaimResult = Readonly<{
  id: string;
  tenantId: string;
  studentId: string;
  channel: string;
  eventType: string;
  snapshot: Record<string, unknown> | null;
  attempt: number;
  fencingToken: number;
  claimToken: string;
  version: number;
}>;

function extractRows<T>(result: unknown): T[] {
  if (Array.isArray(result) && Array.isArray(result[0])) {
    return result[0] as T[];
  }
  return (result ?? []) as T[];
}

const OPERATION_COLUMNS = `
  o.id, o.tenant_id AS "tenantId", o.dedupe_key AS "dedupeKey",
  o.event_type AS "eventType", o.student_id AS "studentId",
  o.session_id AS "sessionId", o.channel, o.status, o.reason,
  o.consent_version AS "consentVersion", o.snapshot, o.version, o.attempts,
  o.available_at AS "availableAt", o.dispatched_at AS "dispatchedAt",
  o.cancelled_at AS "cancelledAt", o.dead_lettered_at AS "deadLetteredAt",
  o.last_error_code AS "lastErrorCode", o.created_at AS "createdAt"`;

/** Receipt satırını snake_case → alan sözleşmesine eşler. */
function mapReceiptRow(row: Record<string, unknown>): NotificationDispatchReceipt {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    outboxId: String(row.outbox_id),
    attempt: Number(row.attempt),
    fencingToken: Number(row.fencing_token),
    outcome: row.outcome as DispatchOutcome,
    simulated: Boolean(row.simulated),
    providerRef: (row.provider_ref as string | null) ?? null,
    errorCode: (row.error_code as string | null) ?? null,
    receipt: (row.receipt as Record<string, unknown>) ?? {},
    createdAt: new Date(String(row.created_at)),
  };
}

/**
 * #266 N2 — Gönderim (dispatch) deposu: claim/lease/fencing + dayanıklı geçişler.
 *
 * Eşzamanlılık modeli (MASTER PROMPT §4):
 * 1. **tx1 (claim)**: koşullu UPDATE — `status IN ('approved','failed')`,
 *    `available_at <= now()` (backoff) ve aktif olmayan kiralama. Her
 *    kiralamada `fencing_token +1`, `claim_token` yenilenir, `attempts +1`.
 *    Etkilenen satır yoksa sınıflandırılmış çakışlık fırlatılır
 *    (idempotent-kabul / claim-active / backoff / status).
 * 2. **tx2 (uygulama)**: tüm yazmalar `WHERE claim_token = $token` ile
 *    korunur. Eski (stale) işleyici asla yazamaz → fencing. tx2 atomiktir:
 *    geçiş + receipt aynı transaction; iptal yarışı kazanırsa tx2 0 satır
 *    görür ve rollback eder → provider etkisi SIFIR olur.
 *
 * Kanıt (receipt) `UNIQUE (outbox_id, attempt)` ile idempotenttir.
 */
@Injectable()
export class NotificationDispatchRepository {
  /** Tenant + branch predicate'i — tüm operasyon sorguları için zorunlu. */
  private scope(
    entityManager: EntityManager,
    trustedRequestContext: Readonly<{ tenantId?: string; branchId?: string }>,
  ): { tenantId: string; branchId: string } {
    const tenantId = trustedRequestContext?.tenantId;
    const branchId = trustedRequestContext?.branchId;
    if (
      typeof tenantId !== 'string' ||
      !tenantId.trim() ||
      typeof branchId !== 'string' ||
      !branchId.trim()
    ) {
      throw new ForbiddenException('NOTIFICATION_OUTBOX_SCOPE_REQUIRED');
    }
    return { tenantId, branchId };
  }

  /** Operasyon listesi — tüm durumlar, isteğe bağlı `status` filtresi. */
  async findAll(
    entityManager: EntityManager,
    trustedRequestContext: RequestContext,
    input: Readonly<{ limit: number; offset: number; status?: string }>,
  ): Promise<NotificationOperationRow[]> {
    const { tenantId, branchId } = this.scope(entityManager, trustedRequestContext);
    if (!Number.isSafeInteger(input.limit) || input.limit <= 0) {
      throw new BadRequestException('NOTIFICATION_OUTBOX_LIMIT_INVALID');
    }
    if (!Number.isSafeInteger(input.offset) || input.offset < 0) {
      throw new BadRequestException('NOTIFICATION_OUTBOX_OFFSET_INVALID');
    }
    const bounded = Math.min(input.limit, 100);
    const params: unknown[] = [tenantId, branchId];
    let statusPredicate = '';
    if (input.status) {
      params.push(input.status);
      statusPredicate = 'AND o.status = $3';
    }
    params.push(bounded, input.offset);
    const limitIndex = params.length - 1;
    const offsetIndex = params.length;
    return (await entityManager.query(
      `SELECT ${OPERATION_COLUMNS}
         FROM notification_outbox o
         JOIN attendance_sessions s ON s.id = o.session_id AND s.tenant_id = o.tenant_id
        WHERE o.tenant_id = $1 AND s.branch_id = $2
        ${statusPredicate}
        ORDER BY o.created_at DESC, o.id ASC
        LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
      params,
    )) as NotificationOperationRow[];
  }

  /** Tek satır detayı — tüm durumlar. */
  async findById(
    entityManager: EntityManager,
    trustedRequestContext: RequestContext,
    id: string,
  ): Promise<NotificationOperationRow | null> {
    const { tenantId, branchId } = this.scope(entityManager, trustedRequestContext);
    const rows = (await entityManager.query(
      `SELECT ${OPERATION_COLUMNS}
         FROM notification_outbox o
         JOIN attendance_sessions s ON s.id = o.session_id AND s.tenant_id = o.tenant_id
        WHERE o.tenant_id = $1 AND s.branch_id = $2 AND o.id = $3`,
      [tenantId, branchId, id],
    )) as NotificationOperationRow[];
    return rows[0] ?? null;
  }

  /** Satırın güncel durumu — başarısız claim'in sınıflandırılması için. */
  async currentClaimBasis(
    entityManager: EntityManager,
    input: Readonly<{ tenantId: string; branchId: string; id: string }>,
  ): Promise<{
    status: NotificationOutboxStatus;
    version: number;
    attempts: number;
    claimActive: boolean;
    backoffUntil: Date | null;
  } | null> {
    const { tenantId, branchId } = this.scope(entityManager, input);
    const rows = (await entityManager.query(
      `SELECT o.status, o.version, o.attempts,
              (o.claim_expires_at IS NOT NULL AND o.claim_expires_at >= now()) AS "claimActive",
              o.available_at AS "backoffUntil"
         FROM notification_outbox o
        WHERE o.tenant_id = $1 AND o.id = $2
          AND o.session_id IN (
            SELECT id FROM attendance_sessions
             WHERE tenant_id = $1 AND branch_id = $3)`,
      [tenantId, input.id, branchId],
    )) as Array<{
      status: NotificationOutboxStatus;
      version: number;
      attempts: number;
      claimActive: boolean;
      backoffUntil: Date;
    }>;
    const row = rows[0];
    if (!row) return null;
    return {
      status: row.status,
      version: Number(row.version),
      attempts: Number(row.attempts),
      claimActive: Boolean(row.claimActive),
      backoffUntil: new Date(row.backoffUntil),
    };
  }

  /**
   * tx1 — koşullu claim (lease + fencing + attempt sayacı).
   *
   * Etkilenen 0 satır durumunda `currentClaimBasis` ile sınıflandırma
   * yapması çağırıcıya bırakılır (ConflictException tetikler).
   */
  async claim(
    entityManager: EntityManager,
    input: Readonly<{ tenantId: string; branchId: string; id: string }>,
  ): Promise<ClaimResult | null> {
    const { tenantId, branchId } = this.scope(entityManager, input);
    const claimToken = randomUUID();
    const rows = extractRows<{
      id: string;
      tenantId: string;
      studentId: string;
      channel: string;
      eventType: string;
      snapshot: Record<string, unknown> | null;
      attempt: number;
      fencingToken: number;
      claimToken: string;
      version: number;
    }>(
      await entityManager.query(
        `UPDATE notification_outbox
            SET attempts = attempts + 1,
                fencing_token = fencing_token + 1,
                claim_token = $3,
                claimed_at = now(),
                claim_expires_at = now() + make_interval(secs => $4),
                version = version + 1,
                updated_at = now()
          WHERE tenant_id = $1 AND id = $2
            AND session_id IN (
              SELECT id FROM attendance_sessions
               WHERE tenant_id = $1 AND branch_id = $5)
            AND status IN ('approved', 'failed')
            AND available_at <= now()
            AND (claim_expires_at IS NULL OR claim_expires_at < now())
          RETURNING id, tenant_id AS "tenantId", student_id AS "studentId",
                    channel, event_type AS "eventType", snapshot,
                    attempts AS attempt, fencing_token AS "fencingToken",
                    claim_token AS "claimToken", version`,
        [tenantId, input.id, claimToken, CLAIM_LEASE_SECONDS, branchId],
      ),
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      id: row.id,
      tenantId: row.tenantId,
      studentId: row.studentId,
      channel: row.channel,
      eventType: row.eventType,
      snapshot: row.snapshot,
      attempt: Number(row.attempt),
      fencingToken: Number(row.fencingToken),
      claimToken: row.claimToken,
      version: Number(row.version),
    };
  }

  /**
   * tx2 — onay yeniden doğrulaması sonucu `blocked_consent` geçişi.
   * `claim_token` korumalı; 0 satır = kiralanmış satır başka elden geçti.
   */
  async transitionToBlockedConsent(
    entityManager: EntityManager,
    input: Readonly<{
      tenantId: string;
      id: string;
      claimToken: string;
      reason: string;
      consentVersion: number | null;
    }>,
  ): Promise<{ version: number } | null> {
    const rows = extractRows<{ version: number }>(
      await entityManager.query(
        `UPDATE notification_outbox
            SET status = 'blocked_consent',
                reason = $3,
                consent_version = $4,
                claim_token = NULL, claimed_at = NULL, claim_expires_at = NULL,
                version = version + 1,
                updated_at = now()
          WHERE tenant_id = $1 AND id = $2 AND claim_token = $5
            AND status IN ('approved', 'failed')
          RETURNING version`,
        [
          input.tenantId,
          input.id,
          input.reason,
          input.consentVersion,
          input.claimToken,
        ],
      ),
    );
    if (rows.length === 0) return null;
    return { version: Number(rows[0].version) };
  }

  /**
   * tx2 — sonuç geçişi (claim_token + mevcut durum koruması).
   *
   * Hedefler:
   * - `provider_accepted` → `dispatched` (kalıcı)
   * - `provider_rejected` → attempts ≥ MAX ise `dead_lettered`,
   *   değilse `failed` + backoff (`available_at` = now + backoff)
   * - `uncertain` → `uncertain`
   *
   * Kiralama (claim) her geçişte bırakılır; `last_error_code` allowlist
   * kodlarıyla yazılır.
   */
  async applyOutcome(
    entityManager: EntityManager,
    input: Readonly<{
      tenantId: string;
      id: string;
      claimToken: string;
      outcome: DispatchOutcome;
      attempts: number;
      errorCode: string | null;
    }>,
  ): Promise<{ status: NotificationOutboxStatus; version: number } | null> {
    const backoffMs = backoffMsForAttempts(input.attempts);
    const rows = extractRows<{ status: NotificationOutboxStatus; version: number }>(
      await entityManager.query(
        `UPDATE notification_outbox
            SET status = CASE $3
                  WHEN 'provider_accepted' THEN 'dispatched'
                  WHEN 'uncertain' THEN 'uncertain'
                  WHEN 'provider_rejected' THEN
                        CASE WHEN attempts >= $4 THEN 'dead_lettered' ELSE 'failed' END
                END,
                dispatched_at = CASE WHEN $3 = 'provider_accepted' THEN now() ELSE dispatched_at END,
                dead_lettered_at = CASE
                        WHEN $3 = 'provider_rejected' AND attempts >= $4 THEN now()
                        ELSE dead_lettered_at END,
                available_at = CASE
                        WHEN $3 = 'provider_rejected' AND attempts < $4
                          THEN now() + make_interval(secs => $5)
                        ELSE available_at END,
                last_error_code = $6,
                reason = NULL,
                claim_token = NULL, claimed_at = NULL, claim_expires_at = NULL,
                version = version + 1,
                updated_at = now()
          WHERE tenant_id = $1 AND id = $2 AND claim_token = $7
            AND status IN ('approved', 'failed')
          RETURNING status, version`,
        [
          input.tenantId,
          input.id,
          input.outcome,
          MAX_ATTEMPTS,
          backoffMs / 1000,
          input.errorCode,
          input.claimToken,
        ],
      ),
    );
    if (rows.length === 0) return null;
    return { status: rows[0].status, version: Number(rows[0].version) };
  }

  /** tx2 — dayanıcı receipt satırı (idempotent: UNIQUE outbox_id+attempt). */
  async insertReceipt(
    entityManager: EntityManager,
    input: Readonly<{
      tenantId: string;
      outboxId: string;
      attempt: number;
      fencingToken: number;
      outcome: DispatchOutcome;
      providerRef: string;
      errorCode: string | null;
      receipt: Record<string, unknown>;
    }>,
  ): Promise<NotificationDispatchReceipt> {
    const rows = extractRows<Record<string, unknown>>(
      await entityManager.query(
        `INSERT INTO notification_dispatch_receipts
           (tenant_id, outbox_id, attempt, fencing_token, outcome,
            simulated, provider_ref, error_code, receipt)
         VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8::jsonb)
         RETURNING *`,
        [
          input.tenantId,
          input.outboxId,
          input.attempt,
          input.fencingToken,
          input.outcome,
          input.providerRef,
          input.errorCode,
          JSON.stringify(input.receipt),
        ],
      ),
    );
    if (rows.length === 0) throw new Error('Notification dispatch receipt insert failed');
    return mapReceiptRow(rows[0]);
  }

  /** Gönderim kanıtları — detail yanıtı için (attempt artan sırada). */
  async findReceipts(
    entityManager: EntityManager,
    tenantId: string,
    outboxId: string,
  ): Promise<NotificationDispatchReceipt[]> {
    const rows = (await entityManager.query(
      `SELECT * FROM notification_dispatch_receipts
        WHERE tenant_id = $1 AND outbox_id = $2
        ORDER BY attempt ASC`,
      [tenantId, outboxId],
    )) as Array<Record<string, unknown>>;
    return rows.map(mapReceiptRow);
  }

  /**
   * Idempotent tekrar okuma: `dispatched` satırın mevcut kanıtı.
   * (İkinci execute çağrısı yeni etki üretmez, mevcut receipt'i döner.)
   */
  async findLatestReceipt(
    entityManager: EntityManager,
    tenantId: string,
    outboxId: string,
  ): Promise<NotificationDispatchReceipt | null> {
    const rows = (await entityManager.query(
      `SELECT * FROM notification_dispatch_receipts
        WHERE tenant_id = $1 AND outbox_id = $2
        ORDER BY attempt DESC LIMIT 1`,
      [tenantId, outboxId],
    )) as Array<Record<string, unknown>>;
    return rows.length > 0 ? mapReceiptRow(rows[0]) : null;
  }

  /**
   * Retry — `dead_lettered` | `uncertain` → `approved` (yeniden uygunluk).
   * `attempts` korunur (kanıt bütünlüğü); geçiş koşullu ve yarış-güvenli.
   */
  async rearmForRetry(
    entityManager: EntityManager,
    input: Readonly<{ tenantId: string; branchId: string; id: string }>,
  ): Promise<{ status: NotificationOutboxStatus; version: number } | null> {
    const { tenantId, branchId } = this.scope(entityManager, input);
    const rows = extractRows<{ status: NotificationOutboxStatus; version: number }>(
      await entityManager.query(
        `UPDATE notification_outbox
            SET status = 'approved',
                available_at = now(),
                last_error_code = NULL,
                version = version + 1,
                updated_at = now()
          WHERE tenant_id = $1 AND id = $2
            AND session_id IN (
              SELECT id FROM attendance_sessions
               WHERE tenant_id = $1 AND branch_id = $3)
            AND status IN ('dead_lettered', 'uncertain')
          RETURNING status, version`,
        [tenantId, input.id, branchId],
      ),
    );
    if (rows.length === 0) return null;
    return { status: rows[0].status, version: Number(rows[0].version) };
  }

  /**
   * Cancel — `dispatched`/`cancelled`/`closed` DIŞINDA her durumdan iptal.
   * Koşullu UPDATE sayesinde execute ile yarışı kaybeden taraf 0 satır görür.
   */
  async cancel(
    entityManager: EntityManager,
    input: Readonly<{ tenantId: string; branchId: string; id: string }>,
  ): Promise<{ status: NotificationOutboxStatus; version: number } | null> {
    const { tenantId, branchId } = this.scope(entityManager, input);
    const rows = extractRows<{ status: NotificationOutboxStatus; version: number }>(
      await entityManager.query(
        `UPDATE notification_outbox
            SET status = 'cancelled',
                cancelled_at = now(),
                claim_token = NULL, claimed_at = NULL, claim_expires_at = NULL,
                version = version + 1,
                updated_at = now()
          WHERE tenant_id = $1 AND id = $2
            AND session_id IN (
              SELECT id FROM attendance_sessions
               WHERE tenant_id = $1 AND branch_id = $3)
            AND status NOT IN ('dispatched', 'cancelled', 'closed')
          RETURNING status, version`,
        [tenantId, input.id, branchId],
      ),
    );
    if (rows.length === 0) return null;
    return { status: rows[0].status, version: Number(rows[0].version) };
  }
}

/** Claim başarısızlığının sınıflandırılmış hatası (fail-closed). */
export function claimConflict(
  basis: {
    status: NotificationOutboxStatus;
    claimActive: boolean;
    backoffUntil: Date | null;
  } | null,
  id: string,
): ConflictException {
  if (!basis) {
    throw new ForbiddenException('Notification dispatch row not found');
  }
  if (basis.status === 'dispatched') {
    throw new ConflictException(`IDEMPOTENT_DISPATCHED:${id}`);
  }
  if (basis.claimActive) {
    throw new ConflictException(`CLAIM_ACTIVE:${id}`);
  }
  if (
    basis.status === 'failed' &&
    basis.backoffUntil !== null &&
    basis.backoffUntil.getTime() > Date.now()
  ) {
    throw new ConflictException(`BACKOFF_ACTIVE:${id}`);
  }
  throw new ConflictException(`NOT_DISPATCHABLE:${basis.status}:${id}`);
}
