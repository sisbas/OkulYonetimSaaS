import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

const SCRIPT = path.join(process.cwd(), 'scripts', 'validate-design-shell.mjs');
const IA_ORDER = [
  'Bugün', 'Program', 'İzinler', 'Yoklama', 'Veli Bilgilendirme',
  'Tanımlar', 'Raporlar', 'Yönetim',
];

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

function write(dir: string, name: string, html: string): void {
  fs.writeFileSync(path.join(dir, name), html, 'utf8');
}

describe('validate-design-shell', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'design-shell-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('geçerli bir tasarım kabuğu sayfasını kabul eder', () => {
    write(dir, 'index.html', makePage());
    expect(() => execFileSync('node', [SCRIPT, dir], { encoding: 'utf8' })).not.toThrow();
  });

  it('eksik kanonik IA nav ögesini reddeder', () => {
    write(dir, 'index.html', makePage({ nav: IA_ORDER.slice(0, 7).map((t) => `<strong>${t}</strong>`).join('') }));
    expect(() => execFileSync('node', [SCRIPT, dir], { encoding: 'utf8' })).toThrow();
  });

  it('eksik token referansını reddeder', () => {
    write(dir, 'index.html', makePage({ tokens: 'href="../app/other.css"' }));
    expect(() => execFileSync('node', [SCRIPT, dir], { encoding: 'utf8' })).toThrow();
  });

  it('eksik viewport meta nesnesini reddeder', () => {
    write(dir, 'index.html', makePage({ viewport: false }));
    expect(() => execFileSync('node', [SCRIPT, dir], { encoding: 'utf8' })).toThrow();
  });

  it('referans edilen token dosyasının repoda olduğunu doğrular', () => {
    expect(fs.existsSync(path.join(process.cwd(), 'frontend', 'app', 'tokens.css'))).toBe(true);
  });
});

const DESIGN_DIR = path.join(process.cwd(), 'frontend', 'design');

function readPage(name: string): string {
  return fs.readFileSync(path.join(DESIGN_DIR, name), 'utf8');
}

const shellChecks = (html: string) => {
  for (const item of IA_ORDER) expect(html).toContain(`<strong>${item}</strong>`);
  expect(html).toContain('href="../app/tokens.css"');
  expect(/<meta[^>]*name="viewport"[^>]*>/.test(html)).toBe(true);
  expect(/class="skip-link"/.test(html)).toBe(true);
  expect(/id="design-main"/.test(html)).toBe(true);
};

describe('login ve 403 mock-up\'ları (#473)', () => {
  it('login mock-up: kabuk geçerli, giriş formu mevcut, başarı koprası yok', () => {
    const html = readPage('login.html');
    shellChecks(html);
    expect(html).toContain('id="email"');
    expect(html).toContain('id="password"');
    expect(html).toContain('id="tenant-id"');
    expect(/type="submit"/.test(html)).toBe(true);
    expect(html).not.toContain('Hoş geldiniz');
    expect(html).not.toContain('başarılı');
  });

  it('403 mock-up: erişim sınırı, başarı koprası yok', () => {
    const html = readPage('403.html');
    shellChecks(html);
    expect(/erişim|yetki|sınır/i.test(html)).toBe(true);
    expect(html).not.toContain('Hoş geldiniz');
    expect(html).not.toContain('başarılı');
  });
});

