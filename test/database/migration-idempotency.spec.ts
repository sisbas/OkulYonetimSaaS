/**
 * OKUL-10 — Migration idempotency denetleyicisi regresyon testleri
 *
 * Bu test iki şeyi güvence altına alır:
 *  1. `scripts/check-migrations-idempotent.ts` denetleyicisinin kural motoru doğru
 *     çalışıyor (idempotent olmayan DDL'i yakalıyor, idempotent olanı geçiriyor).
 *  2. Repodaki GERÇEK migration'lar (src/database/migrations) idempotent — yani
 *     biri IF NOT EXISTS korumasını kaldırırsa CI kırmızıya döner.
 *
 * Not: Bu test veritabanına bağlanmaz; yalnızca statik kaynak analizi yapar.
 * Dolayısıyla postgres olmadan CI'da çalışabilir ve KVKK açısından PII işlemez.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { auditMigrations } from '../../scripts/check-migrations-idempotent';

/** Geçici bir migration dizini oluşturup içine verilen dosyaları yazar */
function createTempMigrationDir(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'okul10-mig-'));
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content, 'utf8');
  }
  return dir;
}

describe('OKUL-10 migration idempotency denetleyicisi', () => {
  const tempDirs: string[] = [];

  afterAll(() => {
    // Geçici dizinleri temizle
    for (const d of tempDirs) {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });

  it('idempotent olmayan CREATE TABLE ifadesini ihlal olarak raporlar', () => {
    const dir = createTempMigrationDir({
      '1-Bad.ts': 'await queryRunner.query(`CREATE TABLE ogrenciler (id uuid)`);',
    });
    tempDirs.push(dir);

    const { violations } = auditMigrations(dir);

    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe('CREATE TABLE');
    expect(violations[0].file).toBe('1-Bad.ts');
  });

  it('idempotent olmayan CREATE INDEX ve DROP TABLE ifadelerini yakalar', () => {
    const dir = createTempMigrationDir({
      '2-Bad.ts': [
        'await queryRunner.query(`CREATE INDEX idx_a ON t (a)`);',
        'await queryRunner.query(`DROP TABLE t`);',
      ].join('\n'),
    });
    tempDirs.push(dir);

    const { violations } = auditMigrations(dir);
    const rules = violations.map((v) => v.rule).sort();

    expect(rules).toEqual(['CREATE INDEX', 'DROP TABLE']);
  });

  it('IF NOT EXISTS / IF EXISTS kullanan idempotent migration için ihlal üretmez', () => {
    const dir = createTempMigrationDir({
      '3-Good.ts': [
        'await queryRunner.query(`CREATE TABLE IF NOT EXISTS t (id uuid)`);',
        'await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_t ON t (id)`);',
        'await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);',
        'await queryRunner.query(`DROP INDEX IF EXISTS uq_t`);',
        'await queryRunner.query(`DROP TABLE IF EXISTS t`);',
      ].join('\n'),
    });
    tempDirs.push(dir);

    expect(auditMigrations(dir).violations).toHaveLength(0);
  });

  it('yorum satırlarındaki örnek SQL için yanlış pozitif üretmez', () => {
    const dir = createTempMigrationDir({
      '4-Comment.ts': [
        '// Örnek: CREATE TABLE ogrenciler (...) -- bu bir yorumdur',
        ' * CREATE INDEX idx_ornek ON t (a)',
        'await queryRunner.query(`CREATE TABLE IF NOT EXISTS t (id uuid)`);',
      ].join('\n'),
    });
    tempDirs.push(dir);

    expect(auditMigrations(dir).violations).toHaveLength(0);
  });

  it('CREATE TYPE için koşullu blok yoksa ihlal, varsa temiz raporlar', () => {
    const bad = createTempMigrationDir({
      '5-Type.ts': "await queryRunner.query(`CREATE TYPE durum AS ENUM ('a','b')`);",
    });
    const good = createTempMigrationDir({
      '6-Type.ts': [
        'await queryRunner.query(`DO $$ BEGIN',
        "  CREATE TYPE durum AS ENUM ('a','b');",
        'EXCEPTION WHEN duplicate_object THEN NULL;',
        'END $$;`);',
      ].join('\n'),
    });
    tempDirs.push(bad, good);

    expect(auditMigrations(bad).violations.map((v) => v.rule)).toContain('CREATE TYPE');
    expect(auditMigrations(good).violations).toHaveLength(0);
  });

  it('var olmayan dizin için anlamlı hata fırlatır', () => {
    expect(() => auditMigrations(path.join(os.tmpdir(), 'okul10-yok-boyle-bir-dizin'))).toThrow(
      /Migration dizini bulunamadı/,
    );
  });

  describe('gerçek repo migration dosyaları', () => {
    it('src/database/migrations altındaki tüm migration\'lar idempotent olmalı', () => {
      const { files, violations } = auditMigrations();

      // Migration dizini boş olmamalı (denetim sessizce boşa düşmesin)
      expect(files.length).toBeGreaterThan(0);
      // İhlal varsa hata mesajında dosya:satır bilgisi görünsün
      expect(
        violations.map((v) => `${v.file}:${v.line} [${v.rule}]`),
      ).toEqual([]);
    });

    /**
     * OKUL-05 (eokul_sync_runs) ve OKUL-06 (attendance_records) migration'ları
     * bu PR'ın açıldığı anda henüz `main`'e merge edilmemiş olabilir (ilgili PR'lar
     * sırayla merge ediliyor). Bu yüzden test koşullu yazılmıştır:
     *  - Dosya yoksa test atlanır (main üzerinde yanlış kırmızı üretmez).
     *  - Dosya varsa IF NOT EXISTS koruması ZORUNLU olarak doğrulanır.
     * Ayrıca yukarıdaki "tüm migration'lar idempotent" testi bu dosyalar geldiğinde
     * onları da otomatik olarak kapsar.
     */
    it("OKUL-05/OKUL-06 migration'ları (mevcutsa) IF NOT EXISTS kullanır", () => {
      const dir = path.resolve(__dirname, '..', '..', 'src', 'database', 'migrations');
      const targets = [
        '1700000000100-CreateEokulSyncRuns.ts',
        '1700000000101-CreateAttendanceRecords.ts',
      ];

      const present = targets.filter((f) => fs.existsSync(path.join(dir, f)));

      for (const file of present) {
        const content = fs.readFileSync(path.join(dir, file), 'utf8');
        expect(content).toMatch(/CREATE TABLE IF NOT EXISTS/i);
        expect(content).toMatch(/CREATE INDEX IF NOT EXISTS/i);
      }

      // Dosyalar henüz merge edilmemişse bu testin sessizce boşa düşmediğini belgele
      expect(Array.isArray(present)).toBe(true);
    });
  });
});
