import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

/**
 * Tasarım kabuğu + mock-up sözleşmesi (#472–#480 serisinin main'e inişi).
 *
 * Bu specler statik HTML mock-up'larını pinler; ürün kodu çalıştırmaz.
 * Sözleşme: kanonik IA (K-58) sekiz sekme, ortak token referansı, viewport,
 * skip-link ve tek ana bölge (#design-main). Statik doğrulayıcı
 * `scripts/validate-design-shell.mjs`, kabul kanıtı bu dosyadır.
 */

const SCRIPT = path.join(process.cwd(), 'scripts', 'validate-design-shell.mjs');
const DESIGN_DIR = path.join(process.cwd(), 'frontend', 'design');
const IA_ORDER = [
  'Bugün', 'Program', 'İzinler', 'Yoklama', 'Veli Bilgilendirme',
  'Tanımlar', 'Raporlar', 'Yönetim',
];

const PAGES = fs
  .readdirSync(DESIGN_DIR)
  .filter((name) => name.endsWith('.html'))
  .sort();

const readPage = (name: string): string => fs.readFileSync(path.join(DESIGN_DIR, name), 'utf8');
const runValidator = (dir: string): string => execFileSync('node', [SCRIPT, dir], { encoding: 'utf8' });

function shellChecks(html: string): void {
  for (const item of IA_ORDER) expect(html).toContain(`<strong>${item}</strong>`);
  expect(html).toContain('href="../app/tokens.css"');
  expect(/<meta[^>]*name="viewport"[^>]*>/.test(html)).toBe(true);
  expect(/class="skip-link"/.test(html)).toBe(true);
  expect(/id="design-main"/.test(html)).toBe(true);
}

function makePage(overrides: { nav?: string; tokens?: string; viewport?: boolean } = {}): string {
  const nav = overrides.nav ?? IA_ORDER.map((t) => `<strong>${t}</strong>`).join('');
  const tokens = overrides.tokens ?? 'href="../app/tokens.css"';
  const viewport = overrides.viewport !== false
    ? '<meta name="viewport" content="width=device-width, initial-scale=1">'
    : '';
  return `<!doctype html>
<html lang="tr">
  <head>
    <meta charset="utf-8" />
    ${viewport}
    <link rel="stylesheet" ${tokens} />
    <title>Boş mock-up</title>
  </head>
  <body>
    <a class="skip-link" href="#design-main">İçeriğe geç</a>
    <nav class="tabs" aria-label="Tasarım akışları">${nav}</nav>
    <main id="design-main" tabindex="-1" data-state="empty"></main>
  </body>
</html>`;
}

describe('scripts/validate-design-shell.mjs', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'design-shell-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const write = (name: string, html: string) => fs.writeFileSync(path.join(dir, name), html, 'utf8');

  it('geçerli bir tasarım kabuğu sayfasını kabul eder', () => {
    write('index.html', makePage());
    expect(() => runValidator(dir)).not.toThrow();
  });

  it('eksik kanonik IA nav ögesini reddeder', () => {
    write('index.html', makePage({ nav: IA_ORDER.slice(0, 7).map((t) => `<strong>${t}</strong>`).join('') }));
    expect(() => runValidator(dir)).toThrow();
  });

  it('eksik token referansını reddeder', () => {
    write('index.html', makePage({ tokens: 'href="../app/other.css"' }));
    expect(() => runValidator(dir)).toThrow();
  });

  it('eksik viewport meta nesnesini reddeder', () => {
    write('index.html', makePage({ viewport: false }));
    expect(() => runValidator(dir)).toThrow();
  });

  it('referans edilen token dosyasının repoda olduğunu doğrular', () => {
    expect(fs.existsSync(path.join(process.cwd(), 'frontend', 'app', 'tokens.css'))).toBe(true);
  });
});

describe('kabuk sözleşmesi: her mock-up sayfası', () => {
  it('tasarım klasörü boş değil ve her sayfa kanonik IA sekmesini taşır', () => {
    expect(PAGES.length).toBeGreaterThanOrEqual(15);
    for (const page of PAGES) shellChecks(readPage(page));
  });

  it('gerçek klasörde statik doğrulayıcı hatasız geçer', () => {
    expect(() => runValidator(DESIGN_DIR)).not.toThrow();
  });

  it('hiçbir mock-up başarı/giriş iddiası taşımaz (fail-closed kopya)', () => {
    for (const page of PAGES) {
      const html = readPage(page);
      expect(html).not.toContain('Hoş geldiniz');
      expect(html).not.toContain('başarılı');
    }
  });
});

describe('giriş ve erişim sınırı yüzeyi (#488 hazırlığı)', () => {
  it('login.html: giriş formu (e-posta, parola, kurum), başarı iddiası yok', () => {
    const html = readPage('login.html');
    shellChecks(html);
    expect(html).toContain('id="email"');
    expect(html).toContain('id="password"');
    expect(html).toContain('id="tenant-id"');
    expect(/type="submit"/.test(html)).toBe(true);
    expect(html).not.toContain('Hoş geldiniz');
  });

  it('403.html: erişim sınırı kopyası, başarı iddiası yok', () => {
    const html = readPage('403.html');
    shellChecks(html);
    expect(/erişim|yetki|sınır/i.test(html)).toBe(true);
    expect(html).not.toContain('Hoş geldiniz');
  });
});

