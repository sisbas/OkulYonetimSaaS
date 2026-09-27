import { AuditQueryService } from './audit-query.service';
import { AuditLogRepository } from './audit-log.repository';
import {
  AUDIT_CHAIN_GENESIS_HASH,
  AuditChainPayload,
  computeAuditEntryHash,
  signAuditEntryHash,
} from './audit-chain';

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

  // Rotasyon sözleşmesi (#259 review P1): doğrulama anahtarı satırın
  // `signature_key_id`'siyle seçilir; emekliye ayrılmış anahtar
  // AUDIT_HMAC_PREVIOUS_KEYS ile doğrulama için elde tutulur.
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
  });

  afterEach(() => {
    for (const key of ROTATION_ENV_KEYS) {
      const value = envBackup[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

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

  /**
   * Zincir satırı üretimi gerçek üretim fonksiyonlarıyla (hash + HMAC) yapılır;
   * böylece doğrulama yolu uçtan uca sınanır.
   */
  function auditRow(input: {
    seq: number;
    prevHash: string;
    signatureKeyId: string;
    signatureKey: string;
  }) {
    const payload: AuditChainPayload = {
      tenantId: TENANT_ID,
      actorUserId: ACTOR_ID,
      actorSessionId: null,
      action: 'attendance.session.closed',
      entityType: 'attendance',
      entityId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      requestId: `req-${input.seq}`,
      metadataJson: { schemaVersion: 1, result: 'success' },
      createdAt: `2026-09-22T12:00:0${input.seq}.000Z`,
    };
    const entryHash = computeAuditEntryHash(input.prevHash, payload);
    return {
      seq: input.seq,
      prev_hash: input.prevHash,
      entry_hash: entryHash,
      signature: signAuditEntryHash(entryHash, input.signatureKey),
      signature_key_id: input.signatureKeyId,
      tenant_id: payload.tenantId,
      actor_user_id: payload.actorUserId,
      actor_session_id: null,
      action: payload.action,
      entity_type: payload.entityType,
      entity_id: payload.entityId,
      request_id: payload.requestId,
      metadata_json: payload.metadataJson,
      created_at: new Date(payload.createdAt),
    };
  }

  function dataSourceWithRows(rows: readonly unknown[]) {
    return makeDataSource((sql) =>
      sql.includes('audit_chain_checkpoints') ? [] : rows,
    );
  }

  it('verifies rows signed before AND after a key rotation via signature_key_id (#259 review P1)', async () => {
    process.env.AUDIT_HMAC_KEY = ACTIVE_KEY;
    process.env.AUDIT_HMAC_KEY_ID = ACTIVE_KEY_ID;
    process.env.AUDIT_HMAC_PREVIOUS_KEYS = JSON.stringify({
      [RETIRED_KEY_ID]: RETIRED_KEY,
    });

    const retired = auditRow({
      seq: 1,
      prevHash: AUDIT_CHAIN_GENESIS_HASH,
      signatureKeyId: RETIRED_KEY_ID,
      signatureKey: RETIRED_KEY,
    });
    const active = auditRow({
      seq: 2,
      prevHash: retired.entry_hash,
      signatureKeyId: ACTIVE_KEY_ID,
      signatureKey: ACTIVE_KEY,
    });
    const service = new AuditQueryService(
      dataSourceWithRows([retired, active]) as never,
      repository,
      auditWriter as never,
    );

    // Tek sabit anahtar kullanılsaydı 1. satır 'signature-mismatch' ile düşerdi.
    await expect(service.verify({ tenantId: TENANT_ID })).resolves.toMatchObject({
      valid: true,
      reason: null,
      checkedRows: 2,
    });
  });

  it('fails closed when the retired key for a row key id is not retained (#259 review P1)', async () => {
    process.env.AUDIT_HMAC_KEY = ACTIVE_KEY;
    process.env.AUDIT_HMAC_KEY_ID = ACTIVE_KEY_ID;
    delete process.env.AUDIT_HMAC_PREVIOUS_KEYS;

    const retired = auditRow({
      seq: 1,
      prevHash: AUDIT_CHAIN_GENESIS_HASH,
      signatureKeyId: RETIRED_KEY_ID,
      signatureKey: RETIRED_KEY,
    });
    const service = new AuditQueryService(
      dataSourceWithRows([retired]) as never,
      repository,
      auditWriter as never,
    );

    await expect(service.verify({ tenantId: TENANT_ID })).resolves.toMatchObject({
      valid: false,
      brokenAtSequence: 1,
      reason: 'unknown-signature-key',
    });
  });

  it('rejects a row whose signature does not match the key selected by its key id', async () => {
    process.env.AUDIT_HMAC_KEY = ACTIVE_KEY;
    process.env.AUDIT_HMAC_KEY_ID = ACTIVE_KEY_ID;
    process.env.AUDIT_HMAC_PREVIOUS_KEYS = JSON.stringify({
      [RETIRED_KEY_ID]: RETIRED_KEY,
    });

    // key-id AKTİF anahtarı işaret ediyor ama imza emekliye ayrılmış anahtarla
    // üretilmiş → doğrulama başarısız (yanlış key-id kabul edilmez).
    const mismatched = auditRow({
      seq: 1,
      prevHash: AUDIT_CHAIN_GENESIS_HASH,
      signatureKeyId: ACTIVE_KEY_ID,
      signatureKey: RETIRED_KEY,
    });
    const service = new AuditQueryService(
      dataSourceWithRows([mismatched]) as never,
      repository,
      auditWriter as never,
    );

    await expect(service.verify({ tenantId: TENANT_ID })).resolves.toMatchObject({
      valid: false,
      brokenAtSequence: 1,
      reason: 'signature-mismatch',
    });
  });

  it('rejects a malformed retired-key configuration at startup (fail-closed)', () => {
    process.env.AUDIT_HMAC_PREVIOUS_KEYS = 'not-json';

    expect(
      () => new AuditQueryService({} as never, repository, auditWriter as never),
    ).toThrow(/AUDIT_HMAC_PREVIOUS_KEYS/);
  });
});
