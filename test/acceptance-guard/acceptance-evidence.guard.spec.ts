import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  JOB_OUTCOME_TABLES,
  LEGACY_EXCLUSION_MARKER,
  REFERENCE_TABLES,
} from '../e2e/support/acceptance-tables';

/**
 * S0-A1 (#269 AC-1 / AC-2) — kabul kanıtı statik guard'ı.
 *
 * Yanlış-yeşil'in kök nedenleri kod düzeyinde yasaklanır:
 *  (R1) İş sonucu tablolarına SQL yazımı (onaylı izin, görevlendirme, yoklama,
 *       bildirim, program olayı) → kabul testi kullanıcı yolunu atlıyor demektir.
 *  (R2) Kabul harness'ı (`test/e2e/`) yalnız REFERANS tablolara yazabilir.
 *  (R3) `page.evaluate` içinde `fetch`/XHR → UI atlanarak işlemsel istek.
 *  (R4) `page.evaluate` içinde DOM'a yazma (`innerHTML` vb.) → sahte durum üretimi.
 *  (R5) Legacy istisnası yalnız dosya içi işaretle verilir; işaretli dosya hiçbir
 *       workflow tarafından çalıştırılamaz ve test/ci script'i olarak sunulamaz.
 *
 * Guard kendi dizinini taramaz (kendi regex metinleri kendini ihlal saymasın).
 */

export type GuardFinding = Readonly<{
  rule: string;
  file: string;
  line: number;
  detail: string;
}>;

const SELF_DIRECTORY = path.join('test', 'acceptance-guard');
const SCAN_ROOTS = ['test', 'scripts'];
const SCAN_EXTENSIONS = new Set(['.ts', '.js', '.cjs', '.mjs']);
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'coverage', '.git']);

/** Legacy istisna mekanizmasının geçerli sayıldığı tek dosya (S0-A2). */
export const LEGACY_EXCLUDED_FILE = path.join('scripts', 'qa-p0-browser-e2e.js');

/**
 * İşaretin bulunabileceği dosyalar (review bulgusu P1).
 *
 * Önceki sürüm işareti TAŞIYAN HER dosyayı istisna sayıyordu; yani herhangi bir
 * ihlal, dosyaya bu satır eklenerek sessizce bastırılabilirdi (fail-open).
 * Artık işaret yalnız (a) işaretli legacy dosyada ve (b) sabitin TANIMLANDIĞI
 * yerde bulunabilir; başka her dosyada işaret = ihlal.
 */
export const MARKER_ALLOWED_FILES: ReadonlyArray<string> = Object.freeze([
  LEGACY_EXCLUDED_FILE,
  path.join('test', 'e2e', 'support', 'acceptance-tables.ts'),
]);

/**
 * Kabul kanıtı OLMAYAN, bilinçli olarak kapsam dışı bırakılmış test yüzeyleri.
 *
 * `test/` ve `scripts/` tamamı taranır; bu liste tek tek gerekçeyle daraltır.
 * Bayat giriş reddedilir: giriş artık ihlal üretmiyorsa guard FAIL eder
 * (repo konvansiyonu: exact allowlist, bayat girdi yok).
 */
export const NON_ACCEPTANCE_EXEMPTIONS: ReadonlyArray<{
  file: string;
  reason: string;
  mustContain: string;
}> = Object.freeze([
  {
    file: path.join('test', 'database', 'leave-safety-queries.spec.ts'),
    reason:
      'Mocked/temp-table DB unit test: it creates ON COMMIT DROP temp tables mirroring ' +
      'the job-outcome schemas and inserts into those session-local tables to assert the ' +
      'candidate-eligibility SQL. No real job-outcome row is produced. It is not acceptance ' +
      'evidence and is never bound to the P0 acceptance check.',
    mustContain: 'INSERT INTO schedule_events',
  },
]);

/**
 * İş sonucu ÜRETEN/DEĞİŞTİREN yazımlar. Bilinçli olarak `DELETE`/`TRUNCATE`
 * kapsam dışıdır: bunlar kanıt üretmez, temizliktir (ör. DB entegrasyon
 * testlerinin afterAll temizliği). Yasak olan, sonucu SQL ile İMAL etmektir.
 */
