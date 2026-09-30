import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { EokulSyncRun, EokulSyncStatus, EokulEntityType } from './eokul-sync.entity';

export interface SyncResult {
  runId: string;
  status: EokulSyncStatus;
  recordsTotal: number;
  recordsUpserted: number;
  recordsFailed: number;
}

/** Planning-only (#268): no mock adapter can claim runtime sync success. */
@Injectable()
export class EokulSyncService {
  private unavailable(): never {
    throw new ServiceUnavailableException({
      statusCode: 503,
      code: 'EOKUL_QUARANTINED',
      message: 'Eokul sync is planning-only and out of release scope.',
    });
  }

  async syncEntity(_tenantId: string, _entityType: EokulEntityType): Promise<SyncResult> {
    return this.unavailable();
  }

  async listRuns(_tenantId: string): Promise<EokulSyncRun[]> {
    return this.unavailable();
  }
}
