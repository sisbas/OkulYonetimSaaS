import { AuditQueryService } from './audit-query.service';
import { AuditLogRepository } from './audit-log.repository';
import { resolveAuditHmacKey, signAuditEntryHash } from './audit-chain';

/**
 * Audit okuma servisi (#259): KVKK maskeli okuma ve okuma audit'i.
 *
 * #373: `verify()` metodu kaldırıldı — global zincir doğrulaması hiçbir
 * runtime yüzeyine açık değil. `verifyAuditChain` pure fonksiyonu
 * `audit-chain.ts` + `audit-chain.spec.ts` içinde korunuyor.
 */
describe('AuditQueryService (#259)', () => {
  const TENANT_ID = '11111111-1111-4111-8111-111111111111';
  const ACTOR_ID = '22222222-2222-4222-8222-222222222222';

  const repository = {
    findTenantScoped: jest.fn(),
  } as unknown as AuditLogRepository;

  const auditWriter = { write: jest.fn(async () => undefined) };

  const ACTIVE_KEY = 'active-audit-hmac-key-with-32-chars-mini';
  const RETIRED_KEY = 'retired-audit-hmac-key-with-32-chars-min';
  const ACTIVE_KEY_ID = 'key-2026-09';
  const RETIRED_KEY_ID = 'key-2026-01';
  const ROTATION_ENV_KEYS = [
    'AUDIT_HMAC_KEY',
    'AUDIT_HMAC_KEY_ID',
    'AUDIT_HMAC_PREVIOUS_KEYS',
  ] as const;
  const envBackup: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ROTATION_ENV_KEYS) envBackup[key] = process.env[key];
    jest.clearAllMocks();
  });

  afterEach(() => {
    for (const key of ROTATION_ENV_KEYS) {
      const value = envBackup[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  function makeDataSource(queryImpl?: (sql: string) => unknown) {
    return {
      manager: {},
      query: jest.fn(async (sql: string) => queryImpl?.(sql) ?? []),
      transaction: jest.fn(async (cb: (manager: unknown) => Promise<void>) => cb({})),
    };
  }

  function makeService(dataSource: ReturnType<typeof makeDataSource>) {
    return new AuditQueryService(dataSource as never, repository, auditWriter as never);
  }

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
    const dataSource = makeDataSource();
    const service = makeService(dataSource);

    const result = await service.list(
      { tenantId: TENANT_ID },
      { actorUserId: ACTOR_ID, actorSessionId: null, requestId: 'req-read' },
    );

    expect(repository.findTenantScoped).toHaveBeenCalledWith(
      dataSource.manager,
      { tenantId: TENANT_ID },
      ACTOR_ID,
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

  it.each([
    { up_to_sequence: '-1' },
    { up_to_sequence: '1.5' },
    { up_to_sequence: '0' },
    { up_to_sequence: '9007199254740993' },
    { head_hash: 'invalid' },
    { head_hash: 'b'.repeat(64) },
    { signature: null },
    { signature: '' },
    { signature: 'z'.repeat(64) },
    { signature: 'a'.repeat(63) },
    { signature: 'b'.repeat(64) },
    { signature_key_id: null },
    { signature_key_id: '' },
    { signature_key_id: 'unknown' },
    { created_at: null },
    { created_at: 'invalid' },
  ])('rejects corrupted checkpoint: %j', async (mutation) => {
    const { key, keyId } = resolveAuditHmacKey();
    const base = {
      up_to_sequence: '10',
      head_hash: 'a'.repeat(64),
      signature: signAuditEntryHash('a'.repeat(64), key),
      signature_key_id: keyId,
      created_at: new Date('2026-09-22T00:00:00Z'),
    };
    const dataSource = makeDataSource(() => [{ ...base, ...mutation }]);
    const service = makeService(dataSource);
    await expect(service.lastCheckpoint()).rejects.toThrow(/Audit checkpoint rejected/);
  });

  it('authenticates a checkpoint signed by a retired key', async () => {
    process.env.AUDIT_HMAC_KEY = ACTIVE_KEY;
    process.env.AUDIT_HMAC_KEY_ID = ACTIVE_KEY_ID;
    process.env.AUDIT_HMAC_PREVIOUS_KEYS = JSON.stringify({ [RETIRED_KEY_ID]: RETIRED_KEY });
    const retiredCheckpoint = {
      up_to_sequence: '10',
      head_hash: 'a'.repeat(64),
      signature: signAuditEntryHash('a'.repeat(64), RETIRED_KEY),
      signature_key_id: RETIRED_KEY_ID,
      created_at: new Date('2026-09-22T00:00:00Z'),
    };
    const dataSource = makeDataSource(() => [retiredCheckpoint]);
    const service = makeService(dataSource);
    const checkpoint = await service.lastCheckpoint();
    expect(checkpoint).toMatchObject({ upToSequence: 10, headHash: 'a'.repeat(64) });

    // Retired key removed → checkpoint rejected.
    delete process.env.AUDIT_HMAC_PREVIOUS_KEYS;
    const dataSourceWithoutRetiredKey = makeDataSource(() => [retiredCheckpoint]);
    const serviceWithoutRetiredKey = makeService(dataSourceWithoutRetiredKey);
    await expect(serviceWithoutRetiredKey.lastCheckpoint()).rejects.toThrow(
      /unknown signature key/,
    );
  });

  it('returns null when no checkpoint exists', async () => {
    const service = makeService(makeDataSource());
    await expect(service.lastCheckpoint()).resolves.toBeNull();
  });

  it('rejects a malformed retired-key configuration at startup (fail-closed)', () => {
    process.env.AUDIT_HMAC_PREVIOUS_KEYS = 'not-json';
    expect(() => makeService(makeDataSource())).toThrow(/AUDIT_HMAC_PREVIOUS_KEYS/);
  });

  it('does not expose a verify method (#373 permanent quarantine)', () => {
    const service = makeService(makeDataSource());
    expect(typeof (service as unknown as Record<string, unknown>).verify).toBe('undefined');
  });
});
