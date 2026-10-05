import { DataSource } from 'typeorm';

import { ConsentAuthority } from '../../src/kvkk/consent-authority';
import { CreateKvkkConsents1700000000010 } from '../../src/database/migrations/1700000000010-CreateKvkkConsents';
import { AddKvkkConsentVersion1850000000000 } from '../../src/database/migrations/1850000000000-AddKvkkConsentVersion';

/**
 * #266 N1b — GERÇEK PostgreSQL üzerinde authoritative versioned
 * consent authority kanıtı.
 *
 * Kanıtlayan özellikler:
 * - Migration idempotent up + `version` sütunu postcondition
 * - Özne başına `(consent_type)` bazında **en yüksek version**'lı
 *   satır güncel karardır (resurrection düzeltmesi: geçmişteki
 *   approved satırı üzerindeki yeni revoked/red/expired satırı
 *   karşılığında onay vermeyecek)
 * - Kanal onayı zorunluluğu, bilinmeyen kanal yalnız
 *   parent_notification gerektirir
 * - Inactive subject fail-closed; tenant izolasyonu
 */
const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const describeWithPostgres = DATABASE_URL ? describe : describe.skip;

const TENANT_ID = '11111111-0000-4000-8000-000000000001';
const OTHER_TENANT_ID = '22222222-0000-4000-8000-000000000002';
const STUDENT_ID = '55555555-0000-4000-8000-000000000005';
const OTHER_STUDENT_ID = '66666666-0000-4000-8000-000000000006';

const SUBJECT_ID = 'aaaaaaaa-0000-4000-8000-00000000000a';
const OTHER_SUBJECT_ID = 'bbbbbbbb-0000-4000-8000-00000000000b';

const PARENT_V1_ID = 'cccc0000-0000-4000-8000-00000000000c';
const PARENT_V2_ID = 'dddd0000-0000-4000-8000-00000000000d';
const SMS_V1_ID = 'eeee0000-0000-4000-8000-00000000000e';

