/**
 * OKUL-10 — Migration idempotency (yeniden çalıştırılabilirlik) denetleyicisi
 *
 * AMAÇ
 * -----
 * `src/database/migrations/*.ts` altındaki TypeORM migration dosyalarını statik olarak
 * tarar ve DDL ifadelerinin idempotent (aynı migration ikinci kez çalıştığında hata
 * vermeyen) desenleri kullandığını doğrular.
 *
 * NEDEN GEREKLİ
 * -------------
 * CI/CD ve staging ortamlarında migration'lar kısmi başarısızlık sonrası yeniden
 * denenebiliyor. `CREATE TABLE "x"` gibi çıplak bir ifade ikinci denemede
 * "relation already exists" hatası verir ve deploy fail-closed olarak kilitlenir.
 * `IF NOT EXISTS` / `IF EXISTS` koruması bu senaryoyu güvenli hale getirir.
 *
 * DENETLENEN KURALLAR
 * -------------------
 *  1. CREATE TABLE      -> `IF NOT EXISTS` zorunlu
 *  2. CREATE INDEX      -> `IF NOT EXISTS` zorunlu (UNIQUE INDEX dahil)
 *  3. CREATE TYPE       -> koşullu blok (DO $$ ... EXCEPTION) veya IF NOT EXISTS zorunlu
 *  4. DROP TABLE/INDEX  -> `IF EXISTS` zorunlu (down() geri alma güvenliği)
 *  5. CREATE EXTENSION  -> `IF NOT EXISTS` zorunlu
 *
 * KULLANIM
 * --------
 *   npm run check:migrations
 *   npx ts-node scripts/check-migrations-idempotent.ts
 *
 * ÇIKIŞ KODU
 * ----------
 *   0 -> tüm migration'lar idempotent
 *   1 -> en az bir ihlal bulundu (ihlaller stderr'e raporlanır)
 *
 * KVKK NOTU: Bu script yalnızca kaynak kod dosyalarını okur; veritabanına
 * bağlanmaz, kişisel veri (PII) işlemez ve hiçbir veri dışa aktarmaz.
 */

import * as fs from 'fs';
import * as path from 'path';

/** Migration dosyalarının bulunduğu dizin (repo köküne göre) */
const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'src', 'database', 'migrations');

/** Tek bir idempotency kuralının tanımı */
interface IdempotencyRule {
  /** Kural adı — rapor çıktısında görünür */
  readonly name: string;
  /** İhlal arayan desen (bu eşleşirse satır şüphelidir) */
  readonly violation: RegExp;
  /** Bu desen de eşleşiyorsa satır güvenlidir (muafiyet) */
  readonly safe: RegExp;
  /** Geliştiriciye gösterilecek düzeltme önerisi */
  readonly hint: string;
}

/**
 * Kural kümesi.
 * Desenler `i` (büyük/küçük harf duyarsız) bayrağı ile tanımlanır; SQL anahtar
 * kelimeleri arasında serbest boşluk/satır sonu olabileceği için `\s+` kullanılır.
 */
const RULES: readonly IdempotencyRule[] = [
  {
    name: 'CREATE TABLE',
    violation: /\bCREATE\s+TABLE\b/i,
    safe: /\bCREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\b/i,
    hint: 'CREATE TABLE IF NOT EXISTS kullanın.',
  },
  {
    name: 'CREATE INDEX',
    violation: /\bCREATE\s+(?:UNIQUE\s+)?INDEX\b/i,
    safe: /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS\b/i,
    hint: 'CREATE [UNIQUE] INDEX IF NOT EXISTS kullanın.',
  },
  {
    name: 'CREATE EXTENSION',
    violation: /\bCREATE\s+EXTENSION\b/i,
    safe: /\bCREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\b/i,
    hint: 'CREATE EXTENSION IF NOT EXISTS kullanın.',
  },
  {
    name: 'DROP TABLE',
    violation: /\bDROP\s+TABLE\b/i,
    safe: /\bDROP\s+TABLE\s+IF\s+EXISTS\b/i,
    hint: 'DROP TABLE IF EXISTS kullanın (down() geri alma güvenliği).',
  },
  {
    name: 'DROP INDEX',
    violation: /\bDROP\s+INDEX\b/i,
    safe: /\bDROP\s+INDEX\s+IF\s+EXISTS\b/i,
    hint: 'DROP INDEX IF EXISTS kullanın (down() geri alma güvenliği).',
  },
];

