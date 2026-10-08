import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { RequestContext } from '../common/context/request-context';

import { NotificationOutboxStatus } from './notification-outbox.entity';

export type EnqueueOutboxRow = Readonly<{
  tenantId: string;
  dedupeKey: string;
  eventType: string;
  studentId: string;
  sessionId: string;
  channel: string;
  status: NotificationOutboxStatus;
  payloadMasked: Record<string, unknown>;
  reason: string | null;
  consentVersion?: number | null;
  createdById: string | null;
  snapshot?: Record<string, unknown> | null;
}>;

export type NotificationDraftRow = {
  id: string;
  tenantId: string;
  sessionId: string;
  dedupeKey: string;
  eventType: string;
  channel: string;
  status: NotificationOutboxStatus;
  payloadMasked: Record<string, unknown>;
  reason: string | null;
  consentVersion: number | null;
  snapshot: Record<string, unknown> | null;
  version: number;
  availableAt: Date;
  createdAt: Date;
};

/**
 * TypeORM 0.3.30 postgres QueryRunner dönüş şeklini normalize eder:
 * UPDATE/DELETE sorguları `[rows, rowCount]` tuple'ı döner;
 * SELECT/INSERT ise `rows` dizisi.
 */
function extractRows<T>(result: unknown): T[] {
  if (Array.isArray(result) && Array.isArray(result[0])) {
    return result[0] as T[];
  }
  return (result ?? []) as T[];
}

/**
 * Transactional outbox deposu (#266).
 *
 * `enqueueMany` **idempotenttir**: `UNIQUE (tenant_id, dedupe_key)` sayesinde
 * aynı olay tekrar işlense bile ikinci satır oluşmaz (ON CONFLICT DO NOTHING).
 * Bu, "kilitlenen oturum birden fazla kez işlendi" senaryosunda bildirim
 * çoğaltmasını engeller.
 */
@Injectable()
export class NotificationOutboxRepository {
  async enqueueMany(
    entityManager: EntityManager,
    rows: readonly EnqueueOutboxRow[],
  ): Promise<number> {
    if (rows.length === 0) return 0;

    const inserted = (await entityManager.query(
      `
        INSERT INTO notification_outbox (
          tenant_id, dedupe_key, event_type, student_id, session_id,
          channel, status, payload_masked, reason, consent_version, created_by_id,
          snapshot, version
        )
        SELECT * FROM unnest(
          $1::uuid[], $2::varchar[], $3::varchar[], $4::uuid[], $5::uuid[],
          $6::varchar[], $7::varchar[], $8::jsonb[], $9::varchar[], $10::int[], $11::uuid[],
          $12::jsonb[], $13::int[]
        )
        ON CONFLICT (tenant_id, dedupe_key) DO NOTHING
        RETURNING id
      `,
      [
        rows.map((row) => row.tenantId),
        rows.map((row) => row.dedupeKey),
        rows.map((row) => row.eventType),
        rows.map((row) => row.studentId),
        rows.map((row) => row.sessionId),
        rows.map((row) => row.channel),
        rows.map((row) => row.status),
        rows.map((row) => JSON.stringify(row.payloadMasked)),
        rows.map((row) => row.reason),
        rows.map((row) => row.consentVersion ?? null),
        rows.map((row) => row.createdById),
        rows.map((row) => (row.snapshot ? JSON.stringify(row.snapshot) : null)),
        rows.map(() => 0),
      ],
    )) as unknown[];

    return inserted.length;
  }

