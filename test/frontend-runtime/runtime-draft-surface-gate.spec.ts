import {
  runtime,
  TEACHER_PERMISSION_KEYS,
  VIEWER_PERMISSION_KEYS,
} from './runtime-harness';

/**
 * #448 — yönetim draft-read anahtarı henüz #449 (GET /schedules/drafts ve
 * GET /schedules/:id/draft) ile yola girmedi; ancak teacher/viewer'in bu yüzeyi
 * KEŞFEDEMEYECEĞİ sözleşme gereği kalıcıdır: kullanıcısı olmayan route zaten
 * istemci tablosunda yoktur (fail-closed) ve teacher/viewer izin anahtarı listesi
 * hiçbir koşulla draft-read anahtarı içermez (permission-seed.spec.ts pinler).
 *
 * Bu pin #449 ile birlikte genişler: ops/admin için 200, teacher/viewer için
 * non-discovering davranış devam eder.
 */
describe('#448 draft surface non-discovery (teacher/viewer)', () => {
  const PROBE = 'state, canRequest, ROUTE_PERMISSIONS';

  it('teacher persona cannot call the draft surface (fail-closed)', () => {
    const ui = runtime(PROBE, TEACHER_PERMISSION_KEYS);
    ui.probe.state.accessToken = 'token';
    ui.probe.state.branchId = 'ANKARA';

    expect(ui.probe.canRequest('GET', '/schedules/drafts')).toBe(false);
    expect(ui.probe.canRequest('GET', '/schedules/:id')).toBe(false);
    expect(ui.probe.canRequest('GET', '/schedules')).toBe(false);
  });

  it('viewer persona cannot call the draft surface (fail-closed)', () => {
    const ui = runtime(PROBE, VIEWER_PERMISSION_KEYS);
    ui.probe.state.accessToken = 'token';
    ui.probe.state.branchId = 'ANKARA';

    expect(ui.probe.canRequest('GET', '/schedules/drafts')).toBe(false);
    expect(ui.probe.canRequest('GET', '/schedules/:id')).toBe(false);
  });

  it('route table carries no draft affordance until #449 ships it', () => {
    const ui = runtime(PROBE, TEACHER_PERMISSION_KEYS);
    const keys = JSON.stringify(ui.probe.ROUTE_PERMISSIONS);

    expect(keys).not.toContain('/schedules/drafts');
  });
});
