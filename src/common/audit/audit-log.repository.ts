import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { PersistableAuditRecord, TenantScopedAuditQuery, TenantScopedAuditRow } from './transactional-audit.types';
import { buildTenantScopedAuditQuery } from './audit-tenant-query.builder';
import {
  AUDIT_CHAIN_GENESIS_HASH,
  AUDIT_CHAIN_LOCK_KEY,
  AuditChainPayload,
  computeAuditEntryHash,
  resolveAuditHmacKey,
  signAuditEntryHash,
} from './audit-chain';

/** Zincire eklenen kaydın denetlenebilir kimliği. */
export type AuditChainWriteResult = Readonly<{
  sequence: number;
  prevHash: string;
  entryHash: string;
  signatureKeyId: string;
}>;

@Injectable()
export class AuditLogRepository {
  constructor() {
    // Fail-closed konfigürasyon kontrolü (#259): bu sağlayıcı uygulama
    // bootstrap'ında (DI) oluşturulduğu için eksik/zayıf HMAC anahtarı süreci
    // ilk audit yazımında değil, BAŞLANGIÇTA durdurur.
    resolveAuditHmacKey();
  }

  /**
   * Audit kaydını zincire ekler (#259).
   *
   * Çağıranın verdiği `entityManager` domain mutasyonuyla AYNI transaction'dır;
   * yani audit kaydı domain değişikliğiyle birlikte commit/rollback olur
   * (constitution Madde III).
   *
   * Zincir bütünlüğü: `pg_advisory_xact_lock` ile zincir başı serileştirilir,
   * son kaydın `entry_hash`'i `prev_hash` olarak kullanılır ve özet HMAC ile
   * imzalanır. Böylece eşzamanlı iki yazma çatallanmış zincir üretemez.
   */
  async insert(
    entityManager: EntityManager,
    record: PersistableAuditRecord,
  ): Promise<AuditChainWriteResult> {
    // `created_at` uygulama tarafında üretilir; hash'lenen değer ile DB'ye
    // yazılan değer birebir aynı olmak zorundadır.
    const createdAt = new Date();
    const payload: AuditChainPayload = {
      tenantId: record.tenantId,
      actorUserId: record.actorUserId,
      actorSessionId: record.actorSessionId,
      action: record.action,
      entityType: record.entityType,
      entityId: record.entityId,
      requestId: record.requestId,
      metadataJson: record.metadataJson,
      createdAt: createdAt.toISOString(),
    };

    await entityManager.query(`SELECT pg_advisory_xact_lock($1)`, [
      AUDIT_CHAIN_LOCK_KEY,
    ]);

    const head = (await entityManager.query(
      `SELECT "entry_hash" FROM "audit_logs" ORDER BY "seq" DESC LIMIT 1`,
    )) as Array<{ entry_hash: string | null }>;
    const prevHash = head[0]?.entry_hash ?? AUDIT_CHAIN_GENESIS_HASH;

    const entryHash = computeAuditEntryHash(prevHash, payload);
    const { key, keyId } = resolveAuditHmacKey();
    const signature = signAuditEntryHash(entryHash, key);

    const inserted = (await entityManager.query(
      `
        INSERT INTO audit_logs (
          tenant_id,
          actor_user_id,
          actor_session_id,
          action,
          entity_type,
          entity_id,
          request_id,
          metadata_json,
          created_at,
          prev_hash,
          entry_hash,
          signature,
          signature_key_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13)
        RETURNING "seq"
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
        createdAt,
        prevHash,
        entryHash,
        signature,
        keyId,
      ],
    )) as Array<{ seq: string | number }>;

    return {
      sequence: Number(inserted[0]?.seq ?? 0),
      prevHash,
      entryHash,
      signatureKeyId: keyId,
    };
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
