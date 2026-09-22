import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';

import {
  AUDIT_CHAIN_LOCK_KEY,
  resolveAuditHmacKey,
  signAuditEntryHash,
} from './audit-chain';
import {
  DEFAULT_AUDIT_RETENTION_DAYS,
  auditRetentionCutoff,
  isAuditRecordRetentionEligible,
  resolveAuditRetentionDays,
} from './audit-retention.policy';
import {
  TRANSACTIONAL_AUDIT_WRITER,
  TransactionalAuditWriter,
} from './transactional-audit-writer';

export const DEFAULT_AUDIT_RETENTION_SCAN_LIMIT = 5_000;
export const MAX_AUDIT_RETENTION_ROWS = 50_000;
const RETENTION_REASON_PATTERN = /^[a-z0-9_.:-]{3,60}$/;

export type AuditRetentionActionPlan = Readonly<{
  action: string;
  retentionDays: number;
  totalRows: number;
  eligibleRows: number;
  oldestCreatedAt: string | null;
}>;

export type AuditRetentionPlan = Readonly<{
  generatedAt: string;
  defaultRetentionDays: number;
  actions: readonly AuditRetentionActionPlan[];
  eligibleRows: number;
  /** Zincirin başından itibaren kesintisiz kırpılabilen satır sayısı. */
  prunablePrefixRows: number;
  prunableUpToSequence: number | null;
  scanLimit: number;
  scanTruncated: boolean;
}>;

export type AuditRetentionCheckpoint = Readonly<{
  upToSequence: number;
  headHash: string;
  signatureKeyId: string;
}>;

export type AuditRetentionPruneResult = Readonly<{
  dryRun: boolean;
  prunedRows: number;
  checkpoint: AuditRetentionCheckpoint | null;
  plan: AuditRetentionPlan;
}>;

export interface AuditRetentionPruneInput {
  dryRun: boolean;
  reason: string;
  /** Kırpma işlemini yürüten aktör (audit kaydı için zorunlu). */
  actorUserId: string;
  /** Audit kaydının atfedileceği kiracı (aktörün kiracısı). */
  tenantId: string;
  requestId: string;
  maxRows?: number;
  scanLimit?: number;
  now?: Date;
}

type AggregateRow = { action: string; total: string | number; oldest: Date | null };
type EligibleRow = { action: string; eligible: string | number };
type PrefixRow = {
  seq: string | number;
  action: string;
  created_at: Date;
  entry_hash: string;
};

/**
 * Audit retention (#259).
 *
 * Saklama süresi dolan kayıtları **zincirin başından itibaren kesintisiz
 * prefix** olarak kırpar; silmeden önce global zincir checkpoint'i yazar
 * (`audit_chain_checkpoints`). Böylece:
 * - kalan zincir genesis'e değil checkpoint `head_hash`'ine bağlanır
 *   (`verifyAuditChain({ startPrevHash })`),
 * - kırpma işleminin kendisi de durable audit kaydı üretir
 *   (`audit.retention.pruned`, aynı transaction'da).
 *
 * Prefix kuralı bilinçlidir: zincirin ortasından satır silmek bütünlüğü
 * kanıtlanamaz hâle getirirdi; bu yüzden yalnız baştan itibaren tamamı
 * saklama süresi dolmuş satırlar kırpılır. Zincir global olduğu için kırpma
 * da platform seviyesindedir (tenant bazlı değil).
 */
@Injectable()
export class AuditRetentionService {
  private readonly logger = new Logger(AuditRetentionService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(TRANSACTIONAL_AUDIT_WRITER)
    private readonly auditWriter: TransactionalAuditWriter,
  ) {}

  private clampScanLimit(value: number | undefined): number {
    if (value === undefined) return DEFAULT_AUDIT_RETENTION_SCAN_LIMIT;
    if (!Number.isFinite(value)) return DEFAULT_AUDIT_RETENTION_SCAN_LIMIT;
    return Math.min(Math.max(Math.floor(value), 1), MAX_AUDIT_RETENTION_ROWS);
  }

  async plan(
    input: { now?: Date; scanLimit?: number } = {},
  ): Promise<AuditRetentionPlan> {
    const now = input.now ?? new Date();
    const scanLimit = this.clampScanLimit(input.scanLimit);
    const manager = this.dataSource.manager;

    const aggregates = (await manager.query(
      `SELECT action, COUNT(*)::int AS total, MIN(created_at) AS oldest
         FROM audit_logs
        GROUP BY action
        ORDER BY action ASC`,
    )) as AggregateRow[];

    const actions = aggregates.map((row) => row.action);
    const cutoffs = actions.map((action) => auditRetentionCutoff(action, now));
    const eligibleByAction = new Map<string, number>();
    if (actions.length > 0) {
      const eligibleRows = (await manager.query(
        `SELECT a.action AS action, COUNT(al.*)::int AS eligible
           FROM unnest($1::text[], $2::timestamptz[]) AS a(action, cutoff)
           LEFT JOIN audit_logs al
             ON al.action = a.action AND al.created_at < a.cutoff
          GROUP BY a.action`,
        [actions, cutoffs],
      )) as EligibleRow[];
      for (const row of eligibleRows) {
        eligibleByAction.set(row.action, Number(row.eligible));
      }
    }

    const prefix = await this.scanPrefix(manager, scanLimit, now);

    const actionPlans: AuditRetentionActionPlan[] = aggregates.map((row) => ({
      action: row.action,
      retentionDays: resolveAuditRetentionDays(row.action),
      totalRows: Number(row.total),
      eligibleRows: eligibleByAction.get(row.action) ?? 0,
      oldestCreatedAt: row.oldest ? new Date(row.oldest).toISOString() : null,
    }));

    return {
      generatedAt: now.toISOString(),
      defaultRetentionDays: DEFAULT_AUDIT_RETENTION_DAYS,
      actions: actionPlans,
      eligibleRows: actionPlans.reduce((sum, row) => sum + row.eligibleRows, 0),
      prunablePrefixRows: prefix.count,
      prunableUpToSequence: prefix.boundary?.sequence ?? null,
      scanLimit,
      scanTruncated: prefix.scanned === scanLimit,
    };
  }

