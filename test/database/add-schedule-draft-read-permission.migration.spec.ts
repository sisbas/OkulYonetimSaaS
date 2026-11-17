import { AddScheduleDraftReadPermission1920000000000 } from '../../src/database/migrations/1920000000000-AddScheduleDraftReadPermission';

/**
 * Migration smoke (#448): izin anahtarının varlığı, batch grant'ların yalnız
 * tenant_admin/operations_manager rolleriyle verilmesi ve down()'un izin
 * şemasını saniyesinde geriye alması — mocked runner ile, gerçek satır yazmadan.
 */
describe('AddScheduleDraftReadPermission1920000000000 (#448)', () => {
  const migration = new AddScheduleDraftReadPermission1920000000000();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const makeRunner = () => {
    const calls: string[] = [];
    return {
      calls,
      query: jest.fn(async (sql: string) => {
        calls.push(sql);
        return undefined;
      }),
    } as unknown as import('typeorm').QueryRunner & { calls: string[] };
  };

  it('up() inserts the schedule:draft:read key idempotently', async () => {
    const runner = makeRunner();

    await migration.up(runner);

    expect(runner.calls[0]).toContain("VALUES ('schedule:draft:read'");
    expect(runner.calls[0]).toContain('ON CONFLICT (code) DO UPDATE');
  });

  it('up() grants only tenant_admin and operations_manager roles, nothing else', async () => {
    const runner = makeRunner();

    await migration.up(runner);

    const grant = runner.calls[1];
    expect(grant).toContain("r.name IN ('tenant_admin', 'operations_manager')");
    expect(grant).toContain('r.deleted_at IS NULL');
    expect(grant).toContain('ON CONFLICT DO NOTHING');
    expect(grant).not.toContain('teacher');
    expect(grant).not.toContain('viewer');
    expect(grant).not.toContain('student');
    expect(grant).not.toContain('parent');
  });

  it('up() is re-runnable (idempotent)', async () => {
    const first = makeRunner();
    const second = makeRunner();

    await migration.up(first);
    await migration.up(second);

    expect(second.calls).toEqual(first.calls);
  });

  it('down() removes grants and the key', async () => {
    const runner = makeRunner();

    await migration.down(runner);

    expect(runner.calls.some((sql) => sql.includes('DELETE FROM role_permissions'))).toBe(true);
    expect(runner.calls.some((sql) => sql.includes("DELETE FROM permissions WHERE code = 'schedule:draft:read'"))).toBe(true);
  });
});