  /** Trusted upstream context only; presence checks do not grant dispatch authority. */
  async findPending(
    entityManager: EntityManager,
    trustedRequestContext: RequestContext,
    limit: number,
  ): Promise<Array<{ id: string; tenantId: string; channel: string }>> {
    const tenantId = trustedRequestContext?.tenantId;
    const branchId = trustedRequestContext?.branchId;
    if (typeof tenantId !== 'string' || !tenantId.trim() ||
        typeof branchId !== 'string' || !branchId.trim()) {
      throw new ForbiddenException('NOTIFICATION_OUTBOX_SCOPE_REQUIRED');
    }
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      throw new BadRequestException('NOTIFICATION_OUTBOX_LIMIT_INVALID');
    }
    const bounded = Math.min(limit, 500);
    return (await entityManager.query(
      `SELECT o.id, o.tenant_id AS "tenantId", o.channel
         FROM notification_outbox o
         JOIN attendance_sessions s ON s.id = o.session_id AND s.tenant_id = o.tenant_id
        WHERE o.tenant_id = $1 AND s.branch_id = $2
          AND o.status = 'pending' AND o.available_at <= now()
        ORDER BY o.available_at ASC, o.id ASC
        LIMIT $3`,
      [tenantId, branchId, bounded],
    )) as Array<{ id: string; tenantId: string; channel: string }>;
  }

  /**
   * Draft listesi — operatör onay kuyruğu (N1c).
   *
   * Yalnız `pending` ve `blocked_consent` durumundaki satırlar
   * "taslak" olarak görünür; `dispatched`/`failed`/`approved`/`closed`
   * taslak değildir. Tenant + branch predicate zorunludur.
   * Snapshot ile birlikte döner (PII taşımaz).
   */
  async findDrafts(
    entityManager: EntityManager,
    trustedRequestContext: RequestContext,
    limit: number,
    offset: number = 0,
  ): Promise<NotificationDraftRow[]> {
    const tenantId = trustedRequestContext?.tenantId;
    const branchId = trustedRequestContext?.branchId;
    if (typeof tenantId !== 'string' || !tenantId.trim() ||
        typeof branchId !== 'string' || !branchId.trim()) {
      throw new ForbiddenException('NOTIFICATION_OUTBOX_SCOPE_REQUIRED');
    }
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      throw new BadRequestException('NOTIFICATION_OUTBOX_LIMIT_INVALID');
    }
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new BadRequestException('NOTIFICATION_OUTBOX_OFFSET_INVALID');
    }
    const bounded = Math.min(limit, 100);
