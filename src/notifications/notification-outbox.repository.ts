import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
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
}>;

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
          channel, status, payload_masked, reason, consent_version, created_by_id
        )
        SELECT * FROM unnest(
          $1::uuid[], $2::varchar[], $3::varchar[], $4::uuid[], $5::uuid[],
          $6::varchar[], $7::varchar[], $8::jsonb[], $9::varchar[], $10::int[], $11::uuid[]
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
}
