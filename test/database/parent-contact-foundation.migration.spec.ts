import { CreateParentContactFoundation1830000000000 } from '../../src/database/migrations/1830000000000-CreateParentContactFoundation';

/**
 * Migration smoke: parent contact / contact point / student-link
 * foundation tabloları (#266 N1a).
 * `src/database/migrations/` DIŞINDA tutulur (TypeORM runner
 * migration sanmasın).
 */
describe('CreateParentContactFoundation1830000000000 (#266 N1a)', () => {
  const migration = new CreateParentContactFoundation1830000000000();
  const makeRunner = () => {
    const calls: string[] = [];
    return {
      calls,
      query: jest.fn(async (sql: string) => {
        calls.push(sql);
        return undefined;
      }),
      hasTable: jest.fn(async () => false),
    } as unknown as import('typeorm').QueryRunner & { calls: string[] };
  };

  it('up() creates parent_contacts with lifecycle + optimistic version', async () => {
    const runner = makeRunner();
    await migration.up(runner as never);
    const all = (runner as unknown as { calls: string[] }).calls
      .join('\n')
      .replace(/\s+/g, ' ');

    expect(all).toContain('CREATE TABLE IF NOT EXISTS "parent_contacts"');
    expect(all).toContain('"guardian_ref_id" uuid NULL');
    expect(all).toContain('"version" integer NOT NULL DEFAULT 1');
    expect(all).toContain(
      "CHECK (\"status\" IN ('active', 'inactive', 'revoked'))",
    );
    expect(all).toContain(
      'CONSTRAINT "uq_parent_contacts_tenant_id" UNIQUE ("tenant_id", "id")',
    );
    expect(all).toContain(
      'REFERENCES "tenants"("id") ON DELETE RESTRICT',
    );
  });

  it('up() creates contact_points with encrypted value + masked display + verification', async () => {
    const runner = makeRunner();
    await migration.up(runner as never);
    const all = (runner as unknown as { calls: string[] }).calls
      .join('\n')
      .replace(/\s+/g, ' ');

    expect(all).toContain('CREATE TABLE IF NOT EXISTS "contact_points"');
    // Ham değer sütunu YOK — yalnız encrypted envelope + masked display.
    expect(all).toContain('"encrypted_value" text NOT NULL');
    expect(all).toContain('"masked_display" varchar(64) NOT NULL');
    expect(all).toContain('"blind_index" varchar(64) NULL');
    expect(all).toContain(
      "CHECK (\"channel\" IN ('sms', 'whatsapp', 'email'))",
    );
    expect(all).toContain(
      "CHECK (\"verification_status\" IN ('unverified', 'verified', 'expired', 'revoked'))",
    );
    // Same-tenant composite FK.
    expect(all).toContain(
      'FOREIGN KEY ("tenant_id", "parent_contact_id") REFERENCES "parent_contacts"("tenant_id", "id")',
    );
  });

  it('up() creates student_parent_contacts with effective-date + same-tenant FK', async () => {
    const runner = makeRunner();
    await migration.up(runner as never);
    const all = (runner as unknown as { calls: string[] }).calls
      .join('\n')
      .replace(/\s+/g, ' ');

    expect(all).toContain(
      'CREATE TABLE IF NOT EXISTS "student_parent_contacts"',
    );
    expect(all).toContain('"effective_from" timestamptz NOT NULL');
    expect(all).toContain('"effective_to" timestamptz NULL');
    expect(all).toContain(
      'CONSTRAINT "uq_student_parent_contacts_link" UNIQUE ("tenant_id", "student_id", "parent_contact_id", "branch_id")',
    );
    expect(all).toContain(
      'REFERENCES "branches"("id") ON DELETE RESTRICT',
    );
  });

  it('down() drops indexes and tables in dependency order (idempotent)', async () => {
    const runner = makeRunner();
    await migration.down(runner as never);
    const all = (runner as unknown as { calls: string[] }).calls
      .join('\n')
      .replace(/\s+/g, ' ');

    expect(all).toContain('DROP INDEX IF EXISTS "idx_student_parent_contacts_effective"');
    expect(all).toContain('DROP INDEX IF EXISTS "idx_contact_points_blind"');
    expect(all).toContain('DROP INDEX IF EXISTS "idx_parent_contacts_tenant_id"');
    // Bağımlılık sırası: link → contact point → parent contact.
    expect(all.indexOf('DROP TABLE IF EXISTS "student_parent_contacts"')).toBeLessThan(
      all.indexOf('DROP TABLE IF EXISTS "contact_points"'),
    );
    expect(all.indexOf('DROP TABLE IF EXISTS "contact_points"')).toBeLessThan(
      all.indexOf('DROP TABLE IF EXISTS "parent_contacts"'),
    );
  });
});
