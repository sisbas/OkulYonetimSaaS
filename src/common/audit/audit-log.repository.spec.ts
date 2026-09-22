import { AuditLogRepository } from './audit-log.repository';
import { PersistableAuditRecord } from './transactional-audit.types';
import {
  AUDIT_CHAIN_GENESIS_HASH,
  AUDIT_CHAIN_LOCK_KEY,
  TEST_AUDIT_HMAC_KEY,
  computeAuditEntryHash,
  signAuditEntryHash,
} from './audit-chain';

/**
 * Audit zinciri uzatma (#259): prev_hash bağlama, advisory lock ile
 * serileştirme, HMAC imzası ve genesis davranışı.
 */
describe('AuditLogRepository.insert chain extension (#259)', () => {
  const record: PersistableAuditRecord = {
    tenantId: '11111111-1111-4111-8111-111111111111',
    actorUserId: '22222222-2222-4222-8222-222222222222',
    actorSessionId: null,
    action: 'attendance.record.marked',
    entityType: 'attendance',
    entityId: '33333333-3333-4333-8333-333333333333',
    requestId: 'req-1',
    metadataJson: {
      schemaVersion: 1,
      result: 'success',
      changedFields: ['status'],
    },
  };

  function makeManager(head: Array<{ entry_hash: string | null }>, seq = 7) {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const query = jest.fn(async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      if (sql.includes('pg_advisory_xact_lock')) return [];
      if (sql.includes('SELECT "entry_hash"')) return head;
      if (sql.includes('INSERT INTO audit_logs')) return [{ seq }];
      return [];
    });
    return { calls, query };
  }

  const insertCall = (calls: Array<{ sql: string; params?: unknown[] }>) =>
    calls.find((call) => call.sql.includes('INSERT INTO audit_logs'))!;

  it('serializes the chain head with a transaction-scoped advisory lock', async () => {
    const manager = makeManager([]);
    await new AuditLogRepository().insert(manager as never, record);

    expect(manager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock($1)',
      [AUDIT_CHAIN_LOCK_KEY],
    );
    // Kilit, zincir başını okumadan ÖNCE alınmalıdır.
    const lockIndex = manager.calls.findIndex((call) =>
      call.sql.includes('pg_advisory_xact_lock'),
    );
    const headIndex = manager.calls.findIndex((call) =>
      call.sql.includes('SELECT "entry_hash"'),
    );
    expect(lockIndex).toBeGreaterThanOrEqual(0);
    expect(headIndex).toBeGreaterThan(lockIndex);
  });

  it('links the first entry to the genesis hash and signs it', async () => {
    const manager = makeManager([]);
    const result = await new AuditLogRepository().insert(manager as never, record);

    const params = insertCall(manager.calls).params!;
    const createdAt = params[8] as Date;
    const prevHash = params[9] as string;
    const entryHash = params[10] as string;
    const signature = params[11] as string;
    const keyId = params[12] as string;

    expect(prevHash).toBe(AUDIT_CHAIN_GENESIS_HASH);
    expect(entryHash).toBe(
      computeAuditEntryHash(AUDIT_CHAIN_GENESIS_HASH, {
        tenantId: record.tenantId,
        actorUserId: record.actorUserId,
        actorSessionId: record.actorSessionId,
        action: record.action,
        entityType: record.entityType,
        entityId: record.entityId,
        requestId: record.requestId,
        metadataJson: record.metadataJson,
        createdAt: createdAt.toISOString(),
      }),
    );
    expect(signature).toBe(signAuditEntryHash(entryHash, TEST_AUDIT_HMAC_KEY));
    expect(keyId).toBe('local-test-key');
    expect(result).toEqual({
      sequence: 7,
      prevHash: AUDIT_CHAIN_GENESIS_HASH,
      entryHash,
      signatureKeyId: 'local-test-key',
    });
  });

  it('links a subsequent entry to the previous entry hash', async () => {
    const previousHash = 'a'.repeat(64);
    const manager = makeManager([{ entry_hash: previousHash }]);
    const result = await new AuditLogRepository().insert(manager as never, record);

    expect(result.prevHash).toBe(previousHash);
    expect(insertCall(manager.calls).params![9]).toBe(previousHash);
  });

  it('fails closed when the HMAC key is missing in production', async () => {
    // Repository local/test env ile kurulur; env sonradan production'a çevrilir
    // (bootstrap doğrulaması ayrı testte ele alınır).
    const repository = new AuditLogRepository();
    const manager = makeManager([]);
    const previousEnv = { ...process.env };
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.AUDIT_HMAC_KEY;
      await expect(
        repository.insert(manager as never, record),
      ).rejects.toThrow(/AUDIT_HMAC_KEY is required in production/);
    } finally {
      process.env = previousEnv;
    }
  });

  it('rejects a production bootstrap with a missing HMAC key (fail-fast at startup)', () => {
    const previousEnv = { ...process.env };
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.AUDIT_HMAC_KEY;
      // DI sağlayıcısı uygulama başlangıcında oluşturulur; eksik anahtar
      // yapılandırması ilk yazımı beklemeden reddedilmelidir.
      expect(() => new AuditLogRepository()).toThrow(
        /AUDIT_HMAC_KEY is required in production/,
      );
    } finally {
      process.env = previousEnv;
    }
  });

  it('rejects a weak production HMAC key at startup', () => {
    const previousEnv = { ...process.env };
    try {
      process.env.NODE_ENV = 'production';
      process.env.AUDIT_HMAC_KEY = 'weak-key';
      expect(() => new AuditLogRepository()).toThrow(/too weak/);
    } finally {
      process.env = previousEnv;
    }
  });
});
