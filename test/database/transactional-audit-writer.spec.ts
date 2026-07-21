import { DataSource, EntityManager } from 'typeorm';

import { AuditLogRepository } from '../../src/common/audit/audit-log.repository';
import { AuditMetadataByEvent } from '../../src/common/audit/transactional-audit.types';
import { TypeOrmTransactionalAuditWriter } from '../../src/common/audit/transactional-audit-writer';

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const describeWithPostgres = DATABASE_URL ? describe : describe.skip;

const COMMIT_TENANT_ID = '10000000-0000-4000-8000-000000000201';
const AUDIT_FAILURE_TENANT_ID = '10000000-0000-4000-8000-000000000202';
const DOMAIN_ROLLBACK_TENANT_ID = '10000000-0000-4000-8000-000000000203';
const NONEXISTENT_ACTOR_ID = '30000000-0000-4000-8000-000000000299';
const COURSE_ID = '40000000-0000-4000-8000-000000000201';

const TEST_TENANT_IDS = [COMMIT_TENANT_ID, AUDIT_FAILURE_TENANT_ID, DOMAIN_ROLLBACK_TENANT_ID] as const;

async function insertTenant(manager: EntityManager, tenantId: string, slug: string): Promise<void> {
  await manager.query(
    `
      INSERT INTO tenants (id, name, slug, status, timezone, deleted_at)
      VALUES ($1, $2, $3, 'active', 'Europe/Istanbul', NULL)
    `,
    [tenantId, `Audit Foundation ${slug}`, slug],
  );
}

function courseMetadata(
  tenantId: string,
  requestId: string,
  actorUserId: string | null = null,
): AuditMetadataByEvent['course.created'] {
  return {
    schemaVersion: 1,
    tenantId,
    actorUserId,
    actorSessionId: null,
    requestId,
    entityType: 'course',
    entityId: COURSE_ID,
    result: 'success',
    changedFields: ['name', 'status'],
  };
}

describeWithPostgres('TransactionalAuditWriter PostgreSQL atomicity', () => {
  jest.setTimeout(20_000);

  let dataSource: DataSource;
  let writer: TypeOrmTransactionalAuditWriter;

  async function cleanup(): Promise<void> {
    await dataSource.query(`DELETE FROM audit_logs WHERE request_id LIKE 'audit-foundation-%'`);
    await dataSource.query('DELETE FROM tenants WHERE id IN ($1, $2, $3)', [...TEST_TENANT_IDS]);
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
    writer = new TypeOrmTransactionalAuditWriter(new AuditLogRepository());
  });

  beforeEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    await cleanup();
    await dataSource.destroy();
  });

  it('commits the domain mutation and success audit together', async () => {
    const requestId = 'audit-foundation-commit';

    await dataSource.transaction(async (manager) => {
      await insertTenant(manager, COMMIT_TENANT_ID, 'audit-foundation-commit');
      await writer.write(manager, 'course.created', courseMetadata(COMMIT_TENANT_ID, requestId));
    });

    const tenants = await dataSource.query('SELECT id FROM tenants WHERE id = $1', [COMMIT_TENANT_ID]);
    const auditRows = await dataSource.query(
      `
        SELECT tenant_id, action, entity_type, entity_id, request_id, metadata_json
        FROM audit_logs
        WHERE request_id = $1
      `,
      [requestId],
    );

    expect(tenants).toHaveLength(1);
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({
      tenant_id: COMMIT_TENANT_ID,
      action: 'course.created',
      entity_type: 'course',
      entity_id: COURSE_ID,
      request_id: requestId,
      metadata_json: {
        schemaVersion: 1,
        result: 'success',
        changedFields: ['name', 'status'],
      },
    });
  });

  it('rolls back the domain mutation when the audit insert fails', async () => {
    const requestId = 'audit-foundation-insert-failure';

    await expect(
      dataSource.transaction(async (manager) => {
        await insertTenant(manager, AUDIT_FAILURE_TENANT_ID, 'audit-foundation-insert-failure');
        await writer.write(
          manager,
          'course.created',
          courseMetadata(AUDIT_FAILURE_TENANT_ID, requestId, NONEXISTENT_ACTOR_ID),
        );
      }),
    ).rejects.toThrow();

    const tenants = await dataSource.query('SELECT id FROM tenants WHERE id = $1', [AUDIT_FAILURE_TENANT_ID]);
    const auditRows = await dataSource.query('SELECT id FROM audit_logs WHERE request_id = $1', [requestId]);

    expect(tenants).toHaveLength(0);
    expect(auditRows).toHaveLength(0);
  });

  it('does not leave a success audit when the domain transaction rolls back', async () => {
    const requestId = 'audit-foundation-domain-rollback';

    await expect(
      dataSource.transaction(async (manager) => {
        await insertTenant(manager, DOMAIN_ROLLBACK_TENANT_ID, 'audit-foundation-domain-rollback');
        await writer.write(manager, 'course.created', courseMetadata(DOMAIN_ROLLBACK_TENANT_ID, requestId));
        throw new Error('forced domain rollback');
      }),
    ).rejects.toThrow('forced domain rollback');

    const tenants = await dataSource.query('SELECT id FROM tenants WHERE id = $1', [DOMAIN_ROLLBACK_TENANT_ID]);
    const auditRows = await dataSource.query('SELECT id FROM audit_logs WHERE request_id = $1', [requestId]);

    expect(tenants).toHaveLength(0);
    expect(auditRows).toHaveLength(0);
  });
});
