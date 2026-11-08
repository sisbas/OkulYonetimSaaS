import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * #488 — Giriş ve 403 yüzeylerinin mock-up koduna uyarlanması (Refs #488).
 *
 * Bu dilim: /app giriş kabuğu (`frontend/app/ui.js` login görünümü) ve /app
 * erişim sınırı (`frontend/app/ui.js` forbidden renderer) için mock-up dili
 * statik kopya/sözleşme olarak pinlenir. Yeni render yolu eklenmez; fail-closed
 * izin kapısı (#487) ve tek yollar renderRegionState (K-40/K-41) korunur.
 */

describe('#488 login + 403 mock-up port (static view contract)', () => {
  const root = process.cwd();
  const appDir = path.join(root, 'frontend', 'app');
  const ui = fs.readFileSync(path.join(appDir, 'ui.js'), 'utf8');
  const loginCss = fs.readFileSync(path.join(appDir, 'login.css'), 'utf8');

  it('giriş görünümü mock-up panel diline uyarlanır (eyebrow, h1, alt yazı, hint)', () => {
    expect(ui).toContain('<p class="eyebrow">Giriş</p>');
    expect(ui).toContain('id="login-heading">Oturum açın');
    expect(ui).toContain(
      'Kurum ve şube yetkiniz oturum açıldıktan sonra sistem tarafından doğrulanır.',
    );
    expect(ui).toContain('id="login-title" class="login-form-title">Giriş formu');
    expect(ui).toContain('id="tenant-help"');
    expect(ui).toContain('Yetkileriniz ve kurum erişiminiz oturum açınca doğrulanır.');
  });

  it('giriş formu mock-up alanlarını taşır: e-posta, şifre, kurum; rol seçimi yok', () => {
    expect(ui).toContain('id="login-form"');
    expect(ui).toContain('id="login-email"');
    expect(ui).toContain('id="login-password"');
    expect(ui).toContain('name="tenantId"');
    expect(ui).toContain('id="login-tenant"');
    expect(ui).toContain('autocomplete="username"');
    expect(ui).toContain('autocomplete="current-password"');
    expect(ui).toContain('type="email"');
    expect(ui).toContain('type="password"');
    expect(ui).toContain('inputmode="latin"');
    // Rol seçimi / kullanıcı yönetimi alanı görünmez kalır.
    expect(ui).not.toContain('name="role"');
    expect(ui).not.toContain('data-requires-permission');
  });

  it('giriş görünümünde başarılı giriş iddiası taşıyan kopya yok', () => {
    expect(ui).not.toContain('Giriş başarılı');
    expect(ui).not.toMatch(/Giriş (başarılı|onay)/i);
  });

  it('giriş submit handleri tenant bilgisini opsiyonel olarak taşır ve fail-closed akışta kalır', () => {
    expect(ui).toContain('/auth/login');
    expect(ui).toContain(
      'tenantId ? { email, password, tenantId } : { email, password }',
    );
    // İkinci tıklama / yanlış-yeşil iddiası yok: yalnız gerçek fetch akışı.
    expect(ui).toContain('if (f.id === "login-form" && !demo)');
  });

  it('403 yüzeyi mock-up dili taşır ve "Giriş Sayfasına dön" güvenli çıkışını taşır', () => {
    expect(ui).toContain('Bu işlem için yetkiniz yok');
    expect(ui).toContain('Kapsamınız dışında kalan kayıtlar listelenmez');
    expect(ui).toContain('Giriş Sayfasına dön');
    // Raw backend kodu / erişim reddi metni canonical dilde kalır.
    expect(ui).not.toContain('access denied');
    expect(ui).not.toContain('Erişim Reddi');
  });

  it('403 renderer yalnız mevcut forbidden path uzerinden calisir (tek yollar sözcesi)', () => {
    expect(ui).toContain('path() === "403"');
    expect(ui).toContain('body = forbidden();');
  });

  it('login CSS: yeni panel görünümü ve submit/field stilleri var', () => {
    expect(loginCss).toContain('.login-panel');
    expect(loginCss).toContain('.login-submit');
    expect(loginCss).toContain('.login-field');
    expect(loginCss).toContain('.login-page #login-form');
  });

  it('uretim kabugunda kalıcı tarayici deposu yok (P1B-09 siniri)', () => {
    expect(ui).not.toContain('localStorage');
    expect(ui).not.toContain('sessionStorage');
    expect(ui).not.toContain('atob(');
  });
});
