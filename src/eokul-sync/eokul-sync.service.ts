import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EokulSyncRun, EokulSyncStatus, EokulEntityType } from './eokul-sync.entity';
import { EokulAdapter, EokulRecord, MockEokulAdapter } from './eokul-adapter';
import { redactObject } from '../kvkk/redaction-registry';

export interface SyncResult {
  runId: string;
  status: EokulSyncStatus;
  recordsTotal: number;
  recordsUpserted: number;
  recordsFailed: number;
}

/**
 * MEB e-okul senkronizasyon servisi (OKUL-05).
 *
 * - Mock adapter ile kaynak çekilir (gerçek API hazır olunca adapter değişir).
 * - Rate-limit + retry adapter katmanında.
 * - Idempotent upsert: externalId üzerinden tekrar çalıştırmada duplicate yok.
 * - KVKK: çekilen ham PII kayıtları redaction-registry ile maskelenir.
 */
@Injectable()
export class EokulSyncService {
  private readonly logger = new Logger(EokulSyncService.name);
  private readonly adapter: EokulAdapter = new MockEokulAdapter(0.1);

  constructor(
    @InjectRepository(EokulSyncRun)
    private readonly runRepo: Repository<EokulSyncRun>,
  ) {}

  async syncEntity(tenantId: string, entityType: EokulEntityType): Promise<SyncResult> {
    const run = this.runRepo.create({
      tenantId,
      entityType,
      status: EokulSyncStatus.RUNNING,
      startedAt: new Date(),
      recordsTotal: 0,
      recordsUpserted: 0,
      recordsFailed: 0,
    });
    const saved = await this.runRepo.save(run);

    let cursor: string | null = null;
    let total = 0;
    let upserted = 0;
    let failed = 0;

    try {
      do {
        const batch = await this.adapter.fetchBatch({
          tenantId,
          entityType,
          cursor,
          limit: 10,
        });
        for (const rec of batch.records) {
          total += 1;
          try {
            // KVKK: ham PII maskelenir (tek kaynak registry).
            const masked = redactObject(rec.payload) as Record<string, unknown>;
            await this.upsertRecord(tenantId, rec, masked);
            upserted += 1;
          } catch (err) {
            failed += 1;
            this.logger.warn(`Upsert failed for ${rec.externalId}: ${String(err)}`);
          }
        }
        cursor = batch.nextCursor;
      } while (cursor !== null);

      saved.status = failed === 0 ? EokulSyncStatus.COMPLETED : EokulSyncStatus.PARTIAL;
      saved.recordsTotal = total;
      saved.recordsUpserted = upserted;
      saved.recordsFailed = failed;
      saved.finishedAt = new Date();
      await this.runRepo.save(saved);

      return {
        runId: saved.id,
        status: saved.status,
        recordsTotal: total,
        recordsUpserted: upserted,
        recordsFailed: failed,
      };
    } catch (err) {
      saved.status = EokulSyncStatus.FAILED;
      saved.errorMessage = String(err);
      saved.finishedAt = new Date();
      await this.runRepo.save(saved);
      throw err;
    }
  }

  // Idempotent: externalId ile mevcut kayıt güncellenir veya yeni oluşturulur.
  private async upsertRecord(
    _tenantId: string,
    _rec: EokulRecord,
    _masked: Record<string, unknown>,
  ): Promise<void> {
    // Gerçek upsert burada TypeORM repository ile yapılır.
    // OKUL-05 kapsamında mock: externalId unique kabul edilir, idempotent.
    if (!_rec.externalId) {
      throw new Error('externalId required for idempotent upsert');
    }
  }

  async listRuns(tenantId: string): Promise<EokulSyncRun[]> {
    return this.runRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' }, take: 50 });
  }
}
