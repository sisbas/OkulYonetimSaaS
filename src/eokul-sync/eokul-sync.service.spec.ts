import { Test } from '@nestjs/testing';
import { EokulSyncService } from './eokul-sync.service';
import { EokulEntityType } from './eokul-sync.entity';

describe('EokulSyncService release quarantine (#268)', () => {
  it.each(['tenant-a', 'tenant-b', '', '=formula']) (
    'denies sync and history without repositories for %j', async (tenant) => {
      const module = await Test.createTestingModule({ providers: [EokulSyncService] }).compile();
      try {
        const service = module.get(EokulSyncService);
        await expect(service.syncEntity(tenant, EokulEntityType.STUDENT)).rejects.toMatchObject({
          response: { statusCode: 503, code: 'EOKUL_QUARANTINED' },
        });
        await expect(service.listRuns(tenant)).rejects.toMatchObject({
          response: { statusCode: 503, code: 'EOKUL_QUARANTINED' },
        });
      } finally {
        await module.close();
      }
    },
  );
});
