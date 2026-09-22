import { DataSource } from 'typeorm';

import { AuditLogRepository } from '../../src/common/audit/audit-log.repository';
import {
  AUDIT_CHAIN_GENESIS_HASH,
  TEST_AUDIT_HMAC_KEY,
  computeAuditEntryHash,
  signAuditEntryHash,
  verifyAuditChain,
} from '../../src/common/audit/audit-chain';
import { PersistableAuditRecord } from '../../src/common/audit/transactional-audit.types';

/**
 * AC-7 (#259/#265): GERÇEK PostgreSQL üzerinde audit zinciri eşzamanlılık ve
 * kurcalama tespiti kanıtı.
 *
 * - Paralel yazımlar `pg_advisory_xact_lock` ile serileşir; zincir çatallanmaz.
 * - Satır sonradan değiştirilirse zincir doğrulaması kırılır (tamper-evidence).
 * - Kuyruktan satır silinirse yayınlanmış head checkpoint ile tespit edilir.
 *
 * Yerelde `DATABASE_URL` yoksa suite skip olur; CI DB Smoke (gerçek PostgreSQL)
 * `test:database:required` ile bu suite'i skip'siz çalıştırır.
 */
const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const describeWithPostgres = DATABASE_URL ? describe : describe.skip;

const TENANT_ID = '10000000-0000-4000-8000-000000000265';
const ACTOR_ID = '30000000-0000-4000-8000-000000000265';

type AuditRow = {
  seq: string | number;
  prev_hash: string;
  entry_hash: string;
  signature: string;
  signature_key_id: string;
  tenant_id: string;
  actor_user_id: string | null;
  actor_session_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  request_id: string;
  metadata_json: Record<string, unknown>;
  created_at: Date;
};

function toVerifiable(row: AuditRow) {
  return {
    sequence: Number(row.seq),
    prevHash: row.prev_hash,
    entryHash: row.entry_hash,
    signature: row.signature,
    signatureKeyId: row.signature_key_id,
    payload: {
      tenantId: row.tenant_id,
      actorUserId: row.actor_user_id,
      actorSessionId: row.actor_session_id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      requestId: row.request_id,
      metadataJson: row.metadata_json,
      createdAt: row.created_at.toISOString(),
    },
  };
}

