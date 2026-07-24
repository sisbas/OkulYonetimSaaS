import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { PersistableAuditRecord } from './transactional-audit.types';

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
}
