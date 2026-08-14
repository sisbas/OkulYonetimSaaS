import {
  AUDIT_PII_KEYS,
  buildTenantScopedAuditQuery,
  matchesActionFilter,
  maskPiiRecursive,
  redactAuditRowForExport,
  redactAuditRowsForExport,
} from './audit-tenant-query.builder';
import { TenantScopedAuditQuery, TenantScopedAuditRow } from './transactional-audit.types';

const TENANT_A = '10000000-0000-4000-8000-0000000000a1';
const TENANT_B = '10000000-0000-4000-8000-0000000000b2';

function row(overrides: Partial<TenantScopedAuditRow> = {}): TenantScopedAuditRow {
  return {
    id: 'row-1',
    tenantId: TENANT_A,
    actorUserId: '30000000-0000-4000-8000-0000000000ff',
    actorSessionId: null,
    action: 'student.created',
    entityType: 'student',
    entityId: '20000000-0000-4000-8000-0000000000ee',
    requestId: 'req-1',
    metadataJson: null,
    createdAt: new Date('2026-08-13T00:00:00Z'),
    ...overrides,
  };
}

describe('okul-03-audit-scope: tenant-scoped audit filtreleme', () => {
  it('tenantId her zaman WHERE kilidinde yer alır (tenant isolation)', () => {
    const { sql, params } = buildTenantScopedAuditQuery({ tenantId: TENANT_A });
    expect(sql).toContain('tenant_id = $1');
    expect(params[0]).toBe(TENANT_A);
  });

  it('tenantId boşsa hata fırlatır', () => {
    expect(() => buildTenantScopedAuditQuery({ tenantId: '' })).toThrow(/tenant isolation/);
  });

  it('entityType ve entityId filtrelerini ekler', () => {
    const { sql, params } = buildTenantScopedAuditQuery({ tenantId: TENANT_A, entityType: 'student', entityId: 'e-1' });
    expect(sql).toContain('entity_type = $2');
    expect(sql).toContain('entity_id = $3');
    expect(params).toEqual([TENANT_A, 'student', 'e-1']);
  });

  it('tam action adlarını IN yerine eşitlik ile çevirir', () => {
    const { sql, params } = buildTenantScopedAuditQuery({ tenantId: TENANT_A, actions: ['student.created', 'teacher.created'] });
    expect(sql).toContain("action = $2");
    expect(sql).toContain("action = $3");
    expect(params).toEqual([TENANT_A, 'student.created', 'teacher.created']);
  });

  it('joker action ailesini LIKE ile çevirir (auth.*)', () => {
    const { sql, params } = buildTenantScopedAuditQuery({ tenantId: TENANT_A, actions: ['auth.*'] });
    expect(sql).toContain('action LIKE $2');
    expect(params[1]).toBe('auth.%');
  });

  // P2 (PR #227): aile ön eki içindeki PostgreSQL LIKE metakarakterleri (% ve _)
  // kaçışlı + ESCAPE klauzlu olmalı; aksi halde yanlış eşleşmelere yol açar.
  it("LIKE metakarakterlerini kaçışlar (auth%.* -> 'auth\\%%' ESCAPE)", () => {
    const { sql, params } = buildTenantScopedAuditQuery({ tenantId: TENANT_A, actions: ['auth%.*'] });
    expect(sql).toContain("action LIKE $2 ESCAPE '\\'");
    expect(params[1]).toBe('auth\\%.%');
  });

  it("alt çizgi (_) LIKE metakarakterini kaçışlar (daily_operations.*)", () => {
    const { sql, params } = buildTenantScopedAuditQuery({ tenantId: TENANT_A, actions: ['daily_operations.*'] });
    expect(sql).toContain("action LIKE $2 ESCAPE '\\'");
    expect(params[1]).toBe('daily\\_operations.%');
  });

  it("'*' action filtresi ek bir action koşulu üretmez", () => {
    const { sql } = buildTenantScopedAuditQuery({ tenantId: TENANT_A, actions: ['*'] });
    expect(sql).not.toContain('action =');
    expect(sql).not.toContain('action LIKE');
  });

  it('tarih aralığı ve limit/offset ekler', () => {
    const { sql, params } = buildTenantScopedAuditQuery({
      tenantId: TENANT_A,
      fromCreatedAt: '2026-01-01',
      toCreatedAt: '2026-12-31',
      limit: 50,
      offset: 10,
    });
    expect(sql).toContain('created_at >= $2');
    expect(sql).toContain('created_at <= $3');
    expect(sql).toContain('LIMIT 50 OFFSET 10');
    expect(params).toEqual([TENANT_A, '2026-01-01', '2026-12-31']);
  });

  it('limit üst sınırı (500) ile sınırlanır', () => {
    const { sql } = buildTenantScopedAuditQuery({ tenantId: TENANT_A, limit: 99999 });
    expect(sql).toContain('LIMIT 500');
  });

  it('matchesActionFilter tam ad ve joker eşleşmesini doğru yapar', () => {
    expect(matchesActionFilter('auth.login.failure', 'auth.login.failure')).toBe(true);
    expect(matchesActionFilter('auth.login.failure', 'auth.*')).toBe(true);
    expect(matchesActionFilter('auth.login.failure', 'student.*')).toBe(false);
    expect(matchesActionFilter('auth.login.failure', '*')).toBe(true);
    expect(matchesActionFilter('auth.login.failure', 'auth.login' as 'auth.*')).toBe(false);
  });
});

