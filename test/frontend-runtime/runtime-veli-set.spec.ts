import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * #493 — Veli Bilgilendirme seti kod portu (mock-up → runtime).
 *
 * Dışsal sözleşme pinlenir: uygunluk rozetleri (izinli/maskeli/engeli),
 * engelli uygunlukta onay izinsizliği, "gönderilmediği sürece taslaktır"
 * dürüstlüğü, gönderim iddiası taşıyan kopyasının olmaması.
 */
describe('#493 Veli Bilgilendirme seti (mock-up → runtime)', () => {
  const root = process.cwd();
  const runtimeDir = path.join(root, 'frontend', 'runtime');
  const html = fs.readFileSync(path.join(runtimeDir, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(runtimeDir, 'app.js'), 'utf8');
  const notifications = fs.readFileSync(path.join(runtimeDir, 'screens', 'notifications.js'), 'utf8');

  it('notifications panel uygunluk legendini taşır', () => {
    expect(html).toContain('izinli');
    expect(html).toContain('maskeli');
    expect(html).toContain('engeli');
    expect(html).toMatch(/gönderilmediği sürece taslaktır/);
  });

  it('taslak kuyruğu uygunluk rozetiyle render edilir', () => {
    expect(notifications).toContain('notificationEligibility');
    expect(notifications).toContain('data-eligibility="');
    expect(notifications).toContain("'izinli'");
    expect(notifications).toContain("'maskeli'");
    expect(notifications).toContain("'engeli'");
  });

  it('mesaj inceleme maskeli iletişim + uygunluk kontrolü taşır', () => {
    expect(notifications).toContain('maskeli gösterilir');
    expect(notifications).toContain('Uygunluk');
    expect(notifications).toContain('Onay sürümü');
    expect(notifications).toContain('Gönderim kanıtları');
  });

  it('gönderim iddiası taşıyan kopya yoktur', () => {
    expect(app).not.toMatch(/gönderim yapıldı|teslim edildi/);
    expect(notifications).not.toMatch(/gönderildi|teslim edildi/);
  });

  it('engelli uygunlukta onay izinli değildir (fail-closed)', () => {
    expect(app).toContain("blocked_consent: 'Onay engelli'");
    expect(notifications).toContain("'engeli'");
  });

  it('kuyruk devamlı boşken dürüst boş durum taşır', () => {
    expect(app).toContain("Taslak kalır (gönderim yok)");
    expect(app).toContain('Kuyrukta bekleyen bildirim yok');
  });

  it('yeni panel alanları korunur', () => {
    expect(html).toContain('id="notification-status-filter"');
    expect(html).toContain('id="notification-detail"');
    expect(notifications).toContain("registerTabActivationHook('notifications'");
  });
});
