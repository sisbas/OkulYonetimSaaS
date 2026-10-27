import * as fs from 'node:fs';
import * as path from 'node:path';
import { CONSENT_TYPE_METADATA } from '../../src/kvkk/consent-authority';
import { AddConsentLegalBasisAndDeliveredStatus1880000000000 } from '../../src/database/migrations/1880000000000-AddConsentLegalBasisAndDeliveredStatus';

const migrationPath = path.join(
  process.cwd(),
  'src',
  'database',
  'migrations',
  '1880000000000-AddConsentLegalBasisAndDeliveredStatus.ts',
);

/**
 * Migration smoke: consent hukuki zemini geri yazımı (PR #414 K-17).
 *
 * K-17: `legal_basis`/`retention_days` **tek kaynaktan** (`CONSENT_TYPE_METADATA`)
 * yazılır. Bu PR'da grant endpoint'i/UI'ı yoktur (K-22), dolayısıyla üretim
 * yazıcısı değil **migration backfill'i** bu tek kaynağı uygular; böylece
 * mevcut satırların kolonları NULL kalmaz ve K-25'in UI yüzeyi boş kalmaz.
 *
 * Migration değerleri gömülüdür (uygulama kodunu import etmez — uygulanmış
 * migration'ın anlamı kaynak kodla birlikte değişmemelidir). Bu spec iki
 * yönlü bağ kurar: gömülü satırlar map'in **tam** kopyasıdır ve SQL'in
 * gerçekten map'ten gelen değerleri taşıdığı.
 */
describe('AddConsentLegalBasisAndDeliveredStatus1880000000000 — consent legal basis backfill (K-17)', () => {
  const migration = new AddConsentLegalBasisAndDeliveredStatus1880000000000();
  const makeRunner = () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    return {
      calls,
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        return undefined;
      }),
    } as unknown as import('typeorm').QueryRunner & {
      calls: Array<{ sql: string; params?: unknown[] }>;
    };
  };

  function backfillStatement(
    calls: Array<{ sql: string; params?: unknown[] }>,
  ): { sql: string; params?: unknown[] } | undefined {
    return calls.find((call) => /UPDATE\s+"?kvkk_consents"?/i.test(call.sql));
  }

  /** Backfill parametreleri düz üçlü gruplar hâlinde gelir. */
  function backfillTriples(
    calls: Array<{ sql: string; params?: unknown[] }>,
  ): Array<[string, string, number]> {
    const params = backfillStatement(calls)?.params ?? [];
    const triples: Array<[string, string, number]> = [];
    for (let i = 0; i + 2 < params.length; i += 3) {
      triples.push([
        String(params[i]),
        String(params[i + 1]),
        Number(params[i + 2]),
      ]);
    }
    return triples;
  }

  it('backfills legal_basis + retention_days from CONSENT_TYPE_METADATA for every mapped consent type', async () => {
    const runner = makeRunner();
    await migration.up(runner as never);
    const calls = (runner as unknown as { calls: Array<{ sql: string; params?: unknown[] }> })
      .calls;

    const statement = backfillStatement(calls);
    expect(statement).toBeDefined();
    expect(statement!.sql).toMatch(/UPDATE\s+"?kvkk_consents"?/i);

    expect(backfillTriples(calls)).toEqual(
      Object.entries(CONSENT_TYPE_METADATA).map(([consentType, metadata]) => [
        consentType,
        metadata.legalBasis,
        metadata.retentionDays,
      ]),
    );
  });

  it('is idempotent: only NULL columns are filled (COALESCE), never overwritten', async () => {
    const runner = makeRunner();
    await migration.up(runner as never);
    const calls = (runner as unknown as { calls: Array<{ sql: string; params?: unknown[] }> })
      .calls;

    const sql = backfillStatement(calls)!.sql;
    // Yalnız eksik kolon dolar: dolu kolon ezilmez.
    expect(sql).toContain('legal_basis = COALESCE(c.legal_basis, m.legal_basis)');
    expect(sql).toContain(
      'retention_days = COALESCE(c.retention_days, m.retention_days::int)',
    );
    expect(sql).toMatch(/legal_basis\s+IS\s+NULL\s+OR\s+c\.retention_days\s+IS\s+NULL/i);
  });

  it('casts the VALUES columns — unknown-typed literals cannot be assigned to integer', async () => {
    const runner = makeRunner();
    await migration.up(runner as never);
    const calls = (runner as unknown as { calls: Array<{ sql: string; params?: unknown[] }> })
      .calls;

    const sql = backfillStatement(calls)!.sql;
    // (VALUES ...) sütunları bilinmeyen tipten gelir; integer ataması cast
    // olmadan Postgres'te 42804 hatası verir.
    expect(sql).toMatch(/\$1::text, \$2::text, \$3::int/);
  });

  it('does not import application code: a shipped migration keeps its own snapshot', () => {
    const source = fs.readFileSync(migrationPath, 'utf8');
    const applicationImports = source
      .split('\n')
      .filter((line) => /^import .*from ['"]\.\./.test(line));
    expect(applicationImports).toEqual([]);
  });

  it('leaves consent types outside the map untouched (no invented legal basis)', async () => {
    const runner = makeRunner();
    await migration.up(runner as never);
    const calls = (runner as unknown as { calls: Array<{ sql: string; params?: unknown[] }> })
      .calls;

    const covered = backfillTriples(calls).map(([consentType]) => consentType);
    for (const consentType of covered) {
      expect(CONSENT_TYPE_METADATA).toHaveProperty(consentType);
    }
    // Kapsam map'in anahtarlarıyla birebir: eksik consent_type yok.
    expect(covered.length).toBe(Object.keys(CONSENT_TYPE_METADATA).length);
  });

  it('down() still drops both consent columns (revert is unchanged)', async () => {
    const runner = makeRunner();
    await migration.down(runner as never);
    const all = (runner as unknown as { calls: Array<{ sql: string }> })
      .calls.map((call) => call.sql)
      .join('\n');
    expect(all).toContain('DROP COLUMN IF EXISTS "legal_basis"');
    expect(all).toContain('DROP COLUMN IF EXISTS "retention_days"');
  });
});