describe('okul-03-audit-scope: KVKK PII maskesi (okuma/ihraç anında)', () => {
  it('AUDIT_PII_KEYS email/phone/studentName gibi alanları içerir', () => {
    for (const key of ['email', 'phone', 'studentName', 'parentPhone', 'teacherEmail', 'token']) {
      expect(AUDIT_PII_KEYS.has(key)).toBe(true);
    }
  });

  it('maskPiiRecursive PII alanlarını [REDACTED] ile değiştirir, diğerlerini korur', () => {
    const counters = { redacted: 0, skipped: 0 };
    const out = maskPiiRecursive(
      {
        action: 'student.created',
        email: 'veli@example.com',
        profile: { name: 'Ada', phone: '+905****2233' },
        children: [{ email: 'child@example.com', classroom: '1-A' }],
      },
      counters,
    ) as Record<string, unknown>;

    expect(out.email).toBe('[REDACTED]');
    expect((out.profile as Record<string, unknown>).phone).toBe('[REDACTED]');
    expect((out.profile as Record<string, unknown>).name).toBe('Ada');
    expect((out.children as unknown[])[0]).toMatchObject({ email: '[REDACTED]', classroom: '1-A' });
    // 3 PII alanı maskelendi (email, phone, email), 4 alan atlandı (action, profile, name, children, classroom)
    expect(counters.redacted).toBe(3);
    expect(counters.skipped).toBeGreaterThan(0);
  });

  it('redactAuditRowForExport receipt muhasebesini tutarlı tutar (redacted+skipped === evaluated)', () => {
    const { row: redacted, receipt } = redactAuditRowForExport(
      row({
        action: 'student.created',
        metadataJson: { studentId: 'uuid', parentEmail: 'veli@example.com', branchName: 'Merkez' },
      }),
    );
    expect(receipt.evaluatedFieldCount).toBe(receipt.redactedFieldCount + receipt.skippedFieldCount);
    expect((redacted.metadataJson as Record<string, unknown>).parentEmail).toBe('[REDACTED]');
    expect(receipt.strategy).toBe('full-redact');
  });

  it('PII içermeyen satır receipt.strategy = none üretir', () => {
    const { receipt } = redactAuditRowForExport(row({ metadataJson: { status: 'active', branchId: 'b' } }));
    expect(receipt.strategy).toBe('none');
    expect(receipt.redactedFieldCount).toBe(0);
  });

  it('redactAuditRowsForExport çoklu satırı işler ve tenant sınırını korur', () => {
    const results = redactAuditRowsForExport([
      row({ tenantId: TENANT_A, metadataJson: { parentPhone: '+90...' } }),
      row({ tenantId: TENANT_B, metadataJson: { email: 'x@y.z' } }),
    ]);
    expect(results).toHaveLength(2);
    expect(results[0].row.tenantId).toBe(TENANT_A);
    expect(results[1].row.tenantId).toBe(TENANT_B);
    expect((results[0].row.metadataJson as Record<string, unknown>).parentPhone).toBe('[REDACTED]');
    expect((results[1].row.metadataJson as Record<string, unknown>).email).toBe('[REDACTED]');
  });

  // P1 (PR #227): ihraç maskesine yeni eklenen yasaklı anahtarlar ham kalmamalı.
  it.each([
    'credential',
    'setCookie',
    'requestBody',
    'healthDetail',
    'healthInfo',
    'leaveDetail',
    'freeTextReason',
  ])('redactAuditRowForExport yasaklı ihraç anahtarını maskeler: %s', (forbiddenKey) => {
    // AUDIT_PII_KEYS kapsamına girdiğinden emin ol (regresyon koruması).
    expect(AUDIT_PII_KEYS.has(forbiddenKey)).toBe(true);

    const { row: redacted, receipt } = redactAuditRowForExport(
      row({ action: 'dataprotection.export.redacted', metadataJson: { [forbiddenKey]: 'RAW-SENSITIVE-DATA' } }),
    );
    expect((redacted.metadataJson as Record<string, unknown>)[forbiddenKey]).toBe('[REDACTED]');
    expect(receipt.redactedFieldCount).toBeGreaterThanOrEqual(1);
    expect(receipt.strategy).toBe('full-redact');
  });
});