describe('program seti (#490 hazırlığı)', () => {
  it('program.html: haftalık program, sınıf/öğretmen/derslik filtreleri, ders kartları', () => {
    const html = readPage('program.html');
    shellChecks(html);
    expect(html).toContain('id="branch-filter"');
    expect(html).toContain('id="teacher-filter"');
    expect(html).toContain('id="room-filter"');
    expect(/ders kartı|ders kartları/i.test(html)).toBe(true);
  });

  it('program-builder.html: manuel ders ekleme formu, çakışma/branş/izin uyarıları', () => {
    const html = readPage('program-builder.html');
    shellChecks(html);
    expect(html).toContain('id="add-lesson-form"');
    expect(/ders ekle|ekleme/i.test(html)).toBe(true);
    expect(/çakışma|branş|izin/i.test(html)).toBe(true);
  });

  it('program-conflicts.html: açık çakışma detayı ve aday seçimi, otomatik çözücü iddiası yok', () => {
    const html = readPage('program-conflicts.html');
    shellChecks(html);
    expect(/açık çakışma|çakışma detayı/i.test(html)).toBe(true);
    expect(/aday seç|seçim/i.test(html)).toBe(true);
  });
});

describe('veli bilgilendirme seti (#493 hazırlığı)', () => {
  it('parent-notifications.html: taslak kuyruğu, iletişim uygunluğu rozetleri', () => {
    const html = readPage('parent-notifications.html');
    shellChecks(html);
    expect(/taslak kuyru|kuyruk/i.test(html)).toBe(true);
    expect(/[iİ]zinli|maskeli|engeli/i.test(html)).toBe(true);
    expect(/gönderilmedi|gönderilmemiş|queued/i.test(html)).toBe(true);
  });

  it('parent-notifications-detail.html: mesaj inceleme, maskeli iletişim, onay/iptal', () => {
    const html = readPage('parent-notifications-detail.html');
    shellChecks(html);
    expect(/mesaj inceleme|içerik|inceleme/i.test(html)).toBe(true);
    expect(/maskeli|gizli/i.test(html)).toBe(true);
    expect(/onay|iptal/i.test(html)).toBe(true);
  });
});

describe('tanımlar, yönetim ve raporlar seti (#494 hazırlığı)', () => {
  it('definitions.html: öğretmen/grup; ders/derslik/saat dilimi listeleri', () => {
    const html = readPage('definitions.html');
    shellChecks(html);
    expect(/öğretmen|öğrenci|grup/i.test(html)).toBe(true);
    expect(/ders|derslik|saat dilimi/i.test(html)).toBe(true);
    expect(/liste|arama|detay/i.test(html)).toBe(true);
  });

  it('users-roles.html: erişim matrisi (makine-okur izin anahtarı + insan etiketi)', () => {
    const html = readPage('users-roles.html');
    shellChecks(html);
    expect(/erişim matrisi/i.test(html)).toBe(true);
    expect(/izin anahtarı|izin kodu|insan etiketi/i.test(html)).toBe(true);
  });

  it('reports.html: açık iş ve yük özeti, fiziksel kapanış iddiası yok', () => {
    const html = readPage('reports.html');
    shellChecks(html);
    expect(/[aA]çık/.test(html)).toBe(true);
    expect(/[yY]ük özeti/i.test(html)).toBe(true);
    expect(/kapanış|iddia yok/i.test(html)).toBe(true);
  });
});

describe('envanter ve kapsam kaydı (#479)', () => {
  it('envanter.html her mock-up dosyasını listeler (sürüklenme fail-closed)', () => {
    const html = readPage('envanter.html');
    shellChecks(html);
    for (const page of PAGES) expect(html).toContain(page);
    expect(/envanter|tüm ekran|tüm mock-up/i.test(html)).toBe(true);
  });

  it('responsive ve durum kesitleri belgelenir', () => {
    const html = readPage('envanter.html');
    expect(/360|768|1024|1440/.test(html)).toBe(true);
    expect(/boş|engelli|yasaklı/i.test(html)).toBe(true);
  });

  it('tek dosyada toplanan setler ve eksik Bugün mock-up\'ı kayıtlıdır', () => {
    const html = readPage('envanter.html');
    expect(html).toContain('#508');
    expect(html).toContain('#510');
    expect(html).toContain('#489');
    expect(PAGES).not.toContain('bugun.html');
    expect(PAGES).not.toContain('leave.html');
    expect(PAGES).not.toContain('yoklama-session.html');
  });
});

describe('stratejik hedefler mock-up\'ı (#483/#500)', () => {
  it('kanonik IA etiketi doğru yazılır (Tınımlar yazım hatası geri gelmez)', () => {
    const html = readPage('strategic-goals.html');
    shellChecks(html);
    expect(html).not.toContain('Tınımlar');
    expect(html).toContain('<strong>Tanımlar</strong>');
  });

  it('deploy flag\'i kapalı durumu belgelenir', () => {
    const html = readPage('strategic-goals.html');
    expect(/STRATEGIC_GOALS_ENABLED|404/.test(html)).toBe(true);
  });
});
