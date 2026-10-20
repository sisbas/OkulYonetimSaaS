import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { AuditLogRepository } from '../../src/common/audit/audit-log.repository';
import { TypeOrmTransactionalAuditWriter } from '../../src/common/audit/transactional-audit-writer';
import { RequestContext } from '../../src/common/context/request-context';
import { AddKvkkConsentVersion1850000000000 } from '../../src/database/migrations/1850000000000-AddKvkkConsentVersion';
import { CreateKvkkConsents1700000000010 } from '../../src/database/migrations/1700000000010-CreateKvkkConsents';
import { ConsentManagerService } from '../../src/kvkk/consent-manager.service';

/**
 * #266 — GERÇEK PostgreSQL üzerinde consent revoke + transactional audit kanıtı.
 *
 * Kanıtlanan özellikler:
 * - `UPDATE ... RETURNING` sonucu TypeORM postgres sürücüsünde `[rows, rowCount]`
 *   tuple'ı olarak döner: revoke yanıtındaki `consentId` gerçek consent UUID'sidir
 *   (S5 E2E'de `entityId: "undefined"` → `assertUuid` TypeError → HTTP 500 ile
 *   kırılan regresyon) ve "onaylı satır yok" dalı `[[], 0]` ile gerçekten
 *   `ConflictException` üretir.
 * - `dataprotection.consent.revoked` audit kaydı domain mutasyonuyla AYNI
 *   transaction'da `audit_logs` zincirine yazılır (commit birlikte, rollback
 *   birlikte).
 * - Audit satırı actor/request/entity/metadata sözleşmesine uyar
 *   (`DATA_PROTECTION_POLICY`: actorRequired, redactionReceipt zorunlu).
 */
const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const describeWithPostgres = DATABASE_URL ? describe : describe.skip;

const TENANT_ID = '71111111-0000-4000-8000-000000000001';
const ACTOR_USER_ID = '71111111-0000-4000-8000-000000000002';
const STUDENT_ID = '71111111-0000-4000-8000-000000000003';
const SUBJECT_ID = '71111111-0000-4000-8000-000000000004';
const CONSENT_ID = '71111111-0000-4000-8000-000000000005';

const REQUEST_OK = 'consent-revoke-db-commit';
const REQUEST_CONFLICT = 'consent-revoke-db-conflict';
const REQUEST_ROLLBACK = 'consent-revoke-db-rollback';

const REQUEST_PREFIX = 'consent-revoke-db-%';

