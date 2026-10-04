import { DataSource } from 'typeorm';

import {
  CONTACT_KEY_ENV,
  CONTACT_KEY_ID_ENV,
  DEFAULT_CONTACT_KEY_ID,
  TEST_CONTACT_KEY,
} from '../../src/kvkk/contact-crypto';
import { CreateParentContactFoundation1830000000000 } from '../../src/database/migrations/1830000000000-CreateParentContactFoundation';
import { ContactPoint } from '../../src/parents/contact-point.entity';
import { ParentContact } from '../../src/parents/parent-contact.entity';
import { ParentContactRepository } from '../../src/parents/parent-contact.repository';
import { StudentParentContact } from '../../src/parents/student-parent-contact.entity';

/**
 * #266 N1a — GERÇEK PostgreSQL üzerinde encrypted parent contact
 * foundation kanıtı.
 *
 * Kanıtlayan özellikler:
 * - Migration idempotent up/down + constraint postconditions
 * - Ham contact değeri encrypted_value sütununda PLAINTEXT olarak
 *   saklanmaz (AES-256-GCM envelope); masked read hiç plaintext
 *   döndürmez
 * - Cross-tenant association composite FK ile engellenir
 * - Tenant + branch scope izolasyonu
 * - Lifecycle/effective-date filtreleme
 * - Optimistic concurrency (stale version'da tam olarak bir kazanır)
 */
const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const describeWithPostgres = DATABASE_URL ? describe : describe.skip;

const TENANT_ID = '11111111-0000-4000-8000-000000000001';
const OTHER_TENANT_ID = '22222222-0000-4000-8000-000000000002';
const BRANCH_ID = '33333333-0000-4000-8000-000000000003';
const OTHER_BRANCH_ID = '44444444-0000-4000-8000-000000000004';
const STUDENT_ID = '55555555-0000-4000-8000-000000000005';
const OTHER_STUDENT_ID = '66666666-0000-4000-8000-000000000006';
const GUARDIAN_REF_ID = '77777777-0000-4000-8000-000000000007';

const RAW_PHONE = '+905551234567';

