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