describeWithPostgres('consent revoke + transactional audit PostgreSQL (#266)', () => {
  jest.setTimeout(30_000);

  let dataSource: DataSource;
  let service: ConsentManagerService;

  const kvkkMigration = new CreateKvkkConsents1700000000010();
  const versionMigration = new AddKvkkConsentVersion1850000000000();

  /** Domain satırlarını sıfırlar; tenant/actor sabit fixture olarak kalır. */
  async function resetRows(): Promise<void> {
    // audit_logs önce: actor_user_id FK users'e bağlı.
    await dataSource.query(`DELETE FROM audit_logs WHERE request_id LIKE $1`, [REQUEST_PREFIX]);
    await dataSource.query(`DELETE FROM kvkk_consent_events WHERE tenant_id = $1`, [TENANT_ID]);
    await dataSource.query(`DELETE FROM kvkk_consents WHERE tenant_id = $1`, [TENANT_ID]);
    await dataSource.query(`DELETE FROM kvkk_consent_subjects WHERE tenant_id = $1`, [TENANT_ID]);
  }

  async function seedSubject(): Promise<void> {
    await dataSource.query(
      `INSERT INTO kvkk_consent_subjects (id, tenant_id, subject_type, subject_ref_id, status)
       VALUES ($1, $2, 'student', $3, 'active')
       ON CONFLICT (id) DO NOTHING`,
      [SUBJECT_ID, TENANT_ID, STUDENT_ID],
    );
  }

  async function cleanup(): Promise<void> {
    await resetRows();
    await dataSource.query(`DELETE FROM users WHERE id = $1`, [ACTOR_USER_ID]);
    await dataSource.query(`DELETE FROM tenants WHERE id = $1`, [TENANT_ID]);
  }

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      url: DATABASE_URL as string,
      entities: [],
      synchronize: false,
      logging: false,
    });
    await dataSource.initialize();

    const runner = dataSource.createQueryRunner();
    try {
      await kvkkMigration.up(runner);
      await versionMigration.up(runner);
    } finally {
      await runner.release();
    }

    service = new ConsentManagerService(new TypeOrmTransactionalAuditWriter(new AuditLogRepository()));

    await cleanup();
    await dataSource.query(
      `INSERT INTO tenants (id, name, slug, status, timezone)
       VALUES ($1, $2, $3, 'active', 'Europe/Istanbul')
       ON CONFLICT (id) DO NOTHING`,
      [TENANT_ID, 'Consent Revoke Tenant', 'consent-revoke-db-tenant'],
    );
    await dataSource.query(
      `INSERT INTO users (id, email, credential_hash, full_name, status, token_version)
       VALUES ($1, 'consent-revoke-actor@example.test', 'x', 'Consent Revoke Actor', 'active', 1)
       ON CONFLICT (id) DO NOTHING`,
      [ACTOR_USER_ID],
    );
    await seedSubject();
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    await cleanup();
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await resetRows();
    await seedSubject();
  });

  function context(requestId: string): RequestContext {
    return {
      requestId,
      tenantId: TENANT_ID,
      userId: ACTOR_USER_ID,
      user: { userId: ACTOR_USER_ID, tenantId: TENANT_ID, roleIds: [], permissions: [] },
    };
  }

  const input = {
    subjectRefId: STUDENT_ID,
    subjectType: 'student' as const,
    consentType: 'parent_notification',
  };

  async function seedApprovedConsent(status = 'approved'): Promise<void> {
    await dataSource.query(
      `INSERT INTO kvkk_consents
         (id, tenant_id, subject_id, consent_type, status, version, granted_at, revoked_at)
       VALUES ($1, $2, $3, 'parent_notification', $4, 1, $5, NULL)`,
      [
        CONSENT_ID,
        TENANT_ID,
        SUBJECT_ID,
        status,
        status === 'approved' ? new Date('2026-01-01T00:00:00.000Z') : null,
      ],
    );
  }

  async function auditRows(requestId: string): Promise<Record<string, unknown>[]> {
    return dataSource.query(
      `SELECT tenant_id, actor_user_id, action, entity_type, entity_id, request_id, metadata_json
         FROM audit_logs
        WHERE request_id = $1`,
      [requestId],
    );
  }

  it('commits the revoke mutation and its dataprotection audit together', async () => {
    await seedApprovedConsent();

    const result = await dataSource.transaction((manager) =>
      service.revokeConsent(manager, context(REQUEST_OK), input),
    );

    expect(result.consentId).toBe(CONSENT_ID);
    expect(result.status).toBe('revoked');
    expect(result.version).toBe(2);

    const consent = (await dataSource.query(
      `SELECT status, version, revoked_at FROM kvkk_consents WHERE id = $1`,
      [CONSENT_ID],
    )) as Array<{ status: string; version: number; revoked_at: Date | null }>;
    expect(consent).toHaveLength(1);
    expect(consent[0]).toMatchObject({ status: 'revoked', version: 2 });
    expect(consent[0].revoked_at).not.toBeNull();

    const audits = await auditRows(REQUEST_OK);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      tenant_id: TENANT_ID,
      actor_user_id: ACTOR_USER_ID,
      action: 'dataprotection.consent.revoked',
      entity_type: 'dataprotection',
      entity_id: CONSENT_ID,
      request_id: REQUEST_OK,
    });
    expect(audits[0].metadata_json).toMatchObject({
      schemaVersion: 1,
      result: 'success',
      // PR #414 K-19: revoke'un gerçekte değiştirdiği kolonlar, gerçek kolon
      // adlarıyla ve policy'nin sıraladığı biçimde.
      changedFields: ['revoked_at', 'status', 'updated_at', 'version'],
      redactionReceipt: expect.objectContaining({ strategy: 'none' }),
    });
  });

  it('throws ConflictException and writes no audit when no approved row is updated', async () => {
    await seedApprovedConsent('revoked');

    await expect(
      dataSource.transaction((manager) =>
        service.revokeConsent(manager, context(REQUEST_CONFLICT), input),
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    const consent = (await dataSource.query(
      `SELECT status, version FROM kvkk_consents WHERE id = $1`,
      [CONSENT_ID],
    )) as Array<{ status: string; version: number }>;
    expect(consent[0]).toMatchObject({ status: 'revoked', version: 1 });
    expect(await auditRows(REQUEST_CONFLICT)).toHaveLength(0);
  });

  it('rolls back the revoke when the enclosing transaction fails', async () => {
    await seedApprovedConsent();

    await expect(
      dataSource.transaction(async (manager) => {
        await service.revokeConsent(manager, context(REQUEST_ROLLBACK), input);
        throw new Error('forced domain rollback');
      }),
    ).rejects.toThrow('forced domain rollback');

    const consent = (await dataSource.query(
      `SELECT status, version, revoked_at FROM kvkk_consents WHERE id = $1`,
      [CONSENT_ID],
    )) as Array<{ status: string; version: number; revoked_at: Date | null }>;
    expect(consent[0]).toMatchObject({ status: 'approved', version: 1, revoked_at: null });
    expect(await auditRows(REQUEST_ROLLBACK)).toHaveLength(0);
  });
});