describeWithPostgres('parent contact foundation PostgreSQL (#266 N1a)', () => {
  jest.setTimeout(30_000);

  let dataSource: DataSource;
  let repository: ParentContactRepository;
  const migration = new CreateParentContactFoundation1830000000000();
  let savedContactKeyEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    // Deterministic key ring: CI'de KVKK_CONTACT_KEY env'i yoksa
    // resolveContactKeyRing() local-test key (keyId 'local-test') döner
    // ve blind index assertion'ı ortama göre değişir. Testi deterministic
    // kılmak için izole test anahtarını DEFAULT key-id ile kur; sonrada
    // geri yükle.
    savedContactKeyEnv = {
      [CONTACT_KEY_ENV]: process.env[CONTACT_KEY_ENV],
      [CONTACT_KEY_ID_ENV]: process.env[CONTACT_KEY_ID_ENV],
    };
    process.env[CONTACT_KEY_ENV] = TEST_CONTACT_KEY;
    process.env[CONTACT_KEY_ID_ENV] = DEFAULT_CONTACT_KEY_ID;

    dataSource = new DataSource({
      type: 'postgres',
      url: DATABASE_URL as string,
      entities: [ParentContact, ContactPoint, StudentParentContact],
      synchronize: false,
      logging: false,
    });
    await dataSource.initialize();

    // Migration'ı idempotent çalıştır (tablolar yoksa oluşturur).
    const runner = dataSource.createQueryRunner();
    try {
      await migration.up(runner);
    } finally {
      await runner.release();
    }

    repository = new ParentContactRepository();

    // Referans fixture'ları (tenant/branch — reference tablolar).
    await dataSource.query(
      `INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name`,
      [TENANT_ID, 'N1a Tenant', 'n1a-tenant'],
    );
    await dataSource.query(
      `INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name`,
      [OTHER_TENANT_ID, 'N1a Other Tenant', 'n1a-other-tenant'],
    );
    await dataSource.query(
      `INSERT INTO branches (id, tenant_id, name, code) VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name`,
      [BRANCH_ID, TENANT_ID, 'N1a Branch', 'N1A-B'],
    );
    await dataSource.query(
      `INSERT INTO branches (id, tenant_id, name, code) VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name`,
      [OTHER_BRANCH_ID, TENANT_ID, 'N1a Other Branch', 'N1A-OB'],
    );
  });

  afterAll(async () => {
    for (const [key, value] of Object.entries(savedContactKeyEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    if (!dataSource?.isInitialized) return;
    // Verileri bağımlılık sırasıyla temizle (tablolar kalır).
    await dataSource.query(
      `DELETE FROM student_parent_contacts WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_ID, OTHER_TENANT_ID]],
    );
    await dataSource.query(
      `DELETE FROM contact_points WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_ID, OTHER_TENANT_ID]],
    );
    await dataSource.query(
      `DELETE FROM parent_contacts WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_ID, OTHER_TENANT_ID]],
    );
    await dataSource.query(`DELETE FROM branches WHERE id = ANY($1::uuid[])`, [
      [BRANCH_ID, OTHER_BRANCH_ID],
    ]);
    await dataSource.query(`DELETE FROM tenants WHERE id = ANY($1::uuid[])`, [
      [TENANT_ID, OTHER_TENANT_ID],
    ]);
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await dataSource.query(
      `DELETE FROM student_parent_contacts WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_ID, OTHER_TENANT_ID]],
    );
    await dataSource.query(
      `DELETE FROM contact_points WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_ID, OTHER_TENANT_ID]],
    );
    await dataSource.query(
      `DELETE FROM parent_contacts WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_ID, OTHER_TENANT_ID]],
    );
  });

  it('enforces CHECK constraints (invalid status/channel/verification rejected)', async () => {
    const parent = await repository.createParentContactWithPoint(
      dataSource.manager,
      {
        tenantId: TENANT_ID,
        guardianRefId: GUARDIAN_REF_ID,
        channel: 'sms',
        rawValue: RAW_PHONE,
      },
    );

    await expect(
      dataSource.query(
        `UPDATE contact_points SET channel = 'carrier_pigeon' WHERE id = $1`,
        [parent.contactPointId],
      ),
    ).rejects.toThrow();
    await expect(
      dataSource.query(
        `UPDATE contact_points SET verification_status = 'maybe' WHERE id = $1`,
        [parent.contactPointId],
      ),
    ).rejects.toThrow();
    await expect(
      dataSource.query(
        `UPDATE parent_contacts SET status = 'unknown' WHERE id = $1`,
        [parent.parentContactId],
      ),
    ).rejects.toThrow();
  });

  it('stores the contact value as an AES-256-GCM envelope, never plaintext', async () => {
    const created = await repository.createParentContactWithPoint(
      dataSource.manager,
      {
        tenantId: TENANT_ID,
        guardianRefId: GUARDIAN_REF_ID,
        channel: 'sms',
        rawValue: RAW_PHONE,
      },
    );

    const rows = (await dataSource.query(
      `SELECT encrypted_value, masked_display, blind_index, verification_status
         FROM contact_points WHERE id = $1`,
      [created.contactPointId],
    )) as Array<{
      encrypted_value: string;
      masked_display: string;
      blind_index: string | null;
      verification_status: string;
    }>;
    expect(rows).toHaveLength(1);
    const row = rows[0];

    // Envelope sözleşmesi: v/keyId/nonce/ciphertext/tag.
    const envelope = JSON.parse(row.encrypted_value);
    expect(envelope).toMatchObject({
      v: 1,
      keyId: expect.any(String),
      nonce: expect.any(String),
      ciphertext: expect.any(String),
      tag: expect.any(String),
    });

    // Ham değer hiçbir zaman diskte plaintext olarak durmaz.
    expect(row.encrypted_value).not.toContain(RAW_PHONE);
    expect(row.encrypted_value).not.toContain('5551234567');

    // Masked display ham değeri taşımaz.
    expect(row.masked_display).not.toContain(RAW_PHONE);
    expect(row.masked_display).toBe('+**********67');

    // Blind index purpose-bound keyed HMAC'tir (ham değer taşımaz).
    expect(row.blind_index).not.toContain(RAW_PHONE);
    expect(row.blind_index).toMatch(/^contact-p1:[0-9a-f]{32}$/);
    expect(row.verification_status).toBe('unverified');

    // Yetkili actor raw okuma doğru plaintext'i çözer.
    const raw = await repository.findRawContactPointForAuthorized(
      dataSource.manager,
      { tenantId: TENANT_ID, contactPointId: created.contactPointId },
    );
    expect(raw.rawValue).toBe(RAW_PHONE);
    expect(raw.channel).toBe('sms');
  });

  it('masked read returns minimized projection only (never plaintext/envelope)', async () => {
    const created = await repository.createParentContactWithPoint(
      dataSource.manager,
      {
        tenantId: TENANT_ID,
        guardianRefId: GUARDIAN_REF_ID,
        channel: 'email',
        rawValue: 'ahmet@example.com',
      },
    );
    await repository.linkParentContactToStudent(dataSource.manager, {
      tenantId: TENANT_ID,
      studentId: STUDENT_ID,
      parentContactId: created.parentContactId,
      branchId: BRANCH_ID,
    });

    const masked = await repository.findMaskedContactPointsForStudent(
      dataSource.manager,
      { tenantId: TENANT_ID, studentId: STUDENT_ID, branchId: BRANCH_ID },
    );
    expect(masked).toHaveLength(1);
    expect(masked[0].maskedDisplay).toBe('a***@example.com');
    expect(masked[0].channel).toBe('email');
    expect(masked[0].verificationStatus).toBe('unverified');

    // Masked projeksiyon ham değer veya envelope taşımaz.
    const serialized = JSON.stringify(masked);
    expect(serialized).not.toContain('ahmet@example.com');
    expect(serialized).not.toContain('ciphertext');
    expect(serialized).not.toContain('encrypted_value');
  });

  it('enforces same-tenant composite FK (cross-tenant contact point denied)', async () => {
    // TENANT_A'ya ait parent contact.
    const owned = await repository.createParentContactWithPoint(
      dataSource.manager,
      {
        tenantId: TENANT_ID,
        guardianRefId: null,
        channel: 'sms',
        rawValue: RAW_PHONE,
      },
    );

    // TENANT_B kiracısı, TENANT_A contact'ını referans gösteremez:
    // composite FK (tenant_id, parent_contact_id) -> parent_contacts(tenant_id, id)
    // (OTHER_TENANT_ID, owned.parentContactId) satırını bulamaz.
    await expect(
      dataSource.query(
        `INSERT INTO contact_points
           (id, tenant_id, parent_contact_id, channel, encrypted_value,
            masked_display, verification_status, status, version)
         VALUES ($1, $2, $3, 'sms', '{}', '***', 'unverified', 'active', 1)`,
        [
          '88888888-0000-4000-8000-000000000008',
          OTHER_TENANT_ID,
          owned.parentContactId,
        ],
      ),
    ).rejects.toThrow();
  });

  it('enforces same-tenant student link (cross-tenant association denied)', async () => {
    const owned = await repository.createParentContactWithPoint(
      dataSource.manager,
      {
        tenantId: TENANT_ID,
        guardianRefId: null,
        channel: 'sms',
        rawValue: RAW_PHONE,
      },
    );

    // Başka tenant'da öğrenci↔contact ilişkisi kurulamaz.
    await expect(
      dataSource.query(
        `INSERT INTO student_parent_contacts
           (id, tenant_id, student_id, parent_contact_id, branch_id,
            effective_from, status, version)
         VALUES ($1, $2, $3, $4, $5, now(), 'active', 1)`,
        [
          '99999999-0000-4000-8000-000000000009',
          OTHER_TENANT_ID,
          OTHER_STUDENT_ID,
          owned.parentContactId,
          OTHER_BRANCH_ID,
        ],
      ),
    ).rejects.toThrow();
  });

  it('scopes masked read by tenant and branch (isolation)', async () => {
    const created = await repository.createParentContactWithPoint(
      dataSource.manager,
      {
        tenantId: TENANT_ID,
        guardianRefId: null,
        channel: 'sms',
        rawValue: RAW_PHONE,
      },
    );
    await repository.linkParentContactToStudent(dataSource.manager, {
      tenantId: TENANT_ID,
      studentId: STUDENT_ID,
      parentContactId: created.parentContactId,
      branchId: BRANCH_ID,
    });

    // Doğru tenant + branch → 1 sonuç.
    expect(
      (
        await repository.findMaskedContactPointsForStudent(
          dataSource.manager,
          { tenantId: TENANT_ID, studentId: STUDENT_ID, branchId: BRANCH_ID },
        )
      ).length,
    ).toBe(1);

    // Farklı branch → 0 sonuç (branch scope izolasyonu).
    expect(
      (
        await repository.findMaskedContactPointsForStudent(
          dataSource.manager,
          {
            tenantId: TENANT_ID,
            studentId: STUDENT_ID,
            branchId: OTHER_BRANCH_ID,
          },
        )
      ).length,
    ).toBe(0);

    // Farklı tenant → 0 sonuç (tenant izolasyonu).
    expect(
      (
        await repository.findMaskedContactPointsForStudent(
          dataSource.manager,
          {
            tenantId: OTHER_TENANT_ID,
            studentId: STUDENT_ID,
            branchId: BRANCH_ID,
          },
        )
      ).length,
    ).toBe(0);

    // Farklı öğrenci → 0 sonuç.
    expect(
      (
        await repository.findMaskedContactPointsForStudent(
          dataSource.manager,
          {
            tenantId: TENANT_ID,
            studentId: OTHER_STUDENT_ID,
            branchId: BRANCH_ID,
          },
        )
      ).length,
    ).toBe(0);
  });

  it('excludes revoked/inactive links and out-of-effective-date links', async () => {
    const created = await repository.createParentContactWithPoint(
      dataSource.manager,
      {
        tenantId: TENANT_ID,
        guardianRefId: null,
        channel: 'sms',
        rawValue: RAW_PHONE,
      },
    );

    // Revoked link.
    await repository.linkParentContactToStudent(dataSource.manager, {
      tenantId: TENANT_ID,
      studentId: STUDENT_ID,
      parentContactId: created.parentContactId,
      branchId: BRANCH_ID,
    });
    const linkRows = (await dataSource.query(
      `SELECT id FROM student_parent_contacts
        WHERE tenant_id = $1 AND student_id = $2 AND branch_id = $3`,
      [TENANT_ID, STUDENT_ID, BRANCH_ID],
    )) as Array<{ id: string }>;
    expect(linkRows).toHaveLength(1);
    await repository.transitionStudentLink(dataSource.manager, {
      tenantId: TENANT_ID,
      recordId: linkRows[0].id,
      expectedVersion: 1,
      status: 'revoked',
    });
    expect(
      (
        await repository.findMaskedContactPointsForStudent(
          dataSource.manager,
          { tenantId: TENANT_ID, studentId: STUDENT_ID, branchId: BRANCH_ID },
        )
      ).length,
    ).toBe(0);

    // Out-of-effective-date link (effective_to geçmiş).
    await dataSource.query(
      `INSERT INTO student_parent_contacts
         (id, tenant_id, student_id, parent_contact_id, branch_id,
          effective_from, effective_to, status, version)
       VALUES ($1, $2, $3, $4, $5, now() - interval '2 days',
               now() - interval '1 day', 'active', 1)`,
      [
        'aaaaaaaa-0000-4000-8000-00000000000a',
        TENANT_ID,
        OTHER_STUDENT_ID,
        created.parentContactId,
        BRANCH_ID,
      ],
    );
    expect(
      (
        await repository.findMaskedContactPointsForStudent(
          dataSource.manager,
          {
            tenantId: TENANT_ID,
            studentId: OTHER_STUDENT_ID,
            branchId: BRANCH_ID,
          },
        )
      ).length,
    ).toBe(0);
  });

  it('serializes concurrent transitions: exactly one stale-version winner', async () => {
    const created = await repository.createParentContactWithPoint(
      dataSource.manager,
      {
        tenantId: TENANT_ID,
        guardianRefId: null,
        channel: 'sms',
        rawValue: RAW_PHONE,
      },
    );

    // İki paralel geçiş aynı expectedVersion=1 ile yarışır;
    // satır kilidi nedeniyle tam olarak BİRİ başarılı olmalı.
    const results = await Promise.allSettled([
      repository.transitionContactPoint(dataSource.manager, {
        tenantId: TENANT_ID,
        recordId: created.contactPointId,
        expectedVersion: 1,
        status: 'active',
        verificationStatus: 'verified',
      }),
      repository.transitionContactPoint(dataSource.manager, {
        tenantId: TENANT_ID,
        recordId: created.contactPointId,
        expectedVersion: 1,
        status: 'active',
        verificationStatus: 'verified',
      }),
    ]);

    const fulfilled = results.filter(
      (r): r is PromiseFulfilledResult<{ version: number }> =>
        r.status === 'fulfilled',
    );
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    // Kazanan geçiş doğru yeni version'ı dönmelidir
    // (TypeORM UPDATE tuple dönüşü normalize edilmiş).
    expect(fulfilled[0].value).toEqual({ version: 2 });

    // Kalıcı durum: version 2, verification verified.
    const rows = (await dataSource.query(
      `SELECT version, verification_status FROM contact_points WHERE id = $1`,
      [created.contactPointId],
    )) as Array<{ version: number; verification_status: string }>;
    expect(rows[0].version).toBe(2);
    expect(rows[0].verification_status).toBe('verified');
  });

  it('rejects a stale expectedVersion transition (optimistic concurrency)', async () => {
    const created = await repository.createParentContactWithPoint(
      dataSource.manager,
      {
        tenantId: TENANT_ID,
        guardianRefId: null,
        channel: 'sms',
        rawValue: RAW_PHONE,
      },
    );

    // İlk geçiş version 1 → 2.
    await repository.transitionContactPoint(dataSource.manager, {
      tenantId: TENANT_ID,
      recordId: created.contactPointId,
      expectedVersion: 1,
      status: 'active',
      verificationStatus: 'verified',
    });

    // Aynı expectedVersion=1 ile ikinci geçiş artık çakışır.
    await expect(
      repository.transitionContactPoint(dataSource.manager, {
        tenantId: TENANT_ID,
        recordId: created.contactPointId,
        expectedVersion: 1,
        status: 'inactive',
      }),
    ).rejects.toThrow(/version conflict/);
  });

  it('prevents duplicate student links via the unique link constraint', async () => {
    const created = await repository.createParentContactWithPoint(
      dataSource.manager,
      {
        tenantId: TENANT_ID,
        guardianRefId: null,
        channel: 'sms',
        rawValue: RAW_PHONE,
      },
    );
    await repository.linkParentContactToStudent(dataSource.manager, {
      tenantId: TENANT_ID,
      studentId: STUDENT_ID,
      parentContactId: created.parentContactId,
      branchId: BRANCH_ID,
    });

    // Aynı (tenant, student, contact, branch) link'i tekrar kurmak
    // unique constraint'i çakdırır (ON CONFLICT DO NOTHING ile sessiz
    // atlanır; farklı link id'si üretilmez).
    const before = (await dataSource.query(
      `SELECT count(*)::int AS n FROM student_parent_contacts
        WHERE tenant_id = $1 AND student_id = $2 AND branch_id = $3`,
      [TENANT_ID, STUDENT_ID, BRANCH_ID],
    )) as Array<{ n: number }>;
    expect(before[0].n).toBe(1);

    await repository.linkParentContactToStudent(dataSource.manager, {
      tenantId: TENANT_ID,
      studentId: STUDENT_ID,
      parentContactId: created.parentContactId,
      branchId: BRANCH_ID,
    });

    const after = (await dataSource.query(
      `SELECT count(*)::int AS n FROM student_parent_contacts
        WHERE tenant_id = $1 AND student_id = $2 AND branch_id = $3`,
      [TENANT_ID, STUDENT_ID, BRANCH_ID],
    )) as Array<{ n: number }>;
    expect(after[0].n).toBe(1);
  });
});