const WRITE_STATEMENT = new RegExp(
  '\\b(?:insert\\s+into|update|copy)\\s+(?:public\\.)?(?:"([a-z_]+)"|([a-z_]+))',
  'gi',
);

const PAGE_EVALUATE = /\bpage\.(?:evaluate|evaluateHandle|evaluateOnNewDocument)\s*\(/g;

/** Yorumları boşlukla nötralize eder; satır numaraları korunur. */
export function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (match, prefix: string) =>
      prefix + ' '.repeat(match.length - prefix.length),
    );
}

function lineAt(source: string, index: number): number {
  return source.slice(0, index).split(/\r?\n/).length;
}

function normalized(relativePath: string): string {
  return relativePath.split('\\').join('/');
}

function isHarnessFile(file: string): boolean {
  return normalized(file).startsWith('test/e2e/');
}

function collectWriteTables(source: string): Array<{ table: string; line: number }> {
  const tables: Array<{ table: string; line: number }> = [];
  for (const match of source.matchAll(WRITE_STATEMENT)) {
    const table = (match[1] ?? match[2] ?? '').toLowerCase();
    if (table.length === 0) continue;
    tables.push({ table, line: lineAt(source, match.index ?? 0) });
  }
  return tables;
}

/** `page.evaluate(...)` çağrısının dengeli (balanced) argüman metnini döner. */
export function extractCallArguments(source: string, openParenIndex: number): string {
  let depth = 0;
  let quote = '';
  for (let i = openParenIndex; i < source.length; i += 1) {
    const char = source[i];
    if (quote !== '') {
      if (char === '\\') i += 1;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '(') depth += 1;
    else if (char === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(openParenIndex, i + 1);
    }
  }
  return source.slice(openParenIndex);
}

/**
 * Tek bir dosya içeriğini kurallara göre tarar. Saf fonksiyondur; negatif kanıt
 * testleri sentetik içerikle bu fonksiyonu çağırır.
 */
export function scanSource(relativePath: string, rawSource: string): GuardFinding[] {
  const file = normalized(relativePath);
  if (file.startsWith(normalized(SELF_DIRECTORY))) return [];
  // Kapsam: kabul kanıtı üretebilecek tüm yüzeyler (test/ ve scripts/).
  if (!file.startsWith('test/') && !file.startsWith('scripts/')) return [];

  const source = stripComments(rawSource);
  const findings: GuardFinding[] = [];

  for (const { table, line } of collectWriteTables(source)) {
    if (JOB_OUTCOME_TABLES.includes(table)) {
      findings.push({
        rule: 'job-outcome-write',
        file,
        line,
        detail: `Job outcome table '${table}' must be produced through the real user journey, not SQL.`,
      });
      continue;
    }
    if (isHarnessFile(file) && !REFERENCE_TABLES.includes(table)) {
      findings.push({
        rule: 'harness-write-not-reference',
        file,
        line,
        detail: `Acceptance harness may only write reference tables; '${table}' is not allowlisted.`,
      });
    }
  }

  for (const match of source.matchAll(PAGE_EVALUATE)) {
    const openParen = (match.index ?? 0) + match[0].length - 1;
    const argument = extractCallArguments(source, openParen);
    const line = lineAt(source, match.index ?? 0);
    if (/\bfetch\s*\(|XMLHttpRequest|\$\.ajax|axios\./.test(argument)) {
      findings.push({
        rule: 'page-evaluate-network',
        file,
        line,
        detail:
          'Operational requests must go through visible UI controls, not page.evaluate(fetch/XHR).',
      });
    }
    if (/innerHTML|outerHTML|insertAdjacentHTML/.test(argument)) {
      findings.push({
        rule: 'page-evaluate-dom-write',
        file,
        line,
        detail: 'Acceptance states must not be fabricated by writing into the DOM.',
      });
    }
  }

  return findings;
}

export function collectScannableFiles(repoRoot: string): string[] {
  const files: string[] = [];
  const walk = (absoluteDir: string, relativeDir: string): void => {
    if (!fs.existsSync(absoluteDir)) return;
    for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      const relativePath = relativeDir === '' ? entry.name : path.join(relativeDir, entry.name);
      if (normalized(relativePath).startsWith(normalized(SELF_DIRECTORY))) continue;
      const absolutePath = path.join(absoluteDir, entry.name);
      if (entry.isDirectory()) walk(absolutePath, relativePath);
      else if (SCAN_EXTENSIONS.has(path.extname(entry.name))) files.push(relativePath);
    }
  };
  for (const root of SCAN_ROOTS) walk(path.join(repoRoot, root), root);
  return files.sort();
}