/** Tespit edilen tek bir ihlal kaydı */
interface Violation {
  readonly file: string;
  readonly line: number;
  readonly rule: string;
  readonly hint: string;
  readonly snippet: string;
}

/**
 * `CREATE TYPE` ifadeleri PostgreSQL'de `IF NOT EXISTS` desteklemez; idiyomatik
 * çözüm `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;`
 * bloğudur. Bu yüzden dosya genelinde koşullu blok varlığı aranır.
 */
function hasConditionalTypeGuard(content: string): boolean {
  return /duplicate_object|IF\s+NOT\s+EXISTS\s*\(\s*SELECT[\s\S]*pg_type|to_regtype/i.test(content);
}

/**
 * Bir satırın SQL değil, yorum satırı olup olmadığını belirler.
 * Yorum içindeki örnek SQL'ler yanlış pozitif üretmemelidir.
 */
function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

/** Tek bir migration dosyasını denetler ve bulunan ihlalleri döndürür */
function auditFile(filePath: string): Violation[] {
  const content = fs.readFileSync(filePath, 'utf8');
  const fileName = path.basename(filePath);
  const lines = content.split(/\r?\n/);
  const found: Violation[] = [];

  // CREATE TYPE denetimi dosya seviyesindedir (koşullu blok başka satırda olabilir)
  if (/\bCREATE\s+TYPE\b/i.test(content) && !hasConditionalTypeGuard(content)) {
    const idx = lines.findIndex((l) => /\bCREATE\s+TYPE\b/i.test(l) && !isCommentLine(l));
    found.push({
      file: fileName,
      line: idx >= 0 ? idx + 1 : 0,
      rule: 'CREATE TYPE',
      hint: 'CREATE TYPE için DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL; END $$; bloğu kullanın.',
      snippet: idx >= 0 ? lines[idx].trim() : '(dosya genelinde)',
    });
  }

  lines.forEach((line, i) => {
    if (isCommentLine(line)) {
      return;
    }
    for (const rule of RULES) {
      if (rule.violation.test(line) && !rule.safe.test(line)) {
        found.push({
          file: fileName,
          line: i + 1,
          rule: rule.name,
          hint: rule.hint,
          snippet: line.trim().slice(0, 160),
        });
      }
    }
  });

  return found;
}

/**
 * Tüm migration dosyalarını denetler.
 * Test edilebilirlik için dışa aktarılır (bkz. test/database/migration-idempotency.spec.ts).
 */
export function auditMigrations(dir: string = MIGRATIONS_DIR): {
  files: string[];
  violations: Violation[];
} {
  if (!fs.existsSync(dir)) {
    throw new Error(`Migration dizini bulunamadı: ${dir}`);
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
    .sort();

  const violations = files.flatMap((f) => auditFile(path.join(dir, f)));
  return { files, violations };
}

/** CLI giriş noktası — sonuçları konsola raporlar ve çıkış kodunu belirler */
function main(): void {
  const { files, violations } = auditMigrations();

  console.log('OKUL-10 Migration Idempotency Denetimi');
  console.log('======================================');
  console.log(`Taranan migration dosyası: ${files.length}`);
  console.log(`Uygulanan kural sayısı  : ${RULES.length + 1}`);
  console.log('');

  if (violations.length === 0) {
    console.log('✔ Tüm migration dosyaları idempotent desenleri kullanıyor.');
    process.exit(0);
  }

  console.error(`✘ ${violations.length} idempotency ihlali bulundu:\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.rule}]`);
    console.error(`    Kod    : ${v.snippet}`);
    console.error(`    Öneri  : ${v.hint}`);
    console.error('');
  }
  process.exit(1);
}

// Script doğrudan çalıştırıldığında main() tetiklenir; import edildiğinde tetiklenmez.
if (require.main === module) {
  main();
}
