import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { RequestContext } from '../common/context/request-context';

import {
  NotificationOutboxRepository,
  NotificationDraftRow,
} from './notification-outbox.repository';

/**
 * #266 N1c — Notification draft service (operatör onay kuyruğu).
 *
 * Kilitli devamsızlıktan üretilen bildirim taslakları için
 * salt-okuma + onay/iptal akışı sağlar.
 *
 * Kurallar (fail-closed):
 * - Yalnız `pending` ve `blocked_consent` durumundaki satırlar
 *   taslak olarak görünür.
 * - Tenant + branch predicate zorunludur (cross-tenant izolasyonu).
 * - Snapshot immutable'dır; bir kez yazıldıktan sonra değişmez.
 * - Onay/iptal yalnız `pending` durumundan yapılabilir.
 * - Optimistic concurrency: `expectedVersion` ile korunur.
 */
@Injectable()
export class NotificationDraftService {
  constructor(private readonly outbox: NotificationOutboxRepository) {}

  /**
   * Draft listesi — operatör onay kuyruğu.
   *
   * Tenant + branch predicate zorunludur. Snapshot ile birlikte
   * döner (PII taşımaz).
   */
  async listDrafts(
    entityManager: EntityManager,
    context: RequestContext,
    limit: number,
    offset: number = 0,
  ): Promise<NotificationDraftRow[]> {
    return this.outbox.findDrafts(entityManager, context, limit, offset);
  }

  /**
   * Tek draft detayı.
   *
   * Tenant + branch predicate zorunludur. Snapshot ile birlikte
   * döner (PII taşımaz).
   */
  async getDraft(
    entityManager: EntityManager,
    context: RequestContext,
    id: string,
  ): Promise<NotificationDraftRow | null> {
    return this.outbox.findDraftById(entityManager, context, id);
  }

  /**
   * Draft onayı — `pending` → `approved`.
   *
   * Optimistic concurrency: `expectedVersion` ile korunur.
   * Stale version'da hata fırlatır.
   */
  async approveDraft(
    entityManager: EntityManager,
    input: Readonly<{
      tenantId: string;
      id: string;
      expectedVersion: number;
    }>,
  ): Promise<{ id: string; status: string; version: number }> {
    return this.outbox.transitionDraft(entityManager, {
      tenantId: input.tenantId,
      id: input.id,
      targetStatus: 'approved',
      expectedVersion: input.expectedVersion,
    });
  }

  /**
   * Draft iptali — `pending` → `closed`.
   *
   * Optimistic concurrency: `expectedVersion` ile korunur.
   * Stale version'da hata fırlatır.
   */
  async closeDraft(
    entityManager: EntityManager,
    input: Readonly<{
      tenantId: string;
      id: string;
      expectedVersion: number;
    }>,
  ): Promise<{ id: string; status: string; version: number }> {
    return this.outbox.transitionDraft(entityManager, {
      tenantId: input.tenantId,
      id: input.id,
      targetStatus: 'closed',
      expectedVersion: input.expectedVersion,
    });
  }
}