  /** Zincirin başından itibaren saklama süresi dolmuş kesintisiz prefix. */
  private async scanPrefix(
    manager: EntityManager,
    scanLimit: number,
    now: Date,
    maxRows: number = MAX_AUDIT_RETENTION_ROWS,
  ): Promise<{
    scanned: number;
    count: number;
    boundary: { sequence: number; headHash: string } | null;
  }> {
    const rows = (await manager.query(
      `SELECT seq, action, created_at, entry_hash
         FROM audit_logs
        ORDER BY seq ASC
        LIMIT $1`,
      [scanLimit],
    )) as PrefixRow[];

    let count = 0;
    let boundary: { sequence: number; headHash: string } | null = null;
    for (const row of rows) {
      if (count >= maxRows) break;
      if (!isAuditRecordRetentionEligible(row.action, row.created_at, now)) break;
      count += 1;
      boundary = { sequence: Number(row.seq), headHash: row.entry_hash };
    }
    return { scanned: rows.length, count, boundary };
  }

  async prune(input: AuditRetentionPruneInput): Promise<AuditRetentionPruneResult> {
    const reason = String(input.reason ?? '').trim();
    if (!RETENTION_REASON_PATTERN.test(reason)) {
      throw new TypeError(
        'reason must match ^[a-z0-9_.:-]{3,60}$ (ör. scheduled.retention.2026q3)',
      );
    }
    const maxRows =
      input.maxRows === undefined
        ? MAX_AUDIT_RETENTION_ROWS
        : Math.min(Math.max(Math.floor(input.maxRows), 1), MAX_AUDIT_RETENTION_ROWS);
    const now = input.now ?? new Date();
    const scanLimit = this.clampScanLimit(input.scanLimit);

    const plan = await this.plan({ now, scanLimit });

    const outcome = await this.dataSource.transaction(
      async (manager: EntityManager) => {
        // Zincir başını yazarlara karşı serileştir (aynı advisory lock).
        await manager.query(`SELECT pg_advisory_xact_lock($1)`, [
          AUDIT_CHAIN_LOCK_KEY,
        ]);
        const prefix = await this.scanPrefix(manager, scanLimit, now, maxRows);

        let checkpoint: AuditRetentionCheckpoint | null = null;
        if (prefix.boundary) {
          const { key, keyId } = resolveAuditHmacKey();
          const signature = signAuditEntryHash(prefix.boundary.headHash, key);
          // Dry-run'da checkpoint yalnızca RAPORLANIR (persist edilmez).
          checkpoint = {
            upToSequence: prefix.boundary.sequence,
            headHash: prefix.boundary.headHash,
            signatureKeyId: keyId,
          };

          if (!input.dryRun) {
            await manager.query(
              `INSERT INTO "audit_chain_checkpoints"
                 (up_to_sequence, head_hash, signature, signature_key_id, reason, pruned_row_count, created_by_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [
                prefix.boundary.sequence,
                prefix.boundary.headHash,
                signature,
                keyId,
                reason,
                prefix.count,
                input.actorUserId,
              ],
            );
            await manager.query('DELETE FROM audit_logs WHERE seq <= $1', [
              prefix.boundary.sequence,
            ]);
          }
        }

        // Kırpma ÇALIŞMASI (kırpılacak kayıt olmasa bile) durable audit kaydı
        // üretir: no-op koşular da denetlenebilir kalır.
        await this.auditWriter.write(manager, 'audit.retention.pruned', {
          schemaVersion: 1,
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          actorSessionId: null,
          requestId: input.requestId,
          entityType: 'audit',
          entityId: input.tenantId,
          result: 'success',
          changedFields: ['prunedRowCount', 'upToSequence'],
          prunedRowCount: prefix.count,
          ...(prefix.boundary
            ? { upToSequence: String(prefix.boundary.sequence) }
            : {}),
          dryRun: input.dryRun,
        });

        return { prunedRows: prefix.count, checkpoint };
      },
    );

    this.logger.log(
      JSON.stringify({
        event: 'audit.retention.pruned',
        dryRun: input.dryRun,
        reason,
        prunedRows: outcome.prunedRows,
        upToSequence: outcome.checkpoint?.upToSequence ?? null,
      }),
    );

    return { dryRun: input.dryRun, ...outcome, plan };
  }
}
