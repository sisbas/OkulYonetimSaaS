import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { hashSync } from 'bcryptjs';
import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/auth/auth.service';

import { AuditLogRepository } from '../../src/common/audit/audit-log.repository';
import { AuditRetentionService } from '../../src/common/audit/audit-retention.service';
import {
  TEST_AUDIT_HMAC_KEY,
  verifyAuditChain,
} from '../../src/common/audit/audit-chain';
import { TypeOrmTransactionalAuditWriter } from '../../src/common/audit/transactional-audit-writer';
import { PersistableAuditRecord } from '../../src/common/audit/transactional-audit.types';

/**
 * #259 retention (AC-7): GERÇEK PostgreSQL üzerinde saklama süresi dolan
 * kayıtların kırpılması, checkpoint yazımı ve kalan zincirin checkpoint'ten
 * doğrulanabilmesi.
 *
 * Not: zincir GLOBAL olduğu için bu suite `audit_logs` + `audit_chain_checkpoints`
 * tablolarını test öncesi izole eder (CI DB disposable); böylece diğer
 * suite'lerle çapraz bağımlılık kalmaz.
 */
const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const describeWithPostgres = DATABASE_URL ? describe : describe.skip;

const TENANT_ID = '10000000-0000-4000-8000-000000000267';
const ACTOR_ID = '30000000-0000-4000-8000-000000000268';

type AuditRow = Record<string, unknown>;