describeWithPostgres('kvkk consent authority PostgreSQL (#266 N1b)', () => {
  jest.setTimeout(30_000);

  let dataSource: DataSource;
  const authority = new ConsentAuthority();
  const kvkkMigration = new CreateKvkkConsents1700000000010();
  const versionMigration = new AddKvkkConsentVersion1850000000000();

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      url: DATABASE_URL as string,
      entities: [],
      synchronize: false,
      logging: false,
    });
    await dataSource.initialize();

    // Migration'ları idempotent çalıştır (tablolar/sütun yoksa oluşturur).
    const runner = dataSource.createQueryRunner();
    try {
      await kvkkMigration.up(runner);
      await versionMigration.up(runner);
    } finally {
      await runner.release();
    }

    await dataSource.query(
      `INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name`,
      [TENANT_ID, 'N1b Tenant', 'n1b-tenant'],
    );
    await dataSource.query(
      `INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name`,
      [OTHER_TENANT_ID, 'N1b Other Tenant', 'n1b-other-tenant'],
    );
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    // Verileri bağımlılık sırasıyla temizle (tablolar kalır;
    // son test'in kalan satırları tenants FK'i engellemez).
    await dataSource.query(
      `DELETE FROM kvkk_consent_events WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_ID, OTHER_TENANT_ID]],
    );
    await dataSource.query(
      `DELETE FROM kvkk_consents WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_ID, OTHER_TENANT_ID]],
    );
    await dataSource.query(
      `DELETE FROM kvkk_consent_subjects WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_ID, OTHER_TENANT_ID]],
    );
    await dataSource.query(`DELETE FROM tenants WHERE id = ANY($1::uuid[])`, [
      [TENANT_ID, OTHER_TENANT_ID],
    ]);
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await dataSource.query(
      `DELETE FROM kvkk_consent_events WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_ID, OTHER_TENANT_ID]],
    );
    await dataSource.query(
      `DELETE FROM kvkk_consents WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_ID, OTHER_TENANT_ID]],
    );
    await dataSource.query(
      `DELETE FROM kvkk_consent_subjects WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_ID, OTHER_TENANT_ID]],
    );
  });

  async function insertSubject(
    tenantId: string,
    subjectId: string,
    studentId: string,
    status = 'active',
  ): Promise<void> {
    await dataSource.query(
      `INSERT INTO kvkk_consent_subjects
         (id, tenant_id, subject_type, subject_ref_id, status)
       VALUES ($1, $2, 'student', $3, $4)`,
      [subjectId, tenantId, studentId, status],
    );
  }

  async function insertConsent(
    tenantId: string,
    consentId: string,
    subjectId: string,
    consentType: string,
    overrides: Record<string, unknown> = {},
  ): Promise<void> {
    await dataSource.query(
      `INSERT INTO kvkk_consents
         (id, tenant_id, subject_id, consent_type, status, version,
          granted_at, revoked_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        consentId,
        tenantId,
        subjectId,
        consentType,
        (overrides.status as string) ?? 'approved',
        (overrides.version as number) ?? 1,
        (overrides.granted_at as Date) ?? new Date('2026-01-01T00:00:00.000Z'),
        (overrides.revoked_at as Date | null) ?? null,
        (overrides.expires_at as Date | null) ?? null,
      ],
    );
  }

  it('adds the version column to kvkk_consents (migration postcondition)', async () => {
    const columns = (await dataSource.query(
      `SELECT column_name, data_type, column_default
         FROM information_schema.columns
        WHERE table_name = 'kvkk_consents' AND column_name = 'version'`,
    )) as Array<{ column_name: string; data_type: string }>;
    expect(columns).toHaveLength(1);
    expect(columns[0].data_type).toBe('integer');
  });

  it('resolves the max-version row as the current decision', async () => {
    await insertSubject(TENANT_ID, SUBJECT_ID, STUDENT_ID);
    await insertConsent(TENANT_ID, PARENT_V1_ID, SUBJECT_ID, 'parent_notification', { version: 1 });
    await insertConsent(TENANT_ID, PARENT_V2_ID, SUBJECT_ID, 'parent_notification', { version: 2 });
    await insertConsent(TENANT_ID, SMS_V1_ID, SUBJECT_ID, 'sms_notification', { version: 1 });

    const decision = await authority.resolveNotificationConsent(
      dataSource.manager,
      {
        subject: {
          tenantId: TENANT_ID,
          subjectType: 'student',
          subjectRefId: STUDENT_ID,
        },
        channel: 'sms',
      },
    );

    expect(decision).toEqual({
      approved: true,
      reason: null,
      consentId: PARENT_V2_ID,
      consentVersion: 2,
    });
  });

  it('does not resurrect consent: approved v1 + revoked v2 blocks (N1b)', async () => {
    await insertSubject(TENANT_ID, SUBJECT_ID, STUDENT_ID);
    await insertConsent(TENANT_ID, PARENT_V1_ID, SUBJECT_ID, 'parent_notification', { version: 1 });
    await insertConsent(TENANT_ID, PARENT_V2_ID, SUBJECT_ID, 'parent_notification', {
      version: 2,
      status: 'revoked',
      revoked_at: new Date('2026-02-01T00:00:00.000Z'),
    });
    await insertConsent(TENANT_ID, SMS_V1_ID, SUBJECT_ID, 'sms_notification', { version: 1 });

    const decision = await authority.resolveNotificationConsent(
      dataSource.manager,
      {
        subject: {
          tenantId: TENANT_ID,
          subjectType: 'student',
          subjectRefId: STUDENT_ID,
        },
        channel: 'sms',
      },
    );

    expect(decision).toEqual({
      approved: false,
      reason: 'blocked_consent',
      consentId: PARENT_V2_ID,
      consentVersion: 2,
    });
  });

  it('blocks when the current consent is expired', async () => {
    await insertSubject(TENANT_ID, SUBJECT_ID, STUDENT_ID);
    await insertConsent(TENANT_ID, PARENT_V2_ID, SUBJECT_ID, 'parent_notification', {
      version: 2,
      expires_at: new Date('2020-01-01T00:00:00.000Z'),
    });
    await insertConsent(TENANT_ID, SMS_V1_ID, SUBJECT_ID, 'sms_notification', { version: 1 });

    const decision = await authority.resolveNotificationConsent(
      dataSource.manager,
      {
        subject: {
          tenantId: TENANT_ID,
          subjectType: 'student',
          subjectRefId: STUDENT_ID,
        },
        channel: 'sms',
      },
    );

    expect(decision).toMatchObject({ approved: false, reason: 'blocked_consent' });
  });

  it('blocks when the channel-specific consent is missing', async () => {
    await insertSubject(TENANT_ID, SUBJECT_ID, STUDENT_ID);
    await insertConsent(TENANT_ID, PARENT_V1_ID, SUBJECT_ID, 'parent_notification', { version: 1 });

    const decision = await authority.resolveNotificationConsent(
      dataSource.manager,
      {
        subject: {
          tenantId: TENANT_ID,
          subjectType: 'student',
          subjectRefId: STUDENT_ID,
        },
        channel: 'whatsapp',
      },
    );

    expect(decision).toMatchObject({ approved: false, reason: 'blocked_channel_consent' });
  });

  it('requires only parent_notification for an unmapped channel', async () => {
    await insertSubject(TENANT_ID, SUBJECT_ID, STUDENT_ID);
    await insertConsent(TENANT_ID, PARENT_V1_ID, SUBJECT_ID, 'parent_notification', { version: 1 });

    const decision = await authority.resolveNotificationConsent(
      dataSource.manager,
      {
        subject: {
          tenantId: TENANT_ID,
          subjectType: 'student',
          subjectRefId: STUDENT_ID,
        },
        channel: 'paper',
      },
    );

    expect(decision).toMatchObject({ approved: true, reason: null });
  });

  it('fails closed for an inactive consent subject', async () => {
    await insertSubject(TENANT_ID, SUBJECT_ID, STUDENT_ID, 'inactive');
    await insertConsent(TENANT_ID, PARENT_V1_ID, SUBJECT_ID, 'parent_notification', { version: 1 });
    await insertConsent(TENANT_ID, SMS_V1_ID, SUBJECT_ID, 'sms_notification', { version: 1 });

    const decision = await authority.resolveNotificationConsent(
      dataSource.manager,
      {
        subject: {
          tenantId: TENANT_ID,
          subjectType: 'student',
          subjectRefId: STUDENT_ID,
        },
        channel: 'sms',
      },
    );

    expect(decision).toMatchObject({ approved: false, reason: 'blocked_consent' });
  });

  it('is tenant-scoped: another tenant consent rows are invisible', async () => {
    await insertSubject(OTHER_TENANT_ID, OTHER_SUBJECT_ID, OTHER_STUDENT_ID);
    await insertConsent(OTHER_TENANT_ID, PARENT_V1_ID, OTHER_SUBJECT_ID, 'parent_notification', { version: 1 });
    await insertConsent(OTHER_TENANT_ID, SMS_V1_ID, OTHER_SUBJECT_ID, 'sms_notification', { version: 1 });

    const decision = await authority.resolveNotificationConsent(
      dataSource.manager,
      {
        subject: {
          tenantId: TENANT_ID,
          subjectType: 'student',
          subjectRefId: STUDENT_ID,
        },
        channel: 'sms',
      },
    );

    expect(decision).toMatchObject({ approved: false, reason: 'blocked_consent' });
  });

  it('breaks same-version ties deterministically by created_at', async () => {
    await insertSubject(TENANT_ID, SUBJECT_ID, STUDENT_ID);
    await insertConsent(TENANT_ID, PARENT_V1_ID, SUBJECT_ID, 'parent_notification', {
      version: 1,
      granted_at: new Date('2026-01-01T00:00:00.000Z'),
    });
    await dataSource.query(
      `UPDATE kvkk_consents SET created_at = '2026-01-01T00:00:00Z' WHERE id = $1`,
      [PARENT_V1_ID],
    );
    await insertConsent(TENANT_ID, PARENT_V2_ID, SUBJECT_ID, 'parent_notification', {
      version: 1,
      granted_at: new Date('2026-01-02T00:00:00.000Z'),
    });
    await dataSource.query(
      `UPDATE kvkk_consents SET created_at = '2026-01-02T00:00:00Z' WHERE id = $1`,
      [PARENT_V2_ID],
    );

    const decision = await authority.resolveNotificationConsent(
      dataSource.manager,
      {
        subject: {
          tenantId: TENANT_ID,
          subjectType: 'student',
          subjectRefId: STUDENT_ID,
        },
        channel: 'paper',
      },
    );

    expect(decision).toMatchObject({ approved: true, consentId: PARENT_V2_ID });
  });
});
