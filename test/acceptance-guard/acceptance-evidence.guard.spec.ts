import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  JOB_OUTCOME_TABLES,
  JOURNEY_OUTCOME_TABLES,
  LEGACY_EXCLUSION_MARKER,
  REFERENCE_TABLES,
} from '../e2e/support/acceptance-tables';
import {
  ARTIFACT_MANIFEST_CONTRACT,
  ARTIFACT_MANIFEST_FILE,
  verifyArtifactManifest,
  writeArtifactManifest,
} from '../e2e/support/artifact-manifest';
import {
  F1_JOURNEY_EXECUTORS,
  JOURNEY_STEP_IDS,
  JOURNEY_STEPS,
  assertJourneyContractShape,
} from '../e2e/support/journey-contract';
import { NEGATIVE_SCENARIOS, assertNegativeMatrixShape } from '../e2e/support/negative-matrix';
import {
  runJourneySteps,
  runNegativeMatrix,
  type JourneySurface,
} from '../e2e/support/journey-runner';
import {
  EVIDENCE_VERDICTS,
  NON_PASS_OUTCOME_TOKENS,
  assertPassProvenance,
  classifyNegativeOutcome,
  normalizeVerdict,
  redactEvidenceText,
  summarizeJourney,
} from '../e2e/support/verdict-policy';

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
 *  (R6) Kabul yüzeylerinde `skip`/`todo`/`only` yoktur: atlanan adım PASS değildir.
 *  (R7) Verdict'e PASS olmayan ham etiket (`SKIP`, `NEUTRAL`, `CANCELLED`, …)
 *       atanamaz.
 *  (R8) İşlemsel API isteği Node tarafından doğrudan yapılamaz (UI atlanamaz);
 *       yalnız canlılık yolu izin listesindedir.
 *  (R9) Artefakt manifestosu exact head SHA'ya bağlıdır, redaksiyon bulgusu 0'dır
 *       ve manifesto gerçekten harness + CI akışına bağlıdır.
 *  (R10) `JOB_OUTCOME_TABLES`'ın ikinci bir kopyası (kanonik adla) yaratılamaz.
 *  (R13) Kabul yüzeyleri iş sonucu tablosu adını literal olarak taşıyamaz;
 *        sözleşmeden import etmelidir.
 *  (R14) Kabul yüzeyinde sabit (hardcoded) commit SHA bulunamaz.
 *  (R11) Negatif senaryo sınıflandırması: env unreachable / 404 / skip /
 *        neutral / cancelled PASS'a dönüşemez.
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
  {
    file: path.join('test', 'database', 'attendance-correction-concurrency.spec.ts'),
    reason:
      'Real-PostgreSQL concurrency test (AC-7, #265): it seeds reference fixtures plus a ' +
      'locked attendance session through SQL so that two parallel controlled corrections ' +
      'with the same expectedVersion can be raced and proven to serialize (exactly one wins, ' +
      'the other gets 409) with exactly one durable audit row per successful correction. The ' +
      'seeded rows are scaffolding for the pessimistic-lock race, not acceptance evidence, and ' +
      'this spec is never bound to the P0 acceptance check.',
    mustContain: 'INSERT INTO schedule_versions',
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

/* ------------------------------------------------------------------ */
/* F1 (#269) — yeni fail-closed kurallar                                */
/* ------------------------------------------------------------------ */

/**
 * (R6) Kabul kanıtı yüzeylerinde test atlama / tek test koşma yasağı.
 *
 * `skip`/`todo` ile kırmızıyı gizlemek ve `.only` ile diğer kanıtları
 * düşürmek yasaktır. Kapsam bilinçli olarak yalnız kabul yüzeyleridir
 * (`test/e2e/**`, `test/acceptance-guard/**`); DB entegrasyon suite'lerinde
 * "DATABASE_URL yoksa skip" gibi meşru desenler kapsam dışıdır.
 */
const SKIP_DIRECTIVE =
  /\b(?:it|test|describe|context)\s*\.\s*(?:skip|todo|only)\b|\bx(?:it|test|describe)\s*\(/g;

/**
 * (R7) PASS olmayan ham verdict etiketleri. Bir adım/senaryo verdict'i
 * `SKIP`, `NEUTRAL`, `CANCELLED` vb. olarak ATANAMAZ (fail-closed).
 */
const FORBIDDEN_VERDICT_ASSIGNMENT =
  /\b(?:verdict|outcome|result)\s*(?::\s*[A-Za-z_$][A-Za-z0-9_$<>[\]|.\s]*?)?\s*[:=]\s*['"`](?:skip|skipped|neutral|cancelled|canceled|pending|todo|unknown|not-applicable)['"`]/gi;

/** (R8) Node tarafından doğrudan işlemsel API isteği çağrıları. */
const DIRECT_REQUEST_CALL = /\b(?:fetch|axios\.(?:get|post|put|patch|delete|request)|got|superagent)\s*\(/g;

/**
 * Kabul testinden Node tarafında doğrudan çağrılmasına izin verilen yollar.
 * Her gerekçe zorunludur; bayat/boş gerekçe guard testinde reddedilir.
 */
export const DIRECT_API_CALL_ALLOWLIST: ReadonlyArray<{
  fragment: string;
  reason: string;
}> = Object.freeze([
  {
    fragment: '/api/v1/health',
    reason:
      'Canlılık (liveness) kontrolüdür, işlemsel bir kullanıcı akışı değildir: backend ayakta mı ve ' +
      'DB zorunluluğu bildiriliyor mu sorusunu yanıtlar. İş sonucu bu yolla üretilmez.',
  },
]);

/**
 * (R10) Kanonik kanıt listesinin ADINI taşıyan bağlama izi.
 *
 * Kural, "aynı ifadede ≥2 iş sonucu tablosu geçiyor" gibi bir yanlış-pozitif
 * üreticisi yerine GERÇEK ihlali arar: `JOB_OUTCOME_TABLES`'ın elle tutulan
 * İKİNCİ bir kopyasının (ör. `JOB_OUTCOME_TABLES_FOR_EVIDENCE`,
 * `EVIDENCE_TABLES`) yaratılması.
 *
 * Neden gerekli (F1 kalibrasyonu): adım başına beklenen tablolar ve
 * tenant-scope kayıt defteri testleri ≥2 iş sonucu tablosunu MEŞRU biçimde
 * birlikte anar; bunlar kanıt kanalı değildir. Kanonik listeyi import etmek
 * zorunludur. Kabul yüzeylerinde literal yasağı ayrıca R13 ile (daha güçlü
 * biçimde) uygulanır — bu kural repo genelinde kanonik-ad kopyalarını arar.
 */
const JOB_OUTCOME_LIST_ANCHOR =
  /JOB_OUTCOME[A-Z0-9_]*|EVIDENCE_TABLES|OUTCOME_TABLES/;

/**
 * (R13) Kabul yüzeylerinde iş sonucu tablosu ADI literal olarak geçemez.
 *
 * Kabul kanıtı üreten dosyalar tablo sınıflandırmasını KOPYALAMAZ; tek
 * doğruluk kaynağından (`acceptance-tables`) import etmek zorundadır. Aksi
 * hâlde sözleşme sessizce ayrışır (ör. bir tablo kanonik listeden çıkar ama
 * kanıt dosyası onu saymaya devam eder).
 */
const JOB_OUTCOME_LITERAL = new RegExp(
  `['"\`](?:${JOB_OUTCOME_TABLES.join('|')})['"\`]`,
  'g',
);

/**
 * (R14) Kabul yüzeyinde SABİT (hardcoded) commit SHA bulunamaz.
 *
 * Kanıt koşunun GERÇEK head'ine bağlanmalıdır (`env.headSha`); sabit bir
 * 40 karakterlik SHA yazmak "exact head" iddiasını sahteleştirir ve kanıtı
 * yanlış commit'e bağlar.
 */
const HARDCODED_COMMIT_SHA = /['"`][0-9a-f]{40}['"`]/gi;

/**
 * Tablo sözleşmesinin TANIMLANDIĞI dosya. (R10) drift kuralı burada
 * uygulanmaz; listenin kendisi burada tutulur ve tek doğruluk kaynağıdır.
 */
export const TABLE_CONTRACT_FILES: ReadonlyArray<string> = Object.freeze([
  path.join('test', 'e2e', 'support', 'acceptance-tables.ts'),
]);

/** Bir API yol parçası izin listesinde mi? */
function isAllowedDirectCall(fragment: string): boolean {
  return DIRECT_API_CALL_ALLOWLIST.some((entry) => fragment.startsWith(entry.fragment));
}

/**
 * (R8) `fetch`/`axios` çağrısının argümanlarındaki `/api/v1/<...>` yollarını
 * döner. Yalnız izin listesinde olmayan yollar ihlaldir.
 */
export function collectDirectApiFragments(source: string): Array<{ fragment: string; line: number }> {
  const found: Array<{ fragment: string; line: number }> = [];
  for (const match of source.matchAll(DIRECT_REQUEST_CALL)) {
    const openParen = (match.index ?? 0) + match[0].length - 1;
    const argument = extractCallArguments(source, openParen);
    for (const pathMatch of argument.matchAll(/\/api\/v1\/[A-Za-z0-9\-_/{}[\]$.]*/g)) {
      if (isAllowedDirectCall(pathMatch[0])) continue;
      found.push({ fragment: pathMatch[0], line: lineAt(source, match.index ?? 0) });
    }
  }
  return found;
}

/**
 * (R10) Tek bir ifade içinde ikiden fazla iş sonucu tablosu adı geçiyorsa bu,
 * sözleşmenin kopyalanmış (drift edebilir) bir listesidir.
 */
export function collectJobOutcomeListCopies(source: string): Array<{ line: number; tables: string[] }> {
  const copies: Array<{ line: number; tables: string[] }> = [];
  let offset = 0;
  for (const statement of source.split(';')) {
    // Yalnız kanonik listenin ADINI taşıyan bağlamalar ihlaldir (bkz.
    // JOB_OUTCOME_LIST_ANCHOR): domain kodunun meşru tablo grupları değil,
    // kanıt listesinin ikinci bir kopyası aranır.
    if (!JOB_OUTCOME_LIST_ANCHOR.test(statement)) {
      offset += statement.length + 1;
      continue;
    }
    const tables = JOB_OUTCOME_TABLES.filter((table) =>
      new RegExp(`['"\`]${table}['"\`]`).test(statement),
    );
    if (tables.length >= 2) {
      copies.push({ line: lineAt(source, offset), tables });
    }
    offset += statement.length + 1;
  }
  return copies;
}

/** (R6) Kabul yüzeyi mi? */
function isAcceptanceSurface(file: string): boolean {
  const normalizedFile = normalized(file);
  return (
    normalizedFile.startsWith('test/e2e/') ||
    normalizedFile.startsWith(normalized(SELF_DIRECTORY))
  );
}

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

  // (R6) Kabul yüzeylerinde skip/todo/only yasaktır: kırmızıyı gizlemek ya da
  // diğer kanıtları düşürmek fail-open davranıştır.
  if (isAcceptanceSurface(file)) {
    for (const match of source.matchAll(SKIP_DIRECTIVE)) {
      findings.push({
        rule: 'acceptance-skip-directive',
        file,
        line: lineAt(source, match.index ?? 0),
        detail:
          'Acceptance evidence surfaces must not skip/todo/only: a skipped step is not a PASS.',
      });
    }
  }

  // (R7) Ham verdict etiketi ataması yasaktır.
  for (const match of source.matchAll(FORBIDDEN_VERDICT_ASSIGNMENT)) {
    findings.push({
      rule: 'forbidden-verdict-literal',
      file,
      line: lineAt(source, match.index ?? 0),
      detail:
        'Verdict/outcome may not be assigned a non-evidence token (SKIP/NEUTRAL/CANCELLED/PENDING/UNKNOWN); it would silence a missing result.',
    });
  }

  // (R8) İşlemsel API isteği Node tarafından doğrudan yapılamaz.
  if (isAcceptanceSurface(file)) {
    for (const entry of collectDirectApiFragments(source)) {
      findings.push({
        rule: 'direct-business-api-call',
        file,
        line: entry.line,
        detail: `Operational request to '${entry.fragment}' must go through the visible UI (browser), not a Node-side call.`,
      });
    }
  }

  // (R10) İş sonucu tablo listesi kopyalanamaz; sözleşmeden import edilir.
  const isContractFile = TABLE_CONTRACT_FILES.some(
    (candidate) => normalized(candidate) === file,
  );
  if (!isContractFile) {
    for (const copy of collectJobOutcomeListCopies(source)) {
      findings.push({
        rule: 'job-outcome-list-drift',
        file,
        line: copy.line,
        detail: `Job outcome table list is duplicated here (${copy.tables.join(', ')}); import JOB_OUTCOME_TABLES instead of copying it.`,
      });
    }
  }

  // (R13) Kabul yüzeylerinde iş sonucu tablosu literal yasağı (import zorunlu).
  if (isAcceptanceSurface(file) && !isContractFile) {
    for (const match of source.matchAll(JOB_OUTCOME_LITERAL)) {
      findings.push({
        rule: 'job-outcome-table-literal',
        file,
        line: lineAt(source, match.index ?? 0),
        detail: `Job-outcome table name ${match[0]} must come from the shared contract, not be hardcoded in an acceptance surface.`,
      });
    }

    // (R14) Sabit commit SHA: kanıt gerçek head'e bağlanmalıdır.
    for (const match of source.matchAll(HARDCODED_COMMIT_SHA)) {
      findings.push({
        rule: 'hardcoded-acceptance-sha',
        file,
        line: lineAt(source, match.index ?? 0),
        detail: `Hardcoded commit SHA ${match[0]} would bind evidence to a fabricated head; use env.headSha.`,
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
    // `audit_logs` ne referans ne iş sonucu tablosudur: harness onu SQL ile
    // yazarsa denetim kanıtı imal edilmiş olur (fail-closed ihlal).
    const notReference = "await client.query('INSERT INTO audit_logs (tenant_id) VALUES ($1)');";
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

  it('R6 — kabul yüzeyinde skip/todo/only ihlaldir', () => {
    for (const source of [
      "it.skip('kanıt', () => {});",
      "describe.skip('kanıt', () => {});",
      "xit('kanıt', () => {});",
      "it.todo('kanıt');",
      "it.only('kanıt', () => {});",
    ]) {
      expect(
        findingsFor('acceptance-skip-directive', 'test/e2e/negative.e2e-spec.ts', source).length,
      ).toBeGreaterThanOrEqual(1);
    }

    // Kapsam kabul yüzeyleridir: DB suite'lerindeki meşru "env yoksa skip"
    // deseni ihlal sayılmaz.
    expect(
      findingsFor(
        'acceptance-skip-directive',
        'test/database/leave-safety-queries.spec.ts',
        "it.skip('db only', () => {});",
      ),
    ).toEqual([]);
  });

  it('R7 — PASS olmayan verdict etiketi atanamaz', () => {
    for (const source of [
      "const verdict: string = 'SKIP';",
      "const outcome = 'neutral';",
      "return { result: 'cancelled' };",
    ]) {
      expect(
        findingsFor('forbidden-verdict-literal', 'test/e2e/negative.e2e-spec.ts', source).length,
      ).toBeGreaterThanOrEqual(1);
    }

    // Kanıt taşıyan verdict'ler serbesttir.
    expect(
      scanSource(
        'test/e2e/negative.e2e-spec.ts',
        "const verdict = 'NOT_IMPLEMENTED'; const other = 'PASS';",
      ),
    ).toEqual([]);
  });

  it('R8 — işlemsel API isteği Node tarafından doğrudan yapılamaz', () => {
    const businessCall =
      "const r = await fetch(`${environment.baseUrl}/api/v1/leaves/me`, { method: 'POST' });";
    expect(
      findingsFor('direct-business-api-call', 'test/e2e/negative.e2e-spec.ts', businessCall).length,
    ).toBeGreaterThanOrEqual(1);

    // Canlılık kontrolü izin listesindedir (iş sonucu üretmez).
    expect(
      scanSource(
        'test/e2e/negative.e2e-spec.ts',
        "const r = await fetch(`${environment.baseUrl}/api/v1/health`);",
      ),
    ).toEqual([]);

    // İzin listesindeki her gerekçe anlamlı ve boş değildir.
    expect(DIRECT_API_CALL_ALLOWLIST.length).toBeGreaterThan(0);
    for (const entry of DIRECT_API_CALL_ALLOWLIST) {
      expect(entry.fragment.startsWith('/api/v1/')).toBe(true);
      expect(entry.reason.length).toBeGreaterThan(40);
    }
  });

  it('R10 — iş sonucu tablo listesi kopyalanamaz', () => {
    const drifted = [
      'const JOB_OUTCOME_TABLES_FOR_EVIDENCE = [',
      "  'leave_requests',",
      "  'attendance_records',",
      "  'notification_logs',",
      '];',
    ].join('\n');
    expect(
      findingsFor('job-outcome-list-drift', 'test/e2e/negative.e2e-spec.ts', drifted).length,
    ).toBeGreaterThanOrEqual(1);

    // Kanonik adı taşımayan tablo grubu ihlal DEĞİLDİR: domain kodu (ör. adım
    // başına beklenen tablolar) kanıt kanalı değildir. Bu ayrım, kanıt
    // listesinin gerçek kopyasını hedefler.
    expect(
      findingsFor(
        'job-outcome-list-drift',
        'test/database/domain-grouping.spec.ts',
        "const stepTables = ['leave_requests', 'attendance_records'];",
      ),
    ).toEqual([]);

    // Sözleşme dosyasının kendisi (tek doğruluk kaynağı) istisnadır.
    expect(
      findingsFor(
        'job-outcome-list-drift',
        'test/e2e/support/acceptance-tables.ts',
        drifted,
      ),
    ).toEqual([]);

    // Sözleşmeden gelen tek tablo adı kullanımı drift değildir (kapsam dışı
    // yüzeyde literal yasağı da uygulanmaz: R13 yalnız kabul yüzeyleridir).
    expect(
      scanSource(
        'test/database/domain-grouping.spec.ts',
        "const table = JOB_OUTCOME_TABLES.find((t) => t === 'leave_requests');",
      ),
    ).toEqual([]);
  });

  it('R13 — kabul yüzeyinde iş sonucu tablosu adı literal olamaz (import zorunlu)', () => {
    for (const table of JOB_OUTCOME_TABLES) {
      expect(
        findingsFor(
          'job-outcome-table-literal',
          'test/e2e/negative.e2e-spec.ts',
          `const t = '${table}';`,
        ).length,
      ).toBeGreaterThanOrEqual(1);
    }

    // Doğru yol: sözleşmeden import edilir → ihlal yok.
    expect(
      scanSource('test/e2e/negative.e2e-spec.ts', 'const tables = JOB_OUTCOME_TABLES;'),
    ).toEqual([]);

    // Sözleşme dosyası ve kabul dışı yüzeyler istisnadır.
    expect(
      findingsFor('job-outcome-table-literal', 'test/e2e/support/acceptance-tables.ts', "'schedules',"),
    ).toEqual([]);
    expect(
      findingsFor('job-outcome-table-literal', 'test/database/domain-grouping.spec.ts', "'schedules',"),
    ).toEqual([]);
  });

  it('R14 — kabul yüzeyinde sabit commit SHA bulunamaz', () => {
    const literalSha = '0123456789abcdef0123456789abcdef01234567';
    expect(
      findingsFor(
        'hardcoded-acceptance-sha',
        'test/e2e/negative.e2e-spec.ts',
        `const headSha = '${literalSha}';`,
      ).length,
    ).toBeGreaterThanOrEqual(1);

    // Gerçek yol: head çalışma zamanında env'den okunur.
    expect(
      scanSource('test/e2e/negative.e2e-spec.ts', 'const headSha = environment.headSha;'),
    ).toEqual([]);

    // Kabul dışı yüzeyler (ör. UA/observation spec'lerindeki sentetik SHA
    // girdileri) bu kuralın kapsamı dışındadır.
    expect(
      findingsFor(
        'hardcoded-acceptance-sha',
        'test/runtime-integration/production-observation.spec.ts',
        `const staleSha = '${literalSha}';`,
      ),
    ).toEqual([]);
  });

  it('R9 — artefakt manifestosu exact head SHA ya bağlanır ve kurcalanınca FAIL verir', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a4f1-manifest-'));
    const headSha = 'a'.repeat(40);
    const otherHeadSha = 'b'.repeat(40);
    try {
      fs.writeFileSync(path.join(root, 'report.json'), '{"verdict":"NOT_IMPLEMENTED"}\n', 'utf8');
      const manifest = writeArtifactManifest({
        root,
        slice: 'A4-F1',
        headSha,
        roles: { report: { status: 'present', files: ['report.json'] } },
        dbAudit: { jobOutcomeRowsCreated: 0, perTable: {} },
      });

      expect(manifest.contract).toBe(ARTIFACT_MANIFEST_CONTRACT);
      expect(manifest.redaction.findingCount).toBe(0);
      expect(verifyArtifactManifest(root, { expectedHeadSha: headSha })).toEqual([]);

      // Başka head → ihlal (kanıt yanlış commit'e bağlanamaz).
      expect(verifyArtifactManifest(root, { expectedHeadSha: otherHeadSha }).length).toBeGreaterThan(0);

      // Kapsam dışı (manifestoda olmayan) dosya → ihlal.
      fs.writeFileSync(path.join(root, 'sneaky.log'), 'gizli artefakt\n', 'utf8');
      const uncovered = verifyArtifactManifest(root, { expectedHeadSha: headSha });
      expect(uncovered.join(' | ')).toContain('not covered by the manifest');
      fs.rmSync(path.join(root, 'sneaky.log'));

      // Listelenen dosya kaybolursa → ihlal.
      fs.rmSync(path.join(root, 'report.json'));
      expect(
        verifyArtifactManifest(root, { expectedHeadSha: headSha }).join(' | '),
      ).toContain('is missing');

      // PII bulgusu → ihlal (bulgu=0 sözleşmesi).
      fs.writeFileSync(path.join(root, 'report.json'), '{"guardianPhone":"0555 123 45 67"}\n', 'utf8');
      const leaked = writeArtifactManifest({
        root,
        slice: 'A4-F1',
        headSha,
        roles: { report: { status: 'present', files: ['report.json'] } },
        dbAudit: { jobOutcomeRowsCreated: 0, perTable: {} },
      });
      expect(leaked.redaction.findingCount).toBeGreaterThan(0);
      expect(
        verifyArtifactManifest(root, { expectedHeadSha: headSha }).join(' | '),
      ).toContain('Redaction scan reported');

      // headSha exact 40 karakterlik commit değilse → ihlal ("unknown" kabul edilmez).
      fs.writeFileSync(
        path.join(root, ARTIFACT_MANIFEST_FILE),
        JSON.stringify({ ...leaked, headSha: 'unknown', redaction: leaked.redaction }),
        'utf8',
      );
      expect(
        verifyArtifactManifest(root, { expectedHeadSha: headSha }).join(' | '),
      ).toContain('40-char commit SHA');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('R9 — manifestolar harness ve CI akışına gerçekten bağlı (sessiz kopma yok)', () => {
    for (const spec of [
      path.join('test', 'e2e', 'runtime-shell-auth.e2e-spec.ts'),
      path.join('test', 'e2e', 'journey-skeleton.e2e-spec.ts'),
    ]) {
      const source = fs.readFileSync(path.join(repoRoot, spec), 'utf8');
      expect(source).toContain('writeArtifactManifest');
      expect(source).toContain('verifyArtifactManifest');
      expect(source).toContain('expectedHeadSha');
    }

    const workflow = fs.readFileSync(
      path.join(repoRoot, '.github', 'workflows', 'wp07f-p0-browser-e2e.yml'),
      'utf8',
    );
    expect(workflow).toContain(ARTIFACT_MANIFEST_FILE);
    expect(workflow).toContain('PULL_REQUEST_HEAD_SHA');
    expect(workflow).toContain('npm run test:e2e:guard');
    expect(workflow).toContain('npm run test:e2e');
  });

  it('F1 — journey sözleşmesi R10 adımlarıyla birebir ve executor kaydı boş', () => {
    assertJourneyContractShape();
    expect(JOURNEY_STEPS.map((step) => step.id)).toEqual([...JOURNEY_STEP_IDS]);
    expect(JOURNEY_STEPS.map((step) => step.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(Object.keys(F1_JOURNEY_EXECUTORS)).toEqual([]);
    for (const step of JOURNEY_STEPS) {
      expect(step.pendingSlices.length).toBeGreaterThan(0);
      expect(step.uiSurface.selectors.length).toBeGreaterThan(0);
      for (const table of step.outcomeTables) {
        expect(JOB_OUTCOME_TABLES).toContain(table);
      }
      // Adım→tablo eşlemesi kanonik haritadan TÜRETİLİR (aynı referans).
      expect(JOURNEY_OUTCOME_TABLES[step.id]).toBe(step.outcomeTables);
    }

    // Adım kimlikleri ile tablo haritası birebir eşleşir (eksik/fazla giriş yok).
    expect(Object.keys(JOURNEY_OUTCOME_TABLES).sort()).toEqual([...JOURNEY_STEP_IDS].sort());

    // Journey sözleşmesi kendi tablo listesini taşımaz: kanonik haritayı import eder.
    const contractSource = fs.readFileSync(
      path.join(repoRoot, 'test', 'e2e', 'support', 'journey-contract.ts'),
      'utf8',
    );
    expect(contractSource).toContain('JOURNEY_OUTCOME_TABLES');
    expect(contractSource).not.toContain('outcomeTables: [');
  });

  it('F1 — PASS uydurulamaz: kanıtsız PASS FAIL e düşer, hata redakte edilir', async () => {
    const stubSurface = {
      session: {},
      fixture: {},
      environment: {},
      screenshots: [],
      artifactDir: '',
    } as unknown as JourneySurface;

    const entries = await runJourneySteps(stubSurface, {
      'schedule-publish': () => ({
        verdict: 'PASS',
        evidence: ['published schedule version 1'],
        detail: 'yayınlandı',
      }),
      'leave-request': () => ({ verdict: 'PASS', evidence: [], detail: 'kanıtsız PASS' }),
      'manager-approval': () => {
        throw new Error('boom postgres://user:pw@localhost:5432/db');
      },
    });

    const byId = Object.fromEntries(entries.map((entry) => [entry.stepId, entry]));
    expect(byId['schedule-publish'].verdict).toBe('PASS');
    expect(byId['schedule-publish'].executedBy).toBe('journey:schedule-publish');
    expect(byId['schedule-publish'].evidence.length).toBeGreaterThan(0);

    expect(byId['leave-request'].verdict).toBe('FAIL');
    expect(byId['leave-request'].evidence.join(' ')).toContain('policy-violation:');

    expect(byId['manager-approval'].verdict).toBe('FAIL');
    expect(byId['manager-approval'].detail).not.toContain('pw@localhost');

    // Executor'ı olmayan adımlar dürüstçe NOT_IMPLEMENTED kalır (SKIP değil).
    expect(byId['attendance-lock'].verdict).toBe('NOT_IMPLEMENTED');
    expect(byId['notification-draft'].executedBy).toBeNull();

    const summary = summarizeJourney(entries);
    expect(summary.verdict).toBe('FAIL');
    expect(summary.allPass).toBe(false);
    expect(summary.unresolvedStepIds.length).toBe(6);

    // Sahte PASS doğrudan da reddedilir.
    expect(() =>
      assertPassProvenance({
        stepId: 'x',
        verdict: 'PASS',
        executedBy: null,
        evidence: ['kanıt'],
        detail: 'gerekçe',
      }),
    ).toThrow(/fabricated PASS/);
    expect(() =>
      assertPassProvenance({
        stepId: 'x',
        verdict: 'PASS',
        executedBy: 'journey:x',
        evidence: ['   '],
        detail: 'gerekçe',
      }),
    ).toThrow(/no evidence lines/);
  });

  it('R11 — env unreachable / 404 / skip / neutral / cancelled PASS değildir', () => {
    const expectation = {
      statuses: [403],
      acceptsNotFoundAsDenial: true,
      bodyMustNotContain: ['QueryFailedError'],
    };
    const observed = (override: Record<string, unknown> = {}) => ({
      transport: 'response' as const,
      status: 403,
      bodyText: 'Yetkiniz yok',
      routeMissingSignature: false,
      outcomeKind: 'observed' as const,
      ...override,
    });

    expect(classifyNegativeOutcome(expectation, observed()).verdict).toBe('PASS');
    expect(
      classifyNegativeOutcome(expectation, observed({ transport: 'unreachable', status: 0 }))
        .verdict,
    ).toBe('FAIL');
    expect(
      classifyNegativeOutcome(expectation, observed({ transport: 'timeout', status: 0 })).verdict,
    ).toBe('FAIL');
    for (const kind of ['skip', 'neutral', 'cancelled'] as const) {
      expect(classifyNegativeOutcome(expectation, observed({ outcomeKind: kind })).verdict).toBe(
        'FAIL',
      );
    }
    expect(
      classifyNegativeOutcome(expectation, observed({ routeMissingSignature: true })).verdict,
    ).toBe('FAIL');
    expect(classifyNegativeOutcome(expectation, observed({ status: 500 })).verdict).toBe('FAIL');
    expect(
      classifyNegativeOutcome(expectation, observed({ bodyText: 'QueryFailedError: detay' })).verdict,
    ).toBe('FAIL');

    // 404 meşru bir red sayılamaz: "rota yok" görünümlü yanıt PASS olamaz.
    expect(
      classifyNegativeOutcome(
        { statuses: [404], acceptsNotFoundAsDenial: false, bodyMustNotContain: [] },
        observed({ status: 404 }),
      ).verdict,
    ).toBe('FAIL');

    // Yasak token'lar hiçbir zaman PASS'a normalize olmaz.
    for (const token of NON_PASS_OUTCOME_TOKENS) {
      expect(normalizeVerdict(token)).not.toBe('PASS');
      expect(EVIDENCE_VERDICTS).not.toContain(token);
    }
    expect(normalizeVerdict('SKIP')).toBe('NOT_IMPLEMENTED');
    expect(normalizeVerdict('NEUTRAL')).toBe('NOT_IMPLEMENTED');
    expect(normalizeVerdict('CANCELLED')).toBe('NOT_IMPLEMENTED');
    expect(normalizeVerdict('UNKNOWN')).toBe('BLOCKED');
    expect(normalizeVerdict(null)).toBe('BLOCKED');
  });

  it('R11 — negatif matris çalıştırma iskeleti sessizce yeşile dönmez', async () => {
    assertNegativeMatrixShape();
    const categories = new Set(NEGATIVE_SCENARIOS.map((scenario) => scenario.category));
    for (const required of [
      'unauthorized',
      'forbidden',
      'cross-tenant',
      'stale',
      'session-expiry',
      'expired',
      'offline',
      'invalid-input',
    ]) {
      expect(categories.has(required as never)).toBe(true);
    }

    const stubSurface = {
      session: {},
      fixture: {},
      environment: {},
      screenshots: [],
      artifactDir: '',
    } as unknown as JourneySurface;

    const empty = await runNegativeMatrix(stubSurface, {});
    expect(empty.map((entry) => entry.stepId)).toEqual(
      NEGATIVE_SCENARIOS.map((scenario) => scenario.id),
    );
    for (const entry of empty) {
      expect(entry.verdict).toBe('NOT_IMPLEMENTED');
      expect(entry.executedBy).toBeNull();
      expect(entry.detail.length).toBeGreaterThan(10);
    }
    expect(summarizeJourney(empty).verdict).toBe('NOT_IMPLEMENTED');
    expect(summarizeJourney(empty).allPass).toBe(false);

    // Executor eklenirse kayıt üretir; uymayan gözlem FAIL olur.
    const withExecutors = await runNegativeMatrix(stubSurface, {
      'cross-tenant-branch': async () => ({
        observation: {
          transport: 'response' as const,
          status: 404,
          bodyText: 'Bulunamadı',
          routeMissingSignature: false,
          outcomeKind: 'observed' as const,
        },
        evidence: ['ui: başka kurumun varlığı gösterilmedi'],
      }),
      'offline-request': async () => ({
        observation: {
          transport: 'unreachable' as const,
          status: 0,
          bodyText: '',
          routeMissingSignature: false,
          outcomeKind: 'observed' as const,
        },
        evidence: ['ui: ağ hatası gösterildi'],
      }),
    });
    const byId = Object.fromEntries(withExecutors.map((entry) => [entry.stepId, entry]));
    expect(byId['cross-tenant-branch'].verdict).toBe('PASS');
    expect(byId['cross-tenant-branch'].evidence.join(' ')).toContain('classification:PASS');
    expect(byId['offline-request'].verdict).toBe('FAIL');
    expect(summarizeJourney(withExecutors).verdict).toBe('FAIL');
  });

  it('workflow yasak verdict token listesi sözleşmeyle aynı (drift yok)', () => {
    const workflow = fs.readFileSync(
      path.join(repoRoot, '.github', 'workflows', 'wp07f-p0-browser-e2e.yml'),
      'utf8',
    );
    const match = workflow.match(/const forbiddenVerdictTokens = \[([^\]]*)\]/);
    expect(match).not.toBeNull();
    const tokens = [...(match as RegExpMatchArray)[1].matchAll(/'([^']+)'/g)].map(
      (entry) => entry[1],
    );
    expect(tokens).toEqual([...NON_PASS_OUTCOME_TOKENS]);
  });

  it('redaksiyon yardımcıları secret/PII biçimlerini temizler', () => {
    const clean = redactEvidenceText(
      'postgres://user:pw@localhost:5432/db eyJhbGciOi.eyJzdWIi.sig veli@ornek.com password=hunter2',
    );
    expect(clean).not.toContain('pw@localhost');
    expect(clean).not.toContain('veli@ornek.com');
    expect(clean).not.toContain('hunter2');
    expect(redactEvidenceText('a'.repeat(2000)).length).toBeLessThanOrEqual(600);
  });
});



