import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { timingSafeEqual } from 'crypto';

import { AuditLogRepository } from './audit-log.repository';
import {
  auditHmacKeyResolver,
  resolveAuditHmacKeyRing,
  signAuditEntryHash,
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

/**
 * Audit okuma servisi (#259).
 *
 * - `list`: tenant-scoped filtreli okuma; satırlar KVKK maskesinden geçirilir ve
 *   okuma işlemi `dataprotection.export.redacted` olarak durable audit'e yazılır
 *   (`redactionReceipt` ile — hassas okuma denetlenebilir olmalıdır).
 *
 * #373: `verify()` metodu kaldırıldı — global zincir doğrulaması hiçbir
 * runtime yüzeyine açık değil. `verifyAuditChain` pure fonksiyonu
 * `audit-chain.ts` + `audit-chain.spec.ts` içinde korunuyor. Platform
 * authority tanımı ayrı bir security review gerektirir (#358).
 */
@Injectable()
export class AuditQueryService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly repository: AuditLogRepository,
    @Inject(TRANSACTIONAL_AUDIT_WRITER)
    private readonly auditWriter: TransactionalAuditWriter,
  ) {
    // Fail-closed konfigürasyon kontrolü (#259 review P1): bozuk/zayıf anahtar
    // halkası süreci ilk doğrulamada değil, BAŞLANGIÇTA durdurur.
    resolveAuditHmacKeyRing();
  }

  async list(
    query: TenantScopedAuditQuery,
    actor: AuditQueryActor,
  ): Promise<AuditQueryResult> {
    const rows = await this.repository.findTenantScoped(
      this.dataSource.manager,
      query,
      actor.actorUserId,
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

  /** En son retention checkpoint'i (yoksa null: zincir genesis'ten başlar). */
  async lastCheckpoint(): Promise<AuditChainCheckpointRow | null> {
    const rows = (await this.dataSource.query(
      `SELECT up_to_sequence, head_hash, signature, signature_key_id, created_at
         FROM audit_chain_checkpoints
        ORDER BY up_to_sequence DESC
        LIMIT 1`,
    )) as Array<{
      up_to_sequence: string | number;
      head_hash: string;
      signature: string;
      signature_key_id: string;
      created_at: Date;
    }>;
    const row = rows[0];
    if (!row) return null;
    // Retention signs ONLY head_hash. Other fields are shape-checked, not
    // cryptographically authenticated by the existing persistence format.
    const sequence = Number(row.up_to_sequence);
    const date = new Date(row.created_at);
    if (
      !/^[1-9][0-9]*$/.test(String(row.up_to_sequence)) ||
      !Number.isSafeInteger(sequence) ||
      typeof row.head_hash !== 'string' ||
      !/^[a-f0-9]{64}$/.test(row.head_hash) ||
      row.created_at == null ||
      !Number.isFinite(date.getTime()) ||
      typeof row.signature_key_id !== 'string' ||
      row.signature_key_id.trim() === '' ||
      row.signature_key_id.length > 40 ||
      typeof row.signature !== 'string' ||
      !/^[a-f0-9]{64}$/.test(row.signature)
    ) {
      throw new Error('Audit checkpoint rejected: invalid fields');
    }
    const key = auditHmacKeyResolver(resolveAuditHmacKeyRing())(
      row.signature_key_id,
    );
    if (key === undefined) {
      throw new Error('Audit checkpoint rejected: unknown signature key');
    }
    if (!timingSafeEqual(
      Buffer.from(row.signature, 'hex'),
      Buffer.from(signAuditEntryHash(row.head_hash, key), 'hex'),
    )) {
      throw new Error('Audit checkpoint rejected: signature mismatch');
    }
    return {
      upToSequence: sequence,
      headHash: row.head_hash,
      signatureKeyId: row.signature_key_id,
      createdAt: date.toISOString(),
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