describeWithPostgres('audit retention PostgreSQL (#259, AC-7)', () => {
  jest.setTimeout(30_000);

  let dataSource: DataSource;
  let repository: AuditLogRepository;
  let service: AuditRetentionService;

  const record = (index: number): PersistableAuditRecord => ({
    tenantId: TENANT_ID,
    actorUserId: ACTOR_ID,
    actorSessionId: null,
    action: 'attendance.record.marked',
    entityType: 'attendance',
    entityId: '33333333-3333-4333-8333-333333333333',
    requestId: `req-retention-${index}`,
    metadataJson: {
      schemaVersion: 1,
      result: 'success',
      changedFields: ['status'],
    },
  });

  const readChain = async (): Promise<AuditRow[]> =>
    (await dataSource.query(
      `SELECT seq, prev_hash, entry_hash, signature, signature_key_id,
              tenant_id, actor_user_id, actor_session_id, action,
              entity_type, entity_id, request_id, metadata_json, created_at
         FROM audit_logs ORDER BY seq ASC`,
    )) as AuditRow[];

  const toVerifiable = (row: AuditRow) => ({
    sequence: Number(row.seq),
    prevHash: row.prev_hash as string,
    entryHash: row.entry_hash as string,
    signature: row.signature as string,
    signatureKeyId: row.signature_key_id as string,
    payload: {
      tenantId: (row.tenant_id ?? null) as string | null,
      actorUserId: (row.actor_user_id ?? null) as string | null,
      actorSessionId: (row.actor_session_id ?? null) as string | null,
      action: row.action as string,
      entityType: (row.entity_type ?? null) as string | null,
      entityId: (row.entity_id ?? null) as string | null,
      requestId: row.request_id as string,
      metadataJson: row.metadata_json,
      createdAt: (row.created_at as Date).toISOString(),
    },
  });

  const resetChain = async () => {
    await dataSource.query('DELETE FROM audit_logs');
    await dataSource.query('DELETE FROM audit_chain_checkpoints');
  };

  /** N kayıt yaz, hepsini 8 yıl yaşlandır (saklama süresi dolmuş). */
  const seedAgedChain = async (count = 5) => {
    for (let index = 0; index < count; index += 1) {
      await dataSource.transaction((manager) => repository.insert(manager, record(index)));
    }
    await dataSource.query(`UPDATE audit_logs SET created_at = now() - INTERVAL '8 years'`);
  };

  const pruneInput = (overrides: Record<string, unknown> = {}) => ({
    dryRun: false,
    reason: 'scheduled.retention.test',
    actorUserId: ACTOR_ID,
    tenantId: TENANT_ID,
    requestId: 'req-retention-run',
    ...overrides,
  });

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
       VALUES ($1, 'Audit Retention Tenant', 'audit-retention', 'active', 'Europe/Istanbul', NULL)
       ON CONFLICT (id) DO UPDATE SET status = 'active', deleted_at = NULL`,
      [TENANT_ID],
    );
    await dataSource.query(
      `INSERT INTO users (id, email, credential_hash, full_name, status, token_version)
       VALUES ($1, 'audit-retention@example.test', 'x', 'Audit Retention', 'active', 1)
       ON CONFLICT (id) DO UPDATE SET status = 'active'`,
      [ACTOR_ID],
    );

    repository = new AuditLogRepository();
    service = new AuditRetentionService(
      dataSource,
      new TypeOrmTransactionalAuditWriter(repository),
    );
  });

  beforeEach(async () => {
    await resetChain();
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    await resetChain();
    await dataSource.query('DELETE FROM users WHERE id = $1', [ACTOR_ID]);
    await dataSource.query('DELETE FROM tenants WHERE id = $1', [TENANT_ID]);
    await dataSource.destroy();
  });

  it('plans the prunable prefix without deleting anything (dry-run)', async () => {
    await seedAgedChain();

    const plan = await service.plan();
    expect(plan.defaultRetentionDays).toBe(2555);
    expect(plan.prunablePrefixRows).toBe(5);
    expect(plan.prunableUpToSequence).not.toBeNull();
    expect(plan.eligibleRows).toBe(5);
    expect(plan.actions.map((row) => row.action)).toContain('attendance.record.marked');

    const dryRun = await service.prune(
      pruneInput({ dryRun: true, requestId: 'req-retention-dryrun' }),
    );
    expect(dryRun.prunedRows).toBe(5);
    expect(dryRun.checkpoint).not.toBeNull();

    // Dry-run hiçbir şey silmez ve checkpoint yazmaz (yalnız audit kaydı eklenir).
    expect(await readChain()).toHaveLength(6);
    expect(
      (await dataSource.query('SELECT COUNT(*)::int AS c FROM audit_chain_checkpoints'))[0].c,
    ).toBe(0);
  });

  it('prunes the aged prefix, writes a signed checkpoint and keeps the chain verifiable', async () => {
    await seedAgedChain();
    const before = await readChain();
    const expectedHeadHash = before[before.length - 1].entry_hash as string;
    const expectedLastSequence = Number(before[before.length - 1].seq);

    const result = await service.prune(pruneInput());

    expect(result.prunedRows).toBe(5);
    expect(result.checkpoint?.upToSequence).toBe(expectedLastSequence);
    expect(result.checkpoint?.headHash).toBe(expectedHeadHash);

    const checkpoints = (await dataSource.query(
      `SELECT up_to_sequence, head_hash, signature, signature_key_id, reason, pruned_row_count
         FROM audit_chain_checkpoints ORDER BY up_to_sequence DESC`,
    )) as AuditRow[];
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0].reason).toBe('scheduled.retention.test');
    expect(Number(checkpoints[0].pruned_row_count)).toBe(5);
    expect(checkpoints[0].signature_key_id).toBe('local-test-key');

    // Kalan tek satır kırpma işleminin kendi audit kaydıdır ve checkpoint'ten bağlanır.
    const remaining = await readChain();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].prev_hash).toBe(expectedHeadHash);
    expect(remaining[0].action).toBe('audit.retention.pruned');
    expect(
      verifyAuditChain(remaining.map(toVerifiable), {
        hmacKey: TEST_AUDIT_HMAC_KEY,
        startPrevHash: expectedHeadHash,
      }),
    ).toMatchObject({ valid: true, reason: null });

    // Genesis'ten doğrulama artık geçerli DEĞİL: checkpoint zinciri çıpalar.
    expect(
      verifyAuditChain(remaining.map(toVerifiable), TEST_AUDIT_HMAC_KEY),
    ).toMatchObject({ valid: false, reason: 'prev-hash-mismatch' });
  });

  it('continues the chain from the checkpoint for new writes', async () => {
    await seedAgedChain(3);
    const before = await readChain();
    const headAtPrune = before[before.length - 1].entry_hash as string;

    await service.prune(pruneInput({ requestId: 'req-retention-run-2' }));

    // Yeni yazım: prev_hash checkpoint head'inden (kırpılan son özet) devam eder.
    await dataSource.transaction((manager) => repository.insert(manager, record(99)));

    const chain = await readChain();
    expect(chain).toHaveLength(2); // prune audit kaydı + yeni kayıt
    expect(chain[1].prev_hash).toBe(chain[0].entry_hash);
    expect(
      verifyAuditChain(chain.map(toVerifiable), {
        hmacKey: TEST_AUDIT_HMAC_KEY,
        startPrevHash: headAtPrune,
      }),
    ).toMatchObject({ valid: true, reason: null });
  });

  it('does not prune a fresh chain (retention not reached) and still audits the run', async () => {
    await seedAgedChain(2);
    await dataSource.query('UPDATE audit_logs SET created_at = now()');

    const plan = await service.plan();
    expect(plan.prunablePrefixRows).toBe(0);

    const result = await service.prune(pruneInput({ requestId: 'req-retention-fresh' }));
    expect(result.prunedRows).toBe(0);
    expect(result.checkpoint).toBeNull();
    // 2 kayıt + atlanan kırpma işleminin audit kaydı.
    expect(await readChain()).toHaveLength(3);
  });

  it('rejects an invalid retention reason (fail-closed)', async () => {
    await expect(
      service.prune(pruneInput({ dryRun: true, reason: 'BAD REASON!' })),
    ).rejects.toThrow(/reason must match/);
  });

  it('does not expose global retention HTTP operations or modify either tenant chain (#367)', async () => {
    const otherTenantId = '10000000-0000-4000-8000-000000000269';
    await dataSource.query(
      `INSERT INTO tenants (id, name, slug, status, timezone)
       VALUES ($1, 'Other Audit Tenant', 'other-audit-retention', 'active', 'Europe/Istanbul')`,
      [otherTenantId],
    );
    let app: INestApplication | undefined;
    const runtimeDataSource = new DataSource(dataSource.options);
    try {
      const credential = randomUUID();
      await dataSource.query('UPDATE users SET credential_hash = $2 WHERE id = $1', [ACTOR_ID, hashSync(credential, 10)]);
      await dataSource.query(
        `INSERT INTO tenant_memberships (tenant_id, user_id, status) VALUES ($1, $2, 'active')`,
        [TENANT_ID, ACTOR_ID],
      );
      const roles = await dataSource.query(
        `INSERT INTO roles (tenant_id, name, is_system_role) VALUES ($1, 'tenant_admin', true) RETURNING id`,
        [TENANT_ID],
      );
      await dataSource.query(
        `INSERT INTO user_roles (tenant_id, user_id, role_id) VALUES ($1, $2, $3)`,
        [TENANT_ID, ACTOR_ID, roles[0].id],
      );
      await dataSource.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         SELECT $1, id FROM permissions WHERE code = 'audit_log:retention:run'`,
        [roles[0].id],
      );
      await seedAgedChain(2);
      await dataSource.transaction((manager) => repository.insert(manager, {
        ...record(3), tenantId: otherTenantId,
      }));
      await runtimeDataSource.initialize();
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(getDataSourceToken()).useValue(runtimeDataSource).compile();
      app = moduleRef.createNestApplication({ logger: false });
      app.setGlobalPrefix('api/v1');
      await app.listen(0, '127.0.0.1');
      const port = (app.getHttpServer().address() as AddressInfo).port;
      const login = await fetch(`http://127.0.0.1:${port}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'audit-retention@example.test', password: credential, tenantId: TENANT_ID }),
      });
      expect(login.status).toBe(201);
      const { accessToken } = await login.json() as { accessToken: string };
      expect(typeof accessToken).toBe('string');
      const actor = await app.get(AuthService).validateAccessTokenSession({
        ...JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString()),
      });
      expect(actor.roleIds).toContain('tenant_admin');
      expect(actor.permissions).toContain('audit_log:retention:run');
      const before = await readChain(); // Login may append an audited auth event.
      for (const route of ['plan', 'run']) {
        const response = await fetch(`http://127.0.0.1:${port}/api/v1/audit/retention/${route}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ dryRun: false, reason: 'security.probe' }),
        });
        expect(response.status).toBe(404);
        const body = await response.json();
        expect(body).not.toHaveProperty('actions');
        expect(body).not.toHaveProperty('eligibleRows');
      }
      expect(await readChain()).toEqual(before);
      expect((await dataSource.query('SELECT COUNT(*)::int AS c FROM audit_chain_checkpoints'))[0].c).toBe(0);
    } finally {
      try {
        await app?.close();
      } finally {
        if (runtimeDataSource.isInitialized) await runtimeDataSource.destroy();
        await resetChain();
        await dataSource.query('DELETE FROM user_sessions WHERE user_id = $1', [ACTOR_ID]);
        await dataSource.query('DELETE FROM user_roles WHERE user_id = $1', [ACTOR_ID]);
        await dataSource.query('DELETE FROM tenant_memberships WHERE user_id = $1', [ACTOR_ID]);
        await dataSource.query('DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE tenant_id = $1)', [TENANT_ID]);
        await dataSource.query('DELETE FROM roles WHERE tenant_id = $1', [TENANT_ID]);
        await dataSource.query('DELETE FROM tenants WHERE id = $1', [otherTenantId]);
      }
    }
  });
});
