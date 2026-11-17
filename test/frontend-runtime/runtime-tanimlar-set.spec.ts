import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * #494 — Tanımlar / Raporlar / Yönetim seti kod portu (mock-up'lar → runtime).
 *
 * Dışsal sözleşme pinlenir: tanımlar listesi iskelet (Öğretmen/Grup/Öğrenci/
 * Ders/Derslik/Saat dilimi), raporlar dürüst boş durumu (kapanış/teslimat iddiası
 * yok), kullanıcı/rol erişim matrisi (makine-okur anahtar + insan etiketi ayrımı).
 * Canlı veri servisi henüz yayınlanmamıştır; hiçbir ekran sahte veri üretmez.
 */
describe('#494 Tanımlar/Raporlar/Yönetim seti (mock-up → runtime)', () => {
  const root = process.cwd();
  const runtimeDir = path.join(root, 'frontend', 'runtime');
  const screensDir = path.join(runtimeDir, 'screens');
  const html = fs.readFileSync(path.join(runtimeDir, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(runtimeDir, 'app.js'), 'utf8');
  const definitions = fs.readFileSync(path.join(screensDir, 'definitions.js'), 'utf8');
  const reports = fs.readFileSync(path.join(screensDir, 'reports.js'), 'utf8');
  const usersRoles = fs.readFileSync(path.join(screensDir, 'users-roles.js'), 'utf8');

  it('tanimlar/raporlar/yonetim panellerini ve sekmeleri taşır', () => {
    expect(html).toContain('id="definitions-panel"');
    expect(html).toContain('id="reports-panel"');
    expect(html).toContain('id="users-roles-panel"');
    expect(html).toContain('data-tab="tanimlar"');
    expect(html).toContain('data-tab="raporlar"');
    expect(html).toContain('data-tab="yonetim"');
  });

  it('definitions paneli altı kaynak seçeneğini ve arama iskeleti taşır', () => {
    for (const option of ['value="teachers"', 'value="groups"', 'value="students"', 'value="courses"', 'value="rooms"', 'value="time-slots"']) {
      expect(html).toContain(option);
    }
    expect(html).toContain('id="definition-type"');
    expect(html).toContain('id="definition-search"');
    expect(html).toContain('id="definition-list"');
  });

  it('definitions dürüst boş durum gösterir', () => {
    expect(definitions).toContain('Kayıt yok');
    expect(definitions).toContain('teachers');
    expect(definitions).toContain('time-slots');
    expect(definitions).not.toContain('mockapi');
    expect(definitions).not.toContain('fakeapi');
    expect(definitions).not.toContain('fixture');
    expect(definitions).not.toContain('synthetic');
    expect(definitions.toLowerCase()).not.toContain('fetch(');
  });

  it('reports dürüst boş durum taşır; kapanış/teslimat iddiası yoktur', () => {
    expect(html).toContain('id="report-cards"');
    expect(reports).toContain('Gösterilecek rapor yok');
    expect(reports).not.toMatch(/kapanış tamamlandı|teslim edildi|gönderildiği söylenir/i);
    expect(reports.toLowerCase()).not.toContain('fetch(');
  });

  it('users-roles matrisi makine-okur + insan etiketi ayrımını taşır', () => {
    expect(html).toContain('id="users-roles-matrix"');
    expect(usersRoles).toContain('makine-okur');
    expect(usersRoles).toContain('henüz canlı yayınlanmadı');
    expect(usersRoles.toLowerCase()).not.toContain('fetch(');
  });

  it('yeni panel yetkinlik anahtarları app.js TAB_CAPABILITIES içinde taşınır', () => {
    expect(app).toContain("tanimlar: 'daily_operations:read'");
    expect(app).toContain("raporlar: 'leave:read'");
    // #483: Yönetim sekmesi artık iki anahtarın BİRİYLE açılır — kullanıcı/rol
    // matrisi `daily_operations:update`, stratejik hedefler `strategic_goal:read`
    // ister. Tek anahtar pini bu davranış değişikliğini gizlerdi.
    expect(app).toContain("yonetim: ['daily_operations:update', 'strategic_goal:read']");
  });

  it('yeni screen modülleri deferred klasik script ile yüklenir', () => {
    expect(html).toContain('<script src="/runtime/screens/definitions.js" defer></script>');
    expect(html).toContain('<script src="/runtime/screens/reports.js" defer></script>');
    expect(html).toContain('<script src="/runtime/screens/users-roles.js" defer></script>');
    expect(html).toContain('<script src="/runtime/screens/strategic-goals.js" defer></script>');
  });
});
