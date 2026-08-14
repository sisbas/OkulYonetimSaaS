import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EokulSyncService } from './eokul-sync.service';
import { EokulSyncRun, EokulSyncStatus, EokulEntityType } from './eokul-sync.entity';
import { MockEokulAdapter, EokulAdapter, EokulRecord } from './eokul-adapter';

// Rate-limit'siz, deterministik mock adapter (test için).
class FastMockAdapter implements EokulAdapter {
  readonly name = 'fast-mock';
  async fetchBatch(opts: {
    tenantId: string;
    entityType: string;
    cursor?: string | null;
    limit?: number;
  }): Promise<{ records: EokulRecord[]; nextCursor: string | null }> {
    const limit = opts.limit ?? 10;
    const cursorNum = opts.cursor ? Number.parseInt(opts.cursor, 10) : 0;
    const records: EokulRecord[] = [];
    for (let i = 0; i < limit; i += 1) {
      const idx = cursorNum + i;
      records.push({
        externalId: `MEB-${opts.entityType}-${idx}`,
        entityType: opts.entityType as EokulRecord['entityType'],
        payload: { studentName: `Öğrenci ${idx}`, studentTcKimlikNo: `111${idx}` },
      });
    }
    const nextCursor = cursorNum + limit < 20 ? String(cursorNum + limit) : null;
    return { records, nextCursor };
  }
}

describe('EokulSyncService (OKUL-05)', () => {
  let service: EokulSyncService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let runRepo: any;

  beforeEach(async () => {
    const mockRepo = {
      create: jest.fn((entityLike) => ({ ...entityLike })),
      save: jest.fn(async (entity) => entity),
      find: jest.fn(async () => []),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        EokulSyncService,
        {
          provide: getRepositoryToken(EokulSyncRun),
          useValue: mockRepo,
        },
      ],
    }).compile();
    service = moduleRef.get(EokulSyncService);
    runRepo = moduleRef.get(getRepositoryToken(EokulSyncRun));
    // Adapter'ı fast versiyonla değiştir (rate-limit engellemesin).
    (service as unknown as { adapter: EokulAdapter }).adapter = new FastMockAdapter();
  });

  it('mock adapter fetches records with externalId', async () => {
    const adapter = new MockEokulAdapter(0);
    const batch = await adapter.fetchBatch({
      tenantId: 't1',
      entityType: 'student',
      cursor: null,
      limit: 2,
    });
    expect(batch.records.length).toBe(2);
    expect(batch.records[0].externalId).toContain('MEB-student-');
  });

  it('syncEntity returns completed status for healthy adapter', async () => {
    const result = await service.syncEntity('t1', EokulEntityType.STUDENT);
    expect([EokulSyncStatus.COMPLETED, EokulSyncStatus.PARTIAL]).toContain(result.status);
    expect(result.recordsTotal).toBeGreaterThan(0);
  });

  it('runRepo is injected', () => {
    expect(runRepo).toBeDefined();
  });
});
