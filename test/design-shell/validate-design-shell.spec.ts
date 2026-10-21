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
