import { AuditQueryService } from './audit-query.service';
import { AuditLogRepository } from './audit-log.repository';

/**
 * Audit okuma + doğrulama servisi (#259): KVKK maskeli okuma, okuma audit'i ve
 * checkpoint'ten başlayan zincir doğrulaması.
 */
describe('AuditQueryService (#259)', () => {
  const TENANT_ID = '11111111-1111-4111-8111-111111111111';
  const ACTOR_ID = '22222222-2222-4222-8222-222222222222';

  const repository = {
    findTenantScoped: jest.fn(),
  } as unknown as AuditLogRepository;

  const auditWriter = { write: jest.fn(async () => undefined) };

  function makeDataSource(queryImpl: (sql: string, params?: unknown[]) => unknown) {
    return {
      manager: {},
      query: jest.fn(async (sql: string, params?: unknown[]) => queryImpl(sql, params)),
      transaction: jest.fn(async (cb: (manager: unknown) => Promise<void>) => cb({})),
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('masks PII in returned rows and audits the sensitive read', async () => {
    (repository.findTenantScoped as jest.Mock).mockResolvedValue([
      {
        id: 'row-1',
        tenantId: TENANT_ID,
        actorUserId: ACTOR_ID,
        actorSessionId: null,
        action: 'attendance.record.marked',
        entityType: 'attendance',
        entityId: 'row-entity',
        requestId: 'req-1',
        metadataJson: { notes: 'Veli 0532 111 22 33', status: 'absent' },
        createdAt: new Date('2026-09-22T00:00:00.000Z'),
      },
    ]);
    const dataSource = makeDataSource(() => []);
    const service = new AuditQueryService(
      dataSource as never,
      repository,
      auditWriter as never,
    );

    const result = await service.list(
      { tenantId: TENANT_ID },
      { actorUserId: ACTOR_ID, actorSessionId: null, requestId: 'req-read' },
    );

    // KVKK: PII alanı maskelendi, maskeleme kanıtı üretildi.
    expect(result.rows[0].metadataJson).toEqual({
      notes: '[REDACTED]',
      status: 'absent',
    });
    expect(result.receipt.redactedFieldCount).toBe(1);
    expect(result.receipt.strategy).toBe('full-redact');

    // Hassas okuma durable audit'e yazıldı (redactionReceipt ile).
    expect(auditWriter.write).toHaveBeenCalledWith(
      {},
      'dataprotection.export.redacted',
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_ID,
        requestId: 'req-read',
        entityType: 'dataprotection',
        redactionReceipt: expect.objectContaining({ redactedFieldCount: 1 }),
      }),
    );
  });

  it('verifies the chain starting from the last retention checkpoint', async () => {
    const dataSource = makeDataSource((sql) => {
      if (sql.includes('FROM audit_chain_checkpoints')) {
        return [
          {
            up_to_sequence: '10',
            head_hash: 'a'.repeat(64),
            signature_key_id: 'key-1',
            created_at: new Date('2026-09-22T00:00:00.000Z'),
          },
        ];
      }
      return [];
    });
    const service = new AuditQueryService(
      dataSource as never,
      repository,
      auditWriter as never,
    );

    const result = await service.verify({ tenantId: TENANT_ID });

    expect(result.startedFromCheckpoint).toBe(true);
    expect(result.lastCheckpoint).toMatchObject({ upToSequence: 10, headHash: 'a'.repeat(64) });
    expect(result.checkedRows).toBe(0);
    expect(result.valid).toBe(true);
  });

  it('reports an empty chain as valid when no checkpoint exists', async () => {
    const dataSource = makeDataSource(() => []);
    const service = new AuditQueryService(
      dataSource as never,
      repository,
      auditWriter as never,
    );

    const result = await service.verify({ tenantId: TENANT_ID, limit: 10 });

    expect(result.startedFromCheckpoint).toBe(false);
    expect(result.lastCheckpoint).toBeNull();
    expect(result).toMatchObject({ valid: true, reason: null });
  });
});
