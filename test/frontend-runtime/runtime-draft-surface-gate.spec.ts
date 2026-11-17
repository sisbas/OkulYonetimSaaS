import {
  runtime,
  TEACHER_PERMISSION_KEYS,
  VIEWER_PERMISSION_KEYS,
  OPS_PERMISSION_KEYS,
  TENANT_ADMIN_PERMISSION_KEYS,
} from './runtime-harness';

/**
 * #447/#448 — program yüzeyinin keşif kısıtlaması.
 *
 * Yönetim draft-read anahtarı (#448) onaylandı ve `/schedules/drafts` ile
 * `/schedules/:scheduleId` #447 ile yayın servisi olarak açıldı. Sözleşme
 * gereği teacher/viewer bu yüzeyi KEŞFEDEMEZ: istemci tablosunda
 * `schedule:draft:read` anahtarı taşımaları gerekir ve sunucu bunu
 * teacher/viewer'e vermez. Söz konusu pin burada kalıcıdır; #450 (program
 * arayüzü) bu yüzeyi ancak admin/ops için açabilir.
 */
describe('#447/#448 draft surface gating (management-only)', () => {
  const PROBE = 'state, canRequest, ROUTE_PERMISSIONS';

  const client = (keys: readonly string[]) => {
    const ui = runtime(PROBE, keys as string[]);
    ui.probe.state.accessToken = 'token';
    ui.probe.state.branchId = 'ANKARA';
    return ui;
  };

  it('teacher persona cannot request draft and published-list without the management keys', () => {
    const ui = client(TEACHER_PERMISSION_KEYS);
    expect(ui.probe.canRequest('GET', '/schedules/drafts')).toBe(false);
    // Öğretmen own-read sahibi: `GET /schedules/:id`'ye any-of ile ulaşır;
    // sunucu own projeksiyonu uygular ve yayınlanmamış/başka kapsam için
    // keşfedemez (non-enumerating 404). Taslak listesini asla göremez.
    expect(ui.probe.canRequest('GET', '/schedules/:scheduleId')).toBe(true);
    expect(ui.probe.canRequest('GET', '/schedules/published')).toBe(true);
  });

  it('viewer persona cannot request any schedule surface (no keys at all)', () => {
    const ui = client(VIEWER_PERMISSION_KEYS);
    expect(ui.probe.canRequest('GET', '/schedules/drafts')).toBe(false);
    expect(ui.probe.canRequest('GET', '/schedules/:scheduleId')).toBe(false);
    expect(ui.probe.canRequest('GET', '/schedules/published')).toBe(false);
  });

  it('operations manager and tenant admin can request the management surface', () => {
    for (const keys of [OPS_PERMISSION_KEYS, TENANT_ADMIN_PERMISSION_KEYS]) {
      const ui = client(keys);
      expect(ui.probe.canRequest('GET', '/schedules/drafts')).toBe(true);
      expect(ui.probe.canRequest('GET', '/schedules/:scheduleId')).toBe(true);
      expect(ui.probe.canRequest('GET', '/schedules/published')).toBe(true);
    }
  });

  it('route table carries the surface, gated by the #448 management key', () => {
    const admin = client(TENANT_ADMIN_PERMISSION_KEYS);
    const entries = JSON.stringify(admin.probe.ROUTE_PERMISSIONS);

    expect(entries).toContain('/schedules/drafts');
    expect(entries).toContain('/schedules/published');
    expect(entries).toContain('/schedules/:scheduleId');
    // Draft yüzeyi yalnızca yönetim anahtarıyla açılır.
    expect(entries).toContain('"permission":"schedule:draft:read"');
  });

  it('teacher entry keeps own-scope read but no management key', () => {
    const teacher = client(TEACHER_PERMISSION_KEYS);
    expect(teacher.probe.canRequest('GET', '/schedules/published')).toBe(true);
    expect(teacher.probe.canRequest('GET', '/schedules/drafts')).toBe(false);
  });
});
