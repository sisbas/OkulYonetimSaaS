import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * Controller enforcement consistency (AC-2, #265 / #339).
 *
 * Kök neden: `PermissionAuthenticationGuard` ve `PermissionGuard` global
 * APP_GUARD olarak çalışır, ancak `@Permissions` metadata'sı olmayan handler'ı
 * `if (!required?.length) return true;` ile ATLAR. Metadata taşımayan route ne
 * JWT doğrulamasından ne yetki kontrolünden geçer — sessiz fail-open.
 *
 * Fail-closed kurallar (review bulguları sonrası sertleştirildi):
 * - Yorum içindeki decorator'lar (`// @Permissions(...)`) metadata SAYILMAZ;
 *   kaynak analizden önce yorumlar boşlukla nötralize edilir.
 * - `@Permissions()` veya `@Permissions(DYNAMIC_KEY)` runtime'da boş liste üretir
 *   → "korunmuş" sayılmaz; en az bir literal izin anahtarı zorunludur.
 * - Tüm Nest route decorator'ları taranır (Sse/Search dahil). Tek string literal
 *   olmayan yol ifadeleri (`@Get(ROUTES.details)`, `@Get(['a','b'])`) atlanmaz;
 *   `<expr:...>` anahtarıyla bulgu olarak raporlanır ve allowlist'te karşılığı
 *   olmadığı için test kırmızıya döner.
 * - Public route allowlist'i exact tutulur; bayat girdi ve çift koruma reddedilir.
 */

// Fail-closed istisnası: kimlik doğrulaması gerektirmeyen, açıkça belgelenmiş
// public route'lar. Listeye giriş eklemek ürün güvenlik kararıdır.
export const PUBLIC_ROUTES: ReadonlyArray<string> = [
  'src/health/health.controller.ts get ',
  'src/auth/auth.controller.ts post login',
  'src/auth/auth.controller.ts post refresh',
];

const CLASS_DECLARATION = /export\s+class\s+\w+/g;

// Nest route decorator'ları — Sse/Search dahil; hiçbir route formu sessizce
// atlanmamalı (aksi hâlde @Permissions'sız bir route testten kaçardı).
export const ROUTE_DECORATOR =
  /@(Get|Post|Put|Patch|Delete|All|Options|Head|Sse|Search)\s*\(([^)]*)\)/g;
const ROUTE_DECORATOR_LINE =
  /^\s*@(Get|Post|Put|Patch|Delete|All|Options|Head|Sse|Search)\s*\(/;
const PERMISSIONS_DECORATOR = /@Permissions\s*\(([^)]*)\)/g;
const DECORATOR_LINE = /^\s*@/;

/**
 * Yorum satırlarını ve blok yorumlarını boşlukla değiştirir; satır sayısı
 * korunur ki bulgu raporundaki satır numaraları gerçek dosyayla eşleşsin.
 */
export function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (match, prefix: string) =>
      prefix + ' '.repeat(match.length - prefix.length),
    );
}

export function controllerFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (entry === 'node_modules' || entry === 'dist') return [];
    if (statSync(path).isDirectory()) return controllerFiles(path);
    return entry.endsWith('.controller.ts') ? [path] : [];
  });
}

/** Bir satırdan geriye doğru bitişik decorator bloğunu toplar. */
function decoratorBlockAbove(lines: string[], lineIndex: number): string[] {
  const block: string[] = [];
  for (let i = lineIndex - 1; i >= 0; i--) {
    const line = lines[i];
    if (line.trim() === '') break;
    if (!DECORATOR_LINE.test(line)) break;
    block.unshift(line);
  }
  return block;
}

/** Bir satırdan ileriye doğru bitişik decorator bloğunu toplar. */
function decoratorBlockBelow(lines: string[], lineIndex: number): string[] {
  const block: string[] = [];
  for (let i = lineIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') break;
    if (!DECORATOR_LINE.test(line)) break;
    block.push(line);
  }
  return block;
}

function lineIndexAt(source: string, charIndex: number): number {
  return source.slice(0, charIndex).split(/\r?\n/).length - 1;
}