export function workflowReferences(repoRoot: string, relativeFile: string): string[] {
  const workflowDir = path.join(repoRoot, '.github', 'workflows');
  if (!fs.existsSync(workflowDir)) return [];
  const needle = normalized(relativeFile);
  return fs
    .readdirSync(workflowDir)
    .filter((name) => /\.ya?ml$/.test(name))
    .filter((name) => fs.readFileSync(path.join(workflowDir, name), 'utf8').includes(needle))
    .map((name) => path.join('.github', 'workflows', name));
}

export function packageScriptReferences(repoRoot: string): string[] {
  const packagePath = path.join(repoRoot, 'package.json');
  if (!fs.existsSync(packagePath)) return [];
  const parsed = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as {
    scripts?: Record<string, string>;
  };
  const needle = normalized(LEGACY_EXCLUDED_FILE);
  return Object.entries(parsed.scripts ?? {})
    .filter(([, command]) => command.includes(needle))
    .map(([name, command]) => `${name}: ${command}`);
}

const repoRoot = process.cwd();

function findingsFor(rule: string, file: string, source: string): GuardFinding[] {
  return scanSource(file, source).filter((finding) => finding.rule === rule);
}

function isExemptSurface(relativeFile: string): boolean {
  const file = relativeFile.split('\\').join('/');
  return NON_ACCEPTANCE_EXEMPTIONS.some((entry) => entry.file.split('\\').join('/') === file);
}

/**
 * Legacy istisnası YALNIZ izinli dosyada ve işaret oradayken geçerlidir
 * (review bulgusu P1: işaret taşıyan her dosyayı istisna saymak fail-open'tı).
 */
export function isLegacyExempt(relativeFile: string, source: string): boolean {
  return (
    normalized(relativeFile) === normalized(LEGACY_EXCLUDED_FILE) &&
    source.includes(LEGACY_EXCLUSION_MARKER)
  );
}

/** İşaret, izinli dosyaların dışında bir yerde geçiyorsa suistimaldir. */
export function isMarkerMisuse(relativeFile: string, source: string): boolean {
  const file = normalized(relativeFile);
  return (
    source.includes(LEGACY_EXCLUSION_MARKER) &&
    !MARKER_ALLOWED_FILES.some((allowed) => normalized(allowed) === file)
  );
}

type ScannedFile = Readonly<{ file: string; source: string; findings: GuardFinding[] }>;

function scanRepositoryWithSource(): ScannedFile[] {
  return collectScannableFiles(repoRoot).map((file) => {
    const source = fs.readFileSync(path.join(repoRoot, file), 'utf8');
    return { file, source, findings: scanSource(file, source) };
  });
}

/** Ham tarama (negatif probe testi için; istisna uygulanmaz). */
function scanRepository(): GuardFinding[] {
  return scanRepositoryWithSource().flatMap((entry) => entry.findings);
}

/** İstisnalar uygulandıktan sonra kalan ihlaller. */
function unexemptedFindings(): GuardFinding[] {
  return scanRepositoryWithSource()
    .filter(({ file, source }) => !isExemptSurface(file) && !isLegacyExempt(file, source))
    .flatMap((entry) => entry.findings);
}

/** İşaretin izinli dosyalar dışında kullanıldığı dosyalar. */
function markerMisuseFiles(): string[] {
  return scanRepositoryWithSource()
    .filter(({ file, source }) => isMarkerMisuse(file, source))
    .map(({ file }) => file);
}

