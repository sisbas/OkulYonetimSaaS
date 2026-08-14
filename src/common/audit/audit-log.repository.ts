import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { PersistableAuditRecord, TenantScopedAuditQuery, TenantScopedAuditRow } from './transactional-audit.types';
import { buildTenantScopedAuditQuery } from './audit-tenant-query.builder';

@Injectable()
export class AuditLogRepository {
  async insert(entityManager: EntityManager, record: PersistableAuditRecord): Promise<void> {
    await entityManager.query(
      `
        INSERT INTO audit_logs (
          tenant_id,
          actor_user_id,
          actor_session_id,
          action,
          entity_type,
          entity_id,
          request_id,
          metadata_json
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      `,
      [
        record.tenantId,
        record.actorUserId,
        record.actorSessionId,
        record.action,
        record.entityType,
        record.entityId,
        record.requestId,
        JSON.stringify(record.metadataJson),
      ],
    );
  }

  /**
   * Tenant'a özgü audit kayıtlarını döndürür. Sorgu, `buildTenantScopedAuditQuery`
   * tarafından üretilen parametreli ve tenant-id kilitlemeli SQL ile çalıştırılır;
   * bu nedenle audit logları asla tenant sınırının dışına sızamaz.
   */
  async findTenantScoped(
    entityManager: EntityManager,
    query: TenantScopedAuditQuery,
  ): Promise<TenantScopedAuditRow[]> {
    const { sql, params } = buildTenantScopedAuditQuery(query);
    const rows = (await entityManager.query(sql, [...params])) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id),
      tenantId: String(row.tenant_id),
      actorUserId: row.actor_user_id == null ? null : String(row.actor_user_id),
      actorSessionId: row.actor_session_id == null ? null : String(row.actor_session_id),
      action: String(row.action),
      entityType: row.entity_type == null ? null : String(row.entity_type),
      entityId: row.entity_id == null ? null : String(row.entity_id),
      requestId: String(row.request_id),
      metadataJson: row.metadata_json == null ? null : (row.metadata_json as Record<string, unknown>),
      createdAt: row.created_at as Date,
    }));
  }
}