describe('Program seti mock-up\'ları (#474)', () => {
  it('program.html: haftalık program, sınıf/öğretmen/derslik filtreleri, ders kartları', () => {
    const html = readPage('program.html');
    shellChecks(html);
    expect(html).toContain('id="branch-filter"');
    expect(html).toContain('id="teacher-filter"');
    expect(html).toContain('id="room-filter"');
    expect(/ders kartı|ders kartları/i.test(html)).toBe(true);
    expect(html).not.toContain('Hoş geldiniz');
  });

  it('program-builder.html: manuel ders ekleme formu, çakışma/branş/izin uyarıları', () => {
    const html = readPage('program-builder.html');
    shellChecks(html);
    expect(html).toContain('id="add-lesson-form"');
    expect(/ders ekle|ekleme/i.test(html)).toBe(true);
    expect(/çakışma|branş|izin/i.test(html)).toBe(true);
    expect(html).not.toContain('Hoş geldiniz');
  });

  it('program-conflicts.html: açık çakışma detayı ve aday seçimi', () => {
    const html = readPage('program-conflicts.html');
    shellChecks(html);
    expect(/açık çakışma|çakışma detayı/i.test(html)).toBe(true);
    expect(/aday seç|seçim/i.test(html)).toBe(true);
    expect(html).not.toContain('Hoş geldiniz');
  });
});

describe('İzinler seti mock-up\'ları (#475)', () => {
  it('leave.html: izin listesi, durum rozetleri (draft/pending/approved/rejected)', () => {
    const html = readPage('leave.html');
    shellChecks(html);
    expect(/[iİ]zin listesi|[iİ]zin talepleri/i.test(html)).toBe(true);
    expect(/draft|pending|approved|rejected/i.test(html)).toBe(true);
    expect(html).not.toContain('Hoş geldiniz');
  });

  it('my-leaves.html: Izinlerim, sahiplik ayrimi', () => {
    const html = readPage('my-leaves.html');
    shellChecks(html);
    expect(/[iİ]zinlerim/i.test(html)).toBe(true);
    expect(/sahiplik|kendi talebi/i.test(html)).toBe(true);
    expect(html).not.toContain('Hoş geldiniz');
  });

  it('leave-new.html: yeni talep formu, tarih araligi, gerekce kategorisi', () => {
    const html = readPage('leave-new.html');
    shellChecks(html);
    expect(/yeni izin|izin talebi|talep olustur/i.test(html)).toBe(true);
    expect(html).toContain('id="leave-starts-at"');
    expect(html).toContain('id="leave-ends-at"');
    expect(/saatlik|tam gün|çok gün/i.test(html)).toBe(true);
    expect(html).not.toContain('Hoş geldiniz');
  });

  it('leave-detail.html: etki ve karar detayi, onay/ret', () => {
    const html = readPage('leave-detail.html');
    shellChecks(html);
    expect(/etki|karar|onay|ret/i.test(html)).toBe(true);
    expect(html).not.toContain('Hoş geldiniz');
  });
});

describe('Yoklama seti mock-up\'ları (#476)', () => {
  it('yoklama.html: ders oturumlari listesi, eksik/tamamlanmis ayrimi', () => {
    const html = readPage('yoklama.html');
    shellChecks(html);
    expect(/yoklama oturum|ders oturumlar/i.test(html)).toBe(true);
    expect(/eksik|tamamlanmış|tamamlandı/i.test(html)).toBe(true);
    expect(html).not.toContain('Hoş geldiniz');
  });

  it('yoklama-session.html: isaretleyici (geldi/gelmedi/gec/izinli/isaretlenmedi), toplu geldi, tamamla', () => {
    const html = readPage('yoklama-session.html');
    shellChecks(html);
    expect(/geldi|gelmedi|geç|izinli|[iİ]şaretlenmedi/i.test(html)).toBe(true);
    expect(/toplu geldi|tamamla/i.test(html)).toBe(true);
    expect(html).not.toContain('Hoş geldiniz');
  });

  it('yoklama-absences.html: tamamlanan sonuclar, iletisleme uygunlugu bildirimi yok', () => {
    const html = readPage('yoklama-absences.html');
    shellChecks(html);
    expect(/tamamlanan|devamsizlik|sonuclar/i.test(html)).toBe(true);
    expect(/[iİ]şaretlenmemiş devamsız sayılmaz|devamsız sayılmaz/i.test(html)).toBe(true);
    expect(html).not.toContain('Hoş geldiniz');
  });
});