describe('acceptance evidence guard (fail-closed)', () => {
  it('R1 — her iş sonucu tablosuna SQL yazımı reddeder', () => {
    for (const table of JOB_OUTCOME_TABLES) {
      const statement = `await client.query(\`INSERT INTO ${table} (tenant_id) VALUES ($1)\`);`;
      expect(findingsFor('job-outcome-write', 'test/e2e/negative.e2e-spec.ts', statement)).toHaveLength(1);
      expect(findingsFor('job-outcome-write', 'scripts/negative.js', statement)).toHaveLength(1);
    }
  });

  it('R2 — harness içinde referans olmayan tabloya yazımı reddeder, referansı kabul eder', () => {
    const notReference = "await client.query('INSERT INTO tenant_settings (tenant_id) VALUES ($1)');";
    expect(
      findingsFor('harness-write-not-reference', 'test/e2e/negative.e2e-spec.ts', notReference),
    ).toHaveLength(1);

    const reference = "await client.query('INSERT INTO users (email) VALUES ($1)');";
    expect(scanSource('test/e2e/negative.e2e-spec.ts', reference)).toEqual([]);
  });

  it('R3 — page.evaluate içinde ağ isteğini reddeder', () => {
    for (const operation of [
      "await page.evaluate(() => fetch('/api/v1/leaves/me'));",
      "await page.evaluate(() => { const x = new XMLHttpRequest(); });",
      "await page.evaluate(() => $.ajax({ url: '/api/v1/x' }));",
      "await page.evaluate(() => axios.get('/api/v1/x'));",
    ]) {
      expect(
        findingsFor('page-evaluate-network', 'test/e2e/negative.e2e-spec.ts', operation).length,
      ).toBeGreaterThanOrEqual(1);
    }

    // Okuma amaçlı DOM/storage incelemesi ihlal DEĞİLDİR (kural 14 istisnası).
    const readOnly = 'await page.evaluate(() => Object.keys(localStorage));';
    expect(scanSource('test/e2e/negative.e2e-spec.ts', readOnly)).toEqual([]);
  });

  it('R4 — page.evaluate içinde DOM yazımını reddeder', () => {
    const domWrite =
      'await page.evaluate(() => { document.querySelector("#m").innerHTML = "<b>x</b>"; });';
    expect(
      findingsFor('page-evaluate-dom-write', 'test/e2e/negative.e2e-spec.ts', domWrite).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('yorum içindeki ihlalleri saymaz', () => {
    const commented = [
      "// await client.query('INSERT INTO leave_requests (tenant_id) VALUES ($1)');",
      '/* await page.evaluate(() => fetch("/api/v1/x")); */',
    ].join('\n');
    expect(scanSource('test/e2e/negative.e2e-spec.ts', commented)).toEqual([]);
  });

  it('depoda istisnasız kabul ihlali bırakmaz', () => {
    expect(unexemptedFindings()).toEqual([]);
  });

  it('P1 — legacy işareti yalnız izinli dosyalarda geçerlidir', () => {
    // İşaret; sabitin tanımlandığı dosya ve işaretli legacy dosya dışında
    // hiçbir yerde bulunamaz (aksi hâlde ihlal susturulabilirdi).
    expect(markerMisuseFiles()).toEqual([]);

    // İşareti literal olarak yazmıyoruz; aksi hâlde bu test dosyasının kendisi
    // işaret taşımış olurdu.
    const marker = ['ACCEPTANCE', 'EVIDENCE', 'EXCLUDED'].join('-');
    const elsewhere = 'test/e2e/zz-silenced.e2e-spec.ts';

    expect(isMarkerMisuse(elsewhere, `// ${marker}\n`)).toBe(true);
    expect(isLegacyExempt(elsewhere, `// ${marker}\n`)).toBe(false);

    expect(isLegacyExempt(LEGACY_EXCLUDED_FILE, `// ${marker}\n`)).toBe(true);
    expect(isMarkerMisuse(LEGACY_EXCLUDED_FILE, `// ${marker}\n`)).toBe(false);
    expect(isMarkerMisuse(MARKER_ALLOWED_FILES[1], marker)).toBe(false);
  });

  it('P1 — işaret eklenerek ihlal susturulamaz (gerçek dosya provası)', () => {
    const probeRelative = path.join('test', 'e2e', 'zz-marker-abuse-probe.e2e-spec.ts');
    const probeAbsolute = path.join(repoRoot, probeRelative);
    const marker = ['ACCEPTANCE', 'EVIDENCE', 'EXCLUDED'].join('-');
    const probeSource = [
      `// ${marker}`,
      "await client.query('INSERT INTO leave_requests (tenant_id) VALUES (1)');",
    ].join('\n');

    fs.writeFileSync(probeAbsolute, probeSource, 'utf8');
    try {
      const probeKey = 'test/e2e/zz-marker-abuse-probe.e2e-spec.ts';
      const rules = unexemptedFindings()
        .filter((finding) => finding.file.split('\\').join('/') === probeKey)
        .map((finding) => finding.rule);
      expect(rules).toContain('job-outcome-write');
      expect(markerMisuseFiles().map((file) => file.split('\\').join('/'))).toContain(probeKey);
    } finally {
      fs.rmSync(probeAbsolute, { force: true });
    }
    expect(fs.existsSync(probeAbsolute)).toBe(false);
  });

  it('kapsam dışı istisnası gerekçeli ve bayat değil', () => {
    for (const entry of NON_ACCEPTANCE_EXEMPTIONS) {
      const absolute = path.join(repoRoot, entry.file);
      expect(fs.existsSync(absolute)).toBe(true);
      expect(entry.reason.length).toBeGreaterThan(30);

      const source = fs.readFileSync(absolute, 'utf8');
      // Bayat giriş: gerekçe hâlâ geçerli olmalı (beklenen desen dosyada durmalı).
      expect(source).toContain(entry.mustContain);
      // ve dosya gerçekten ihlal üretiyor olmalı; aksi hâlde istisna kaldırılmalı.
      expect(scanSource(entry.file, source).length).toBeGreaterThan(0);
    }
  });

  it('legacy istisnası dosya içi işaretlidir ve CI kabul yoluna bağlı değildir', () => {
    const legacyPath = path.join(repoRoot, LEGACY_EXCLUDED_FILE);
    expect(fs.existsSync(legacyPath)).toBe(true);
    expect(fs.readFileSync(legacyPath, 'utf8')).toContain(LEGACY_EXCLUSION_MARKER);

    // İşaretli dosya bir workflow tarafından çalıştırılırsa kabul kanıtı sayılır → FAIL.
    expect(workflowReferences(repoRoot, LEGACY_EXCLUDED_FILE)).toEqual([]);

    // ve test/ci adlı bir npm script'i olarak sunulamaz (aksi hâlde kabul
    // kanıtı gibi görünür). test/ci dışı adlar (ör. manuel demo seed) kabul
    // check'ine bağlanmadığı için residual olarak raporlanır, FAIL değildir.
    const ciExposedScripts = packageScriptReferences(repoRoot).filter((entry) =>
      /^(test|ci)[:-]/.test(entry.split(':')[0]),
    );
    expect(ciExposedScripts).toEqual([]);
  });

  it('gerçek ihlal içeren dosya harness dizinine konulduğunda FAIL verir', () => {
    const probeRelative = path.join('test', 'e2e', 'zz-guard-negative-probe.e2e-spec.ts');
    const probeAbsolute = path.join(repoRoot, probeRelative);
    const probeSource = [
      '// synthetic guard probe: created and removed by acceptance-evidence.guard.spec.ts',
      "await client.query('INSERT INTO leave_requests (tenant_id) VALUES ($1)');",
      "await page.evaluate(() => fetch('/api/v1/leaves/me'));",
    ].join('\n');

    fs.writeFileSync(probeAbsolute, probeSource, 'utf8');
    try {
      const rules = scanRepository()
        .filter((finding) => finding.file.split('\\').join('/') === 'test/e2e/zz-guard-negative-probe.e2e-spec.ts')
        .map((finding) => finding.rule);
      expect(rules).toContain('job-outcome-write');
      expect(rules).toContain('page-evaluate-network');
    } finally {
      fs.rmSync(probeAbsolute, { force: true });
    }
    expect(fs.existsSync(probeAbsolute)).toBe(false);
  });
});