return (await entityManager.query(
      `SELECT o.id, o.tenant_id AS "tenantId", o.session_id AS "sessionId",
              o.dedupe_key AS "dedupeKey",
              o.event_type AS "eventType", o.channel, o.status,
              o.payload_masked AS "payloadMasked", o.reason,
              o.consent_version AS "consentVersion", o.snapshot,
              o.version, o.available_at AS "availableAt", o.created_at AS "createdAt"
         FROM notification_outbox o
        JOIN attendance_sessions s ON s.id = o.session_id AND s.tenant_id = o.tenant_id
       WHERE o.tenant_id = $1 AND s.branch_id = $2
         AND o.status IN ('pending', 'blocked_consent')
        ORDER BY o.available_at ASC, o.id ASC
        LIMIT $3 OFFSET $4`,
      [tenantId, branchId, bounded, offset],
    )) as NotificationDraftRow[];
  }

  /**
   * Tek draft detayı — operatör onay kuyruğu (N1c).
   *
   * Tenant + branch predicate zorunludur. Snapshot ile birlikte
   * döner (PII taşımaz).
   */
  async findDraftById(
    entityManager: EntityManager,
    trustedRequestContext: RequestContext,
    id: string,
  ): Promise<NotificationDraftRow | null> {
    const tenantId = trustedRequestContext?.tenantId;
    const branchId = trustedRequestContext?.branchId;
    if (typeof tenantId !== 'string' || !tenantId.trim() ||
        typeof branchId !== 'string' || !branchId.trim()) {
      throw new ForbiddenException('NOTIFICATION_OUTBOX_SCOPE_REQUIRED');
    }
const rows = (await entityManager.query(
      `SELECT o.id, o.tenant_id AS "tenantId", o.session_id AS "sessionId",
              o.dedupe_key AS "dedupeKey",
              o.event_type AS "eventType", o.channel, o.status,
              o.payload_masked AS "payloadMasked", o.reason,
              o.consent_version AS "consentVersion", o.snapshot,
              o.version, o.available_at AS "availableAt", o.created_at AS "createdAt"
         FROM notification_outbox o
        JOIN attendance_sessions s ON s.id = o.session_id AND s.tenant_id = o.tenant_id
       WHERE o.tenant_id = $1 AND s.branch_id = $2 AND o.id = $3
          AND o.status IN ('pending', 'blocked_consent')`,
      [tenantId, branchId, id],
    )) as NotificationDraftRow[];
    return rows[0] ?? null;
  }

  /**
   * Draft durum geçişi — approve/close (N1c).
   *
   * `approve`: `pending` VEYA `blocked_consent` durumundan (onay geri
   * alınıp consent yeniden verildikten sonra yeniden onay — N2 blocked
   * akışının çıkışı). `close`: yalnız `pending` durumundan.
   * Optimistic concurrency: `expectedVersion` ile korunur. Stale
   * version'da 0 satır etkilenir → ConflictException (HTTP 409).
   */
  async transitionDraft(
    entityManager: EntityManager,
    input: Readonly<{
      tenantId: string;
      branchId: string;
      id: string;
      targetStatus: 'approved' | 'closed';
      expectedVersion: number;
    }>,
  ): Promise<{ id: string; status: string; version: number }> {
    if (typeof input.tenantId !== 'string' || !input.tenantId.trim() ||
        typeof input.branchId !== 'string' || !input.branchId.trim()) {
      throw new ForbiddenException('NOTIFICATION_OUTBOX_SCOPE_REQUIRED');
    }
    const fromStatuses =
      input.targetStatus === 'approved' ? ['pending', 'blocked_consent'] : ['pending'];
    const updated = extractRows<{ id: string; status: string; version: number }>(
      await entityManager.query(
        `UPDATE notification_outbox
            SET status = $1,
                version = version + 1,
                updated_at = now()
          WHERE tenant_id = $2 AND id = $3 AND status = ANY($5::varchar[])
            AND version = $4
            AND session_id IN (
              SELECT id FROM attendance_sessions
               WHERE tenant_id = $2 AND branch_id = $6)
          RETURNING id, status, version`,
        [input.targetStatus, input.tenantId, input.id, input.expectedVersion, fromStatuses, input.branchId],
      ),
    );
    if (updated.length === 0) {
      throw new ConflictException(
        'Notification draft version conflict, not found, or in invalid status',
      );
    }
    return {
      id: updated[0].id,
      status: updated[0].status,
      version: Number(updated[0].version),
    };
  }

  /**
   * Session düzeyinde toplu draft onayı (P1B-FINAL Stage 5).
   *
   * Aynı attendance session'ının tüm bekleyen/bloke draftlarını tek
   * işlemde `approved`'a geçirir. Optimistic concurrency satır başına
   * `(id, version)` eşleşmesiyle korunur; istemcinin gördüğü tüm
   * versionlar birebir eşleşmezse 0 satır döner → all-or-nothing
   * ConflictException (HTTP 409) → işlem geri alınır.
   * Tenant + branch predicate zorunludur.
   */
  async transitionDraftsForSession(
    entityManager: EntityManager,
    input: Readonly<{
      tenantId: string;
      branchId: string;
      sessionId: string;
      targetStatus: 'approved';
      expectedVersions: ReadonlyArray<{ id: string; version: number }>;
    }>,
  ): Promise<Array<{ id: string; status: string; version: number }>> {
    if (typeof input.tenantId !== 'string' || !input.tenantId.trim() ||
        typeof input.branchId !== 'string' || !input.branchId.trim() ||
        typeof input.sessionId !== 'string' || !input.sessionId.trim()) {
      throw new ForbiddenException('NOTIFICATION_OUTBOX_SCOPE_REQUIRED');
    }
    if (!Array.isArray(input.expectedVersions) || input.expectedVersions.length === 0) {
      throw new BadRequestException('NOTIFICATION_BULK_VERSIONS_REQUIRED');
    }
    const bounded = input.expectedVersions.slice(0, 200);
    const ids = bounded.map((v) => v.id);
    const versions = bounded.map((v) => v.version);
    const fromStatuses = ['pending', 'blocked_consent'];

    const updated = extractRows<{ id: string; status: string; version: number }>(
      await entityManager.query(
        `UPDATE notification_outbox o
            SET status = $1,
                version = o.version + 1,
                updated_at = now()
           FROM (
             SELECT tn.id, tn.version
               FROM unnest($4::uuid[], $5::int[]) AS tn(id, version)
           ) AS expected
           JOIN attendance_sessions s
             ON s.id = o.session_id AND s.tenant_id = o.tenant_id
          WHERE o.tenant_id = $2
            AND s.branch_id = $6
            AND o.session_id = $3
            AND o.status = ANY($7::varchar[])
            AND o.id = expected.id
            AND o.version = expected.version
          RETURNING o.id, o.status, o.version`,
        [input.targetStatus, input.tenantId, input.sessionId, ids, versions, input.branchId, fromStatuses],
      ),
    );

    if (updated.length !== bounded.length) {
      throw new ConflictException(
        'Notification draft bulk version conflict, not found, or in invalid status',
      );
    }
    return updated.map((row) => ({
      id: row.id,
      status: row.status,
      version: Number(row.version),
    }));
  }
}
