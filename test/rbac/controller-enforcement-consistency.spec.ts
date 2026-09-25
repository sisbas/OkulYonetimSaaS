import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

import { SecurityAuditService } from '../../src/common/audit/security-audit.service';
import { AuthorizationContextError } from '../../src/common/context/authorization-context';
import { CONTEXT_SCOPE_KEY } from '../../src/common/context/context-scope.decorator';
import { PUBLIC_ROUTE_KEYS } from '../../src/common/context/public-route';
import { PERMISSIONS_KEY } from '../../src/common/decorators/permissions.decorator';
import { PermissionGuard } from '../../src/common/guards/permission.guard';

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

/**
 * `@ContextScoped()` beyanlı (iş izni gerektirmeyen oturum bağlamı) route'lar.
 * Bu liste EXACT tutulur: yeni bir context-scoped route eklemek bilinçli bir
 * güvenlik kararıdır ve bu testi güncellemeyi gerektirir (default-deny).
 */
export const CONTEXT_SCOPED_ROUTES: ReadonlyArray<string> = [
  'src/rbac/context-catalog.controller.ts get ',
  'src/rbac/context-catalog.controller.ts post branch',
];

const CLASS_DECLARATION = /export\s+class\s+\w+/g;

// Nest route decorator'ları — Sse/Search dahil; hiçbir route formu sessizce
// atlanmamalı (aksi hâlde @Permissions'sız bir route testten kaçardı).
export const ROUTE_DECORATOR =
  /@(Get|Post|Put|Patch|Delete|All|Options|Head|Sse|Search)\s*\(([^)]*)\)/g;
