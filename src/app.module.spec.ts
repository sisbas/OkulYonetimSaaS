import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * AppModule modül kayıt sözleşmesi (#259/#352 regresyon koruması — review P1).
 *
 * Gerçek olay: `AuditModule` `app.module.ts` içinde **import edildi** ama
 * `imports: []` dizisine **eklenmedi**; sonuç olarak `/api/v1/audit/*` route'ları
 * kayıtsız kaldı ve `AuditQueryService` constructor'ındaki anahtar halkası
 * (`AUDIT_HMAC_PREVIOUS_KEYS`) fail-closed doğrulaması boot'ta hiç çalışmadı.
 * Bu test, aynı sınıf hatanın (import edilip kaydedilmeyen modül) tekrarını
 * statik olarak ve fail-closed engeller.
 *
 * Kural: `app.module.ts` içinde `import { XModule }` ile gelen her `*Module`
 * sembolü, `imports: [...]` dizisinde ya doğrudan ya da bilinçli karantina
 * listesinde (`QUARANTINED_MODULES`) bulunmalıdır.
 */
describe('AppModule wiring contract (#259/#352 review P1)', () => {
  /**
   * Yorum blokları ve yorum satırları ÖNCE çıkarılır: aksi hâlde `imports`
   * dizisi içindeki açıklayıcı yorumlar (ör. bu sözleşmeyi anlatan `AuditModule`
   * sözcüğü) eşleşmeyi **sahte PASS** üretir (mutasyon kontrolüyle yakalandı).
   * Analiz yalnız kod üzerinden yapılır.
   */
  const source = readFileSync(join(__dirname, 'app.module.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

  /** `import { A, B } from './x.module'` biçimindeki modül sembolleri. */
  function importedModuleSymbols(code: string): string[] {
    const symbols = new Set<string>();
    const importRe = /import\s*\{([^}]+)\}\s*from\s*['"][^'"]+\.module['"]/g;
    for (const match of code.matchAll(importRe)) {
      for (const raw of match[1].split(',')) {
        const name = raw.trim();
        if (name.endsWith('Module')) symbols.add(name);
      }
    }
    return [...symbols];
  }

  /** `imports: [...]` dizisinin gövdesi (ilk dizinin içeriği). */
  function importsArrayBody(code: string): string {
    const start = code.indexOf('imports: [');
    expect(start).toBeGreaterThan(-1);
    let depth = 0;
    for (let i = start + 'imports: ['.length - 1; i < code.length; i += 1) {
      if (code[i] === '[') depth += 1;
      if (code[i] === ']') {
        depth -= 1;
        if (depth === 0) return code.slice(start, i + 1);
      }
    }
    throw new Error('imports dizisi kapanmadı');
  }

  /** `QUARANTINED_MODULES.push(<Module>)` ile bilinçli karantinaya alınanlar. */
  function quarantinedSymbols(code: string): string[] {
    const matches = [...code.matchAll(/QUARANTINED_MODULES\.push\(\s*([A-Za-z0-9_]+)\s*\)/g)];
    return matches.map((match) => match[1]);
  }

  it('registers every imported module in the imports array (or in the quarantine list)', () => {
    const imports = importsArrayBody(source);
    const quarantined = quarantinedSymbols(source);
    const unregistered = importedModuleSymbols(source).filter(
      (symbol) => !imports.includes(symbol) && !quarantined.includes(symbol),
    );
    expect(unregistered).toEqual([]);
  });

  it('registers AuditModule (audit controller + key-ring boot validation)', () => {
    expect(importsArrayBody(source)).toContain('AuditModule');
    expect(quarantinedSymbols(source)).not.toContain('AuditModule');
  });

  it('keeps the quarantine list explicit (only env-gated modules)', () => {
    expect(quarantinedSymbols(source).sort()).toEqual(['EokulSyncModule', 'ReportsModule']);
  });
});