/** `@Permissions(...)` argümanlarındaki literal izin anahtarları. */
export function permissionLiterals(block: string): string[] {
  return [...block.matchAll(PERMISSIONS_DECORATOR)].flatMap((match) =>
    [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map((literal) => literal[1]),
  );
}

/**
 * Decorator bloğu en az bir LITERAL izin anahtarı taşıyor mu?
 *
 * `@Permissions()` boş dizi, `@Permissions(DYNAMIC_KEY)` çözülemeyen metadata
 * üretir; ikisi de global guard'ları atlatır. Bu yüzden "korunmuş" sayılmaz.
 */
export function hasUsablePermissions(block: string): boolean {
  return permissionLiterals(block).length > 0;
}

/**
 * Route argümanını allowlist karşılaştırması için normalleştirir.
 *
 * `@Get()` → `''`; `@Get('me')` → `'me'`; `@Get(['a','b'])` → `'a|b'`.
 * Yol bir literal değilse (`ROUTES.details`) fail-closed olarak `<expr:...>`
 * anahtarı üretilir; bu anahtar allowlist'te bulunmadığı için route ya
 * `@Permissions` taşımak ya da bilinçli olarak allowlist'e eklenmek zorundadır.
 */
export function routePathFromArgs(rawArgs: string): string {
  const trimmed = rawArgs.trim();
  if (trimmed === '') return '';
  const literals = [...trimmed.matchAll(/['"]([^'"]*)['"]/g)].map(
    (match) => match[1],
  );
  const withoutLiterals = trimmed
    .replace(/['"][^'"]*['"]/g, '')
    .replace(/[\s,[\]]/g, '');
  if (literals.length > 0 && withoutLiterals === '') {
    return literals.join('|');
  }
  return `<expr:${trimmed.replace(/\s+/g, ' ')}>`;
}

export type RouteFinding = {
  file: string;
  routeKey: string;
  classHasPermissions: boolean;
  handlerHasPermissions: boolean;
  line: number;
};

/**
 * Bir controller kaynağındaki route'ları ve `@Permissions` kapsamını çıkarır.
 * `source` yorumlardan arındırılmış sürüm üzerinde taranır (satır numaraları
 * korunur).
 */
export function collectFindings(file: string, source: string): RouteFinding[] {
  const clean = stripComments(source);
  const lines = clean.split(/\r?\n/);
  const classes = [...clean.matchAll(CLASS_DECLARATION)].map(
    (match, index, all) => ({
      start: match.index,
      end: index + 1 < all.length ? all[index + 1].index : clean.length,
      line: lineIndexAt(clean, match.index),
    }),
  );

  return classes.flatMap((klass) => {
    // Sınıf düzeyi `@Permissions` tüm handler'ları kapsar (Nest semantiği).
    const classHasPermissions = hasUsablePermissions(
      decoratorBlockAbove(lines, klass.line).join('\n'),
    );
    const body = clean.slice(klass.start, klass.end);

    return [...body.matchAll(ROUTE_DECORATOR)].map((match) => {
      const routeLine = lineIndexAt(clean, klass.start + match.index);
      // Decorator sırası serbest: route decorator'ının üstünde veya altında
      // olabilir (repo stilinde altında).
      const handlerBlock = [
        ...decoratorBlockAbove(lines, routeLine),
        ...decoratorBlockBelow(lines, routeLine),
      ].join('\n');
      return {
        file: relative(process.cwd(), file).split('\\').join('/'),
        routeKey: `${match[1].toLowerCase()} ${routePathFromArgs(match[2])}`,
        classHasPermissions,
        handlerHasPermissions: hasUsablePermissions(handlerBlock),
        line: routeLine + 1,
      };
    });
  });
}

/** Sentetik controller kaynağı: parser fail-closed davranışını doğrulamak için. */
function syntheticController(members: string, decorators = "@Controller('x')"): string {
  return [
    "import { Controller, Get, Post, Sse } from '@nestjs/common';",
    "import { Permissions } from '../common/decorators/permissions.decorator';",
    decorators,
    'export class SyntheticController {',
    members,
    '}',
    '',
  ].join('\n');
}

describe('controller enforcement consistency (fail-closed @Permissions contract)', () => {
  const sources = controllerFiles(join(process.cwd(), 'src')).map((file) => ({
    file,
    source: readFileSync(file, 'utf8'),
  }));

  const findings = sources.flatMap(({ file, source }) =>
    collectFindings(file, source),
  );
  const allowed = new Set(PUBLIC_ROUTES);
  const seenRouteKeys = new Set(
    findings.map((finding) => `${finding.file} ${finding.routeKey}`),
  );

  it('scans the controller surface (sanity check)', () => {
    expect(sources.length).toBeGreaterThan(0);
    expect(findings.length).toBeGreaterThan(20);
  });

  it('covers every protected route with a usable @Permissions metadata', () => {
    const uncovered = findings
      .filter(
        (finding) =>
          !finding.classHasPermissions &&
          !finding.handlerHasPermissions &&
          !allowed.has(`${finding.file} ${finding.routeKey}`),
      )
      .map(
        (finding) =>
          `${finding.file}:${finding.line} ${finding.routeKey} has no usable @Permissions metadata (fail-open)`,
      );

    expect(uncovered).toEqual([]);
  });

  it('keeps the public route allowlist exact (no stale entries)', () => {
    const stale = PUBLIC_ROUTES.filter((entry) => !seenRouteKeys.has(entry));
    expect(stale).toEqual([]);
  });

  it('keeps allowlisted public routes free of @Permissions metadata', () => {
    const nowProtected = findings
      .filter(
        (finding) =>
          (finding.classHasPermissions || finding.handlerHasPermissions) &&
          allowed.has(`${finding.file} ${finding.routeKey}`),
      )
      .map((finding) => `${finding.file} ${finding.routeKey}`);

    expect(nowProtected).toEqual([]);
  });
});

/**
 * Parser regresyon testleri: review bulguları (Codex P1) ile kapatılan
 * fail-open boşlukları her zaman kırmızıya dönmeli.
 */
describe('enforcement parser fail-closed behaviours', () => {
  const findingsOf = (members: string, decorators?: string) =>
    collectFindings(
      'src/x/synthetic.controller.ts',
      syntheticController(members, decorators),
    );

  it('treats a commented-out @Permissions decorator as absent (review P1)', () => {
    const findings = findingsOf(
      ['  @Get(\'hidden\')', "  // @Permissions('attendance:read')", '  async hidden() {}'].join('\n'),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].routeKey).toBe('get hidden');
    expect(findings[0].handlerHasPermissions).toBe(false);
  });

  it('rejects an empty @Permissions() decorator (review P1)', () => {
    const findings = findingsOf(
      ["  @Get('empty')", '  @Permissions()', '  async empty() {}'].join('\n'),
    );
    expect(findings[0].handlerHasPermissions).toBe(false);
  });

  it('rejects a non-literal @Permissions(DYNAMIC_KEY) decorator', () => {
    const findings = findingsOf(
      ["  @Get('dynamic')", '  @Permissions(DYNAMIC_PERMISSION)', '  async dynamic() {}'].join('\n'),
    );
    expect(findings[0].handlerHasPermissions).toBe(false);
  });

  it('discovers routes declared with a non-literal path expression (review P1)', () => {
    const findings = findingsOf(
      ['  @Get(ROUTES.details)', '  async details() {}'].join('\n'),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].routeKey).toBe('get <expr:ROUTES.details>');
    expect(findings[0].handlerHasPermissions).toBe(false);
  });

  it('discovers multi-path routes and Sse decorators (review P1)', () => {
    const findings = findingsOf(
      ["  @Get(['a', 'b'])", '  async multi() {}', '  @Sse()', '  async stream() {}'].join('\n'),
    );
    expect(findings.map((finding) => finding.routeKey)).toEqual(['get a|b', 'sse ']);
  });

  it('accepts a literal @Permissions decorator above or below the route', () => {
    const below = findingsOf(
      ["  @Get('ok')", "  @Permissions('attendance:read')", '  async ok() {}'].join('\n'),
    );
    const above = findingsOf(
      ["  @Permissions('attendance:read')", "  @Get('ok')", '  async ok() {}'].join('\n'),
    );
    expect(below[0].handlerHasPermissions).toBe(true);
    expect(above[0].handlerHasPermissions).toBe(true);
  });

  it('treats class-level @Permissions as covering every handler', () => {
    const findings = findingsOf(
      ["  @Get('a')", '  async a() {}', "  @Post('b')", '  async b() {}'].join('\n'),
      "@Controller('x')\n@Permissions('attendance:read')",
    );
    expect(findings).toHaveLength(2);
    expect(findings.every((finding) => finding.classHasPermissions)).toBe(true);
  });
});