const ROUTE_DECORATOR_LINE =
  /^\s*@(Get|Post|Put|Patch|Delete|All|Options|Head|Sse|Search)\s*\(/;
const PERMISSIONS_DECORATOR = /@Permissions\s*\(([^)]*)\)/g;
const CONTEXT_SCOPE_DECORATOR = /@ContextScoped\s*\(/;
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
  classHasContextScope: boolean;
  handlerHasContextScope: boolean;
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
    const classDecorators = decoratorBlockAbove(lines, klass.line).join('\n');
    const classHasPermissions = hasUsablePermissions(classDecorators);
    const classHasContextScope = CONTEXT_SCOPE_DECORATOR.test(classDecorators);
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
        classHasContextScope,
        handlerHasContextScope: CONTEXT_SCOPE_DECORATOR.test(handlerBlock),
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

  it('covers every protected route with a usable @Permissions metadata or an explicit context scope', () => {
    const contextScoped = new Set(CONTEXT_SCOPED_ROUTES);
    const uncovered = findings
      .filter((finding) => {
        const key = `${finding.file} ${finding.routeKey}`;
        if (allowed.has(key)) return false;
        if (finding.classHasPermissions || finding.handlerHasPermissions) return false;
        const declared = finding.classHasContextScope || finding.handlerHasContextScope;
        return !(declared && contextScoped.has(key));
      })
      .map(
        (finding) =>
          `${finding.file}:${finding.line} ${finding.routeKey} has no usable @Permissions metadata or allowlisted @ContextScoped declaration (default-deny violation)`,
      );

    expect(uncovered).toEqual([]);
  });

  it('keeps the context-scope allowlist exact (no stale entries)', () => {
    const seen = new Set(findings.map((finding) => `${finding.file} ${finding.routeKey}`));
    expect(CONTEXT_SCOPED_ROUTES.filter((entry) => !seen.has(entry))).toEqual([]);
  });

  it('requires an actual @ContextScoped declaration for every allowlisted context-scoped route', () => {
    const contextScoped = new Set(CONTEXT_SCOPED_ROUTES);
    const missingDeclaration = findings
      .filter((finding) => contextScoped.has(`${finding.file} ${finding.routeKey}`))
      .filter((finding) => !finding.classHasContextScope && !finding.handlerHasContextScope)
      .map((finding) => `${finding.file}:${finding.line} ${finding.routeKey}`);

    expect(missingDeclaration).toEqual([]);
  });

  it('never mixes public and context-scoped declarations', () => {
    const mixed = findings
      .filter((finding) => allowed.has(`${finding.file} ${finding.routeKey}`))
      .filter((finding) => finding.classHasContextScope || finding.handlerHasContextScope)
      .map((finding) => `${finding.file} ${finding.routeKey}`);

    expect(mixed).toEqual([]);
  });

  it('keeps the runtime public allowlist in sync with this static allowlist', () => {
    // Çalışma zamanı (guard) allowlist'i ile statik sözleşme ayrışırsa bu test kırmızıya döner.
    expect([...PUBLIC_ROUTE_KEYS].sort()).toEqual([...PUBLIC_ROUTES].sort());
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

/**
 * Default-deny runtime sözleşmesi (#339 R4, madde 7).
 *
 * Statik tarama "metadata var mı" sorusunu yanıtlar; bu blok ise guard'ın
 * runtime davranışını doğrular: bağlam/izin yoksa erişim YOKTUR (KIRMIZI) ve
 * istemcinin gönderdiği tenant/şube/rol/izin değerleri yetki üretmez.
 */
describe('default-deny runtime contract (PermissionGuard)', () => {
  class ProtectedController {}
  class ContextScopedController {}
  class HealthController {}

  type Harness = {
    guard: PermissionGuard;
    audit: { emitAuthorizationDenied: jest.Mock };
    resolve: jest.Mock;
    resolveSelection: jest.Mock;
  };

  const harness = (options: {
    permissions?: string[];
    contextScoped?: boolean;
    authority?: { roles: string[]; permissions: string[] } | Error;
  }): Harness => {
    const audit = { emitAuthorizationDenied: jest.fn() };
    const resolve = jest.fn();
    if (options.authority instanceof Error) resolve.mockRejectedValue(options.authority);
    else
      resolve.mockResolvedValue({
        roles: options.authority?.roles ?? ['operations_manager'],
        permissions: options.authority?.permissions ?? [],
        tokenVersion: 1,
        resolvedAt: '2026-09-23T00:00:00.000Z',
        cache: 'miss',
      });
    const resolveSelection = jest.fn();
    const reflector = {
      getAllAndOverride: jest.fn((key: string) =>
        key === PERMISSIONS_KEY ? options.permissions : options.contextScoped === true,
      ),
    } as unknown as Reflector;
    return {
      guard: new PermissionGuard(
        reflector,
        audit as unknown as SecurityAuditService,
        { resolve } as never,
        { resolveSelection } as never,
      ),
      audit,
      resolve,
      resolveSelection,
    };
  };

  const context = (
    request: Record<string, unknown>,
    controller: unknown = ProtectedController,
    handler: unknown = protectedHandler,
  ) =>
    ({
      getHandler: () => handler,
      getClass: () => controller,
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  /** Handler adları public allowlist kimliğiyle eşleşmeli (`check`). */
  function protectedHandler() {}
  function check() {}

  const user = (overrides: Record<string, unknown> = {}) => ({
    userId: '66666666-6666-4666-8666-666666666666',
    tenantId: '11111111-1111-4111-8111-111111111111',
    roleIds: ['operations_manager'],
    permissions: [],
    authorizationVersion: 1,
    ...overrides,
  });


  it('denies a metadata-less protected controller when no context is resolved (KIRMIZI)', async () => {
    const { guard } = harness({ permissions: undefined });
    await expect(Promise.resolve(guard.canActivate(context({ header: jest.fn(), user: undefined })))).resolves.toBe(
      false,
    );
  });

  it('denies a metadata-less protected controller even with an authenticated user', async () => {
    const { guard } = harness({ permissions: undefined, contextScoped: false });
    await expect(Promise.resolve(guard.canActivate(context({ header: jest.fn(), user: user() })))).resolves.toBe(false);
  });

  it('denies when the request has no authenticated user', async () => {
    const { guard } = harness({ permissions: ['user:read'] });
    await expect(Promise.resolve(guard.canActivate(context({ header: jest.fn() })))).resolves.toBe(false);
  });

  it('denies when authority cannot be resolved (fail-closed)', async () => {
    const { guard } = harness({
      permissions: ['user:read'],
      authority: new AuthorizationContextError('unresolved_authority'),
    });
    await expect(Promise.resolve(guard.canActivate(context({ header: jest.fn(), user: user() })))).resolves.toBe(false);
  });

  it('denies when the token authority version is stale', async () => {
    const { guard } = harness({
      permissions: ['user:read'],
      authority: new AuthorizationContextError('stale_authorization_version'),
    });
    await expect(Promise.resolve(guard.canActivate(context({ header: jest.fn(), user: user() })))).resolves.toBe(false);
  });

  it('client-supplied tenant, role and permission values never grant access', async () => {
    const { guard, resolve } = harness({
      permissions: ['user:read'],
      authority: { roles: ['teacher'], permissions: [] },
    });
    const spoofed = {
      header: jest.fn(),
      user: user({
        permissions: ['user:read', 'role:permission:update'],
        roleIds: ['tenant_admin'],
      }),
      body: { tenantId: 'other', roles: ['tenant_admin'], permissions: ['user:read'] },
      query: { tenantId: 'other' },
    };
    await expect(Promise.resolve(guard.canActivate(context(spoofed)))).resolves.toBe(false);
    expect(resolve).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: '11111111-1111-4111-8111-111111111111' }),
    );
  });

  it('denies a cross-tenant header that contradicts the token tenant', async () => {
    const { guard } = harness({ permissions: ['user:read'] });
    const crossTenant = {
      header: jest.fn((name: string) =>
        name === 'x-tenant-id' ? '22222222-2222-4222-8222-222222222222' : undefined,
      ),
      user: user({ permissions: ['user:read'] }),
    };
    await expect(Promise.resolve(guard.canActivate(context(crossTenant)))).resolves.toBe(false);
  });

  it('denies a client-supplied branch that is outside the server-side scope', async () => {
    const { guard, resolveSelection } = harness({
      permissions: ['user:read'],
      authority: { roles: ['teacher'], permissions: ['user:read'] },
    });
    resolveSelection.mockRejectedValue(new AuthorizationContextError('unauthorized_branch'));
    const crossBranch = {
      header: jest.fn((name: string) =>
        name === 'x-branch-id' ? '99999999-9999-4999-8999-999999999999' : undefined,
      ),
      user: user({ permissions: ['user:read'] }),
    };
    await expect(Promise.resolve(guard.canActivate(context(crossBranch)))).resolves.toBe(false);
    expect(resolveSelection).toHaveBeenCalled();
  });

  it('allows a declared @ContextScoped route only with a resolved context', async () => {
    const declared = harness({ permissions: undefined, contextScoped: true });
    await expect(Promise.resolve(
      declared.guard.canActivate(
        context({ header: jest.fn(), user: user() }, ContextScopedController),
      ),
    )).resolves.toBe(true);
    const anonymous = harness({ permissions: undefined, contextScoped: true });
    await expect(Promise.resolve(
      anonymous.guard.canActivate(context({ header: jest.fn() }, ContextScopedController)),
    )).resolves.toBe(false);
  });

  it('keeps public routes reachable without any context', async () => {
    const { guard } = harness({ permissions: undefined });
    await expect(Promise.resolve(
      guard.canActivate(context({ header: jest.fn() }, HealthController, check)),
    )).resolves.toBe(true);
  });

  it('detects @ContextScoped declarations in the static scan', () => {
    const findings = collectFindings(
      'src/x/synthetic.controller.ts',
      [
        "import { Controller, Get } from '@nestjs/common';",
        "import { ContextScoped } from '../common/context/context-scope.decorator';",
        "@Controller('x')",
        'export class SyntheticController {',
        '  @Get()',
        '  @ContextScoped()',
        '  async current() {}',
        "  @Get('undeclared')",
        '  async undeclared() {}',
        '}',
        '',
      ].join('\n'),
    );
    expect(findings.find((finding) => finding.routeKey === 'get ')?.handlerHasContextScope).toBe(
      true,
    );
    expect(
      findings.find((finding) => finding.routeKey === 'get undeclared')?.handlerHasContextScope,
    ).toBe(false);
  });
});

