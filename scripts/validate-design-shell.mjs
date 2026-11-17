import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = process.argv[2] ?? 'frontend/design';
const IA_ORDER = [
  'Bugün', 'Program', 'İzinler', 'Yoklama', 'Veli Bilgilendirme',
  'Tanımlar', 'Raporlar', 'Yönetim',
];

let failed = 0;

function check(file, html) {
  const problems = [];
  for (const item of IA_ORDER) {
    if (!html.includes(`<strong>${item}</strong>`)) {
      problems.push('eksik kanonik IA nav ögesi: ' + item);
    }
  }
  if (!html.includes('href="../app/tokens.css"')) {
    problems.push('eksik token referansı: ../app/tokens.css');
  }
  if (!/<meta[^>]*name="viewport"[^>]*>/.test(html)) {
    problems.push('eksik viewport meta nesnesi');
  }
  if (!/class="skip-link"/.test(html)) {
    problems.push('eksik skip-link');
  }
  if (!/id="design-main"/.test(html)) {
    problems.push('eksik ana bölge: #design-main');
  }
  if (problems.length) {
    failed += 1;
    console.error(file + ': ' + problems.join('; '));
  }
}

for (const name of fs.readdirSync(ROOT)) {
  if (!name.endsWith('.html')) continue;
  const file = path.join(ROOT, name);
  check(file, fs.readFileSync(file, 'utf8'));
}

process.exit(failed ? 1 : 0);
