import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { AuditLogRepository } from './audit-log.repository';
import {
  AUDIT_CHAIN_GENESIS_HASH,
  AuditChainPayload,
  AuditChainVerification,
  resolveAuditHmacKey,
  verifyAuditChain,
} from './audit-chain';
import { redactAuditRowsForExport } from './audit-tenant-query.builder';
import {
  RedactionReceipt,
  TenantScopedAuditQuery,
  TenantScopedAuditRow,
} from './transactional-audit.types';
import {
  TRANSACTIONAL_AUDIT_WRITER,
  TransactionalAuditWriter,
} from './transactional-audit-writer';

export const DEFAULT_AUDIT_VERIFY_LIMIT = 5_000;
export const MAX_AUDIT_VERIFY_LIMIT = 50_000;

export type AuditQueryActor = Readonly<{
  actorUserId: string;
  actorSessionId?: string | null;
  requestId: string;
}>;

export type AuditQueryResult = Readonly<{
  rows: readonly TenantScopedAuditRow[];
  receipt: RedactionReceipt;
}>;

export type AuditChainCheckpointRow = Readonly<{
  upToSequence: number;
  headHash: string;
  signatureKeyId: string;
  createdAt: string;
}>;

export type AuditVerificationResult = AuditChainVerification &
  Readonly<{
    checkedRows: number;
    lastCheckpoint: AuditChainCheckpointRow | null;
    startedFromCheckpoint: boolean;
  }>;

type AuditLogRow = {
  seq: string | number;
  prev_hash: string | null;
  entry_hash: string | null;
  signature: string | null;
  signature_key_id: string | null;
  tenant_id: string | null;
  actor_user_id: string | null;
  actor_session_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  request_id: string;
  metadata_json: Record<string, unknown> | null;
  created_at: Date;
};

/**
 * Audit okuma + zincir doğrulama servisi (#259).
 *
 * - `list`: tenant-scoped filtreli okuma; satırlar KVKK maskesinden geçirilir ve
 *   okuma işlemi `dataprotection.export.redacted` olarak durable audit'e yazılır
 *   (`redactionReceipt` ile — hassas okuma denetlenebilir olmalıdır).
 * - `verify`: zinciri (varsa son retention checkpoint'inden başlayarak) doğrular;
 *   kurcalama/kırpma tespitini HTTP yüzeyine taşır.
 */
@Injectable()
export class AuditQueryService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly repository: AuditLogRepository,
    @Inject(TRANSACTIONAL_AUDIT_WRITER)
    private readonly auditWriter: TransactionalAuditWriter,
  ) {}

  async list(
    query: TenantScopedAuditQuery,
    actor: AuditQueryActor,
  ): Promise<AuditQueryResult> {
    const rows = await this.repository.findTenantScoped(
      this.dataSource.manager,
      query,
    );
    const redacted = redactAuditRowsForExport(rows);
    const receipt = combineReceipts(redacted.map((item) => item.receipt));

    // Hassas okuma: KVKK veri koruma kanıtı olarak durable audit kaydı.
    await this.dataSource.transaction((manager) =>
      this.auditWriter.write(manager, 'dataprotection.export.redacted', {
        schemaVersion: 1,
        tenantId: query.tenantId,
        actorUserId: actor.actorUserId,
        actorSessionId: actor.actorSessionId ?? null,
        requestId: actor.requestId,
        entityType: 'dataprotection',
        entityId: query.tenantId,
        result: 'success',
        changedFields: ['purpose', 'format', 'recordCount', 'redactionStrategy'],
        redactionReceipt: receipt,
      }),
    );

    return { rows: redacted.map((item) => item.row), receipt };
  }

  async verify(input: {
    tenantId: string;
    expectedHeadHash?: string;
    expectedLastSequence?: number;
    limit?: number;
  }): Promise<AuditVerificationResult> {
    const limit = clampLimit(input.limit);
    const checkpoint = await this.lastCheckpoint();
    const startPrevHash = checkpoint?.headHash ?? AUDIT_CHAIN_GENESIS_HASH;

    const rows = (await this.dataSource.query(
      `SELECT seq, prev_hash, entry_hash, signature, signature_key_id,
              tenant_id, actor_user_id, actor_session_id, action,
              entity_type, entity_id, request_id, metadata_json, created_at
         FROM audit_logs
        WHERE seq > $1
        ORDER BY seq ASC
        LIMIT $2`,
      [checkpoint?.upToSequence ?? 0, limit],
    )) as AuditLogRow[];

    const { key } = resolveAuditHmacKey();
    const verification = verifyAuditChain(rows.map(toVerifiable), {
      hmacKey: key,
      startPrevHash,
      ...(input.expectedHeadHash
        ? { expectedHeadHash: input.expectedHeadHash }
        : {}),
      ...(input.expectedLastSequence !== undefined
        ? { expectedLastSequence: input.expectedLastSequence }
        : {}),
    });

    return {
      ...verification,
      checkedRows: rows.length,
      lastCheckpoint: checkpoint,
      startedFromCheckpoint: checkpoint !== null,
    };
  }

  /** En son retention checkpoint'i (yoksa null: zincir genesis'ten başlar). */
  async lastCheckpoint(): Promise<AuditChainCheckpointRow | null> {
    const rows = (await this.dataSource.query(
      `SELECT up_to_sequence, head_hash, signature_key_id, created_at
         FROM audit_chain_checkpoints
        ORDER BY up_to_sequence DESC
        LIMIT 1`,
    )) as Array<{
      up_to_sequence: string | number;
      head_hash: string;
      signature_key_id: string;
      created_at: Date;
    }>;
    const row = rows[0];
    if (!row) return null;
    return {
      upToSequence: Number(row.up_to_sequence),
      headHash: row.head_hash,
      signatureKeyId: row.signature_key_id,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }
}

function combineReceipts(receipts: readonly RedactionReceipt[]): RedactionReceipt {
  const redactedFieldCount = receipts.reduce(
    (sum, receipt) => sum + receipt.redactedFieldCount,
    0,
  );
  const skippedFieldCount = receipts.reduce(
    (sum, receipt) => sum + receipt.skippedFieldCount,
    0,
  );
  return {
    redactedFieldCount,
    skippedFieldCount,
    evaluatedFieldCount: redactedFieldCount + skippedFieldCount,
    strategy: redactedFieldCount > 0 ? 'full-redact' : 'none',
    appliedAt: new Date().toISOString(),
  };
}

function clampLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return DEFAULT_AUDIT_VERIFY_LIMIT;
  }
  return Math.min(Math.max(Math.floor(value), 1), MAX_AUDIT_VERIFY_LIMIT);
}

function toVerifiable(row: AuditLogRow) {
  return {
    sequence: Number(row.seq),
    prevHash: row.prev_hash,
    entryHash: row.entry_hash,
    signature: row.signature,
    signatureKeyId: row.signature_key_id,
    payload: {
      tenantId: row.tenant_id,
      actorUserId: row.actor_user_id,
      actorSessionId: row.actor_session_id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      requestId: row.request_id,
      metadataJson: row.metadata_json,
      createdAt: new Date(row.created_at).toISOString(),
    } as AuditChainPayload,
  };
}