describeWithPostgres('audit chain PostgreSQL concurrency (#259, AC-7)', () => {
  jest.setTimeout(30_000);

  let dataSource: DataSource;
  let repository: AuditLogRepository;

  const record = (index: number): PersistableAuditRecord => ({
    tenantId: TENANT_ID,
    actorUserId: ACTOR_ID,
    actorSessionId: null,
    action: 'attendance.record.marked',
    entityType: 'attendance',
    entityId: '33333333-3333-4333-8333-333333333333',
    requestId: `req-concurrency-${index}`,
    metadataJson: {
      schemaVersion: 1,
      result: 'success',
      changedFields: ['status'],
      valueEvidence: { newStatus: 'present' },
    },
  });

  const readChain = async (): Promise<AuditRow[]> =>
    (await dataSource.query(
      `SELECT seq, prev_hash, entry_hash, signature, signature_key_id,
              tenant_id, actor_user_id, actor_session_id, action,
              entity_type, entity_id, request_id, metadata_json, created_at
         FROM audit_logs
        WHERE tenant_id = $1
        ORDER BY seq ASC`,
      [TENANT_ID],
    )) as AuditRow[];

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      url: DATABASE_URL as string,
      synchronize: false,
      logging: false,
    });
    await dataSource.initialize();

    await dataSource.query(
      `INSERT INTO tenants (id, name, slug, status, timezone, deleted_at)
       VALUES ($1, $2, $3, 'active', 'Europe/Istanbul', NULL)
       ON CONFLICT (id) DO UPDATE SET status = 'active', deleted_at = NULL`,
      [TENANT_ID, 'Audit Chain Concurrency Tenant', 'audit-chain-concurrency'],
    );
    await dataSource.query(
      `INSERT INTO users (id, email, credential_hash, full_name, status, token_version)
       VALUES ($1, $2, $3, $4, 'active', 1)
       ON CONFLICT (id) DO UPDATE SET status = 'active'`,
      [ACTOR_ID, 'audit-chain-actor@example.test', 'x', 'Audit Chain Actor'],
    );

    repository = new AuditLogRepository();
  });

  beforeEach(async () => {
    await dataSource.query('DELETE FROM audit_logs WHERE tenant_id = $1', [
      TENANT_ID,
    ]);
    // Retention checkpoint'i de temizle: aksi hâlde ilk satır genesis yerine
    // checkpoint head'ine bağlanır (suite izolasyonu).
    await dataSource.query('DELETE FROM audit_chain_checkpoints');
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    await dataSource.query('DELETE FROM audit_logs WHERE tenant_id = $1', [TENANT_ID]);
    await dataSource.query('DELETE FROM audit_chain_checkpoints');
    await dataSource.query('DELETE FROM users WHERE id = $1', [ACTOR_ID]);
    await dataSource.query('DELETE FROM tenants WHERE id = $1', [TENANT_ID]);
    await dataSource.destroy();
  });

  it('keeps a single unforked, fully signed chain under parallel writers', async () => {
    const writers = Array.from({ length: 8 }, (_unused, index) => index);

    await Promise.all(
      writers.map((index) =>
        dataSource.transaction((manager) => repository.insert(manager, record(index))),
      ),
    );

    const rows = await readChain();
    expect(rows).toHaveLength(writers.length);

    // Zincir bağı: genesis -> ... -> son kayıt, tek sıra (çatallanma yok).
    const sequences = rows.map((row) => Number(row.seq));
    expect(new Set(sequences).size).toBe(rows.length);
    expect(rows[0].prev_hash).toBe(AUDIT_CHAIN_GENESIS_HASH);
    for (let index = 1; index < rows.length; index += 1) {
      expect(rows[index].prev_hash).toBe(rows[index - 1].entry_hash);
    }

    // Her özet kendi prev_hash + payload'ından yeniden üretilebilmeli.
    for (const row of rows) {
      expect(computeAuditEntryHash(row.prev_hash, toVerifiable(row).payload)).toBe(
        row.entry_hash,
      );
      expect(signAuditEntryHash(row.entry_hash, TEST_AUDIT_HMAC_KEY)).toBe(
        row.signature,
      );
      expect(row.signature_key_id).toBe('local-test-key');
    }

    expect(
      verifyAuditChain(rows.map(toVerifiable), TEST_AUDIT_HMAC_KEY),
    ).toMatchObject({ valid: true, brokenAtSequence: null, reason: null });
  });

  it('detects a tampered persisted row (tamper-evidence on real data)', async () => {
    await Promise.all(
      [0, 1, 2].map((index) =>
        dataSource.transaction((manager) => repository.insert(manager, record(index))),
      ),
    );
    const before = await readChain();
    const headHash = before[before.length - 1].entry_hash as string;

    // Kurcalama: aradaki kaydın metadata'sı değiştirilir (zincir kırılmalı).
    await dataSource.query(
      `UPDATE audit_logs SET metadata_json = metadata_json || '{"result":"failure"}'::jsonb
        WHERE tenant_id = $1 AND seq = $2`,
      [TENANT_ID, before[1].seq],
    );

    const after = await readChain();
    expect(verifyAuditChain(after.map(toVerifiable), TEST_AUDIT_HMAC_KEY)).toMatchObject({
      valid: false,
      brokenAtSequence: Number(before[1].seq),
      reason: 'entry-hash-mismatch',
    });
    expect(headHash).toBe(after[after.length - 1].entry_hash);
  });

  it('detects tail truncation via the expected last sequence', async () => {
    await Promise.all(
      [0, 1, 2].map((index) =>
        dataSource.transaction((manager) => repository.insert(manager, record(index))),
      ),
    );
    const before = await readChain();
    const last = before[before.length - 1];
    const expectedLastSequence = Number(last.seq);

    await dataSource.query(
      'DELETE FROM audit_logs WHERE tenant_id = $1 AND seq = $2',
      [TENANT_ID, last.seq],
    );

    const after = await readChain();
    expect(
      verifyAuditChain(after.map(toVerifiable), { expectedLastSequence }),
    ).toMatchObject({ valid: false, reason: 'truncated-chain' });
  });

  it('detects tail truncation against a published head checkpoint', async () => {
    await Promise.all(
      [0, 1, 2].map((index) =>
        dataSource.transaction((manager) => repository.insert(manager, record(index))),
      ),
    );
    const before = await readChain();
    const expectedHeadHash = before[before.length - 1].entry_hash as string;

    await dataSource.query(
      'DELETE FROM audit_logs WHERE tenant_id = $1 AND seq = $2',
      [TENANT_ID, before[before.length - 1].seq],
    );

    const after = await readChain();
    expect(
      verifyAuditChain(after.map(toVerifiable), {
        hmacKey: TEST_AUDIT_HMAC_KEY,
        expectedHeadHash,
      }),
    ).toMatchObject({ valid: false, reason: 'head-hash-mismatch' });
  });
});
