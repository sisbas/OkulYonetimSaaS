import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * Controller enforcement consistency (AC-2, #265 / #339).
 *
 * Kök neden: `PermissionAuthenticationGuard` ve `PermissionGuard` global
 * APP_GUARD olarak çalışır, ancak `@Permissions` metadata'sı olmayan handler'ı
 * `if (!required?.length) return true;` ile ATLAR. Yani metadata taşımayan bir
 * route ne JWT doğrulamasından ne yetki kontrolünden geçer — sessiz fail-open.
 *
 * Bu spec, `src/**\/*.controller.ts` içindeki her route'un ya `@Permissions`
 * (handler veya sınıf düzeyi) taşıdığını ya da açıkça allowlist'lenmiş public
 * route olduğunu statik olarak doğrular. Yeni bir route metadata olmadan
 * eklenirse test fail-closed olarak kırmızıya döner.
 */

// Fail-closed istisnası: kimlik doğrulaması gerektirmeyen, açıkça belgelenmiş
// public route'lar. Listeye giriş eklemek ürün güvenlik kararıdır.
const PUBLIC_ROUTES: ReadonlyArray<string> = [
  'src/health/health.controller.ts get ',
  'src/auth/auth.controller.ts post login',
  'src/auth/auth.controller.ts post refresh',
];

const ROUTE_DECORATOR =
  /@(Get|Post|Put|Patch|Delete|All|Options|Head)\(\s*(?:'([^']*)'|"([^"]*)")?\s*\)/g;
const CLASS_DECLARATION = /export\s+class\s+\w+/g;
const PERMISSIONS_DECORATOR = /@Permissions\s*\(/;
const DECORATOR_OR_COMMENT_LINE = /^\s*(@|\/\/|\/\*|\*)/;

function controllerFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (entry === 'node_modules' || entry === 'dist') return [];
    if (statSync(path).isDirectory()) return controllerFiles(path);
    return entry.endsWith('.controller.ts') ? [path] : [];
  });
}

/** Bir satırdan geriye doğru bitişik decorator/yorum bloğunu toplar. */
function decoratorBlockAbove(lines: string[], lineIndex: number): string[] {
  const block: string[] = [];
  for (let i = lineIndex - 1; i >= 0; i--) {
    const line = lines[i];
    if (line.trim() === '') break;
    if (!DECORATOR_OR_COMMENT_LINE.test(line)) break;
    block.unshift(line);
  }
  return block;
}

/** Bir satırdan ileriye doğru bitişik decorator/yorum bloğunu toplar. */
function decoratorBlockBelow(lines: string[], lineIndex: number): string[] {
  const block: string[] = [];
  for (let i = lineIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') break;
    if (!DECORATOR_OR_COMMENT_LINE.test(line)) break;
    block.push(line);
  }
  return block;
}

function lineIndexAt(source: string, charIndex: number): number {
  return source.slice(0, charIndex).split(/\r?\n/).length - 1;
}

type RouteFinding = {
  file: string;
  routeKey: string;
  classHasPermissions: boolean;
  handlerHasPermissions: boolean;
  line: number;
};

function collectFindings(file: string, source: string): RouteFinding[] {
  const lines = source.split(/\r?\n/);
  const classes = [...source.matchAll(CLASS_DECLARATION)].map(
    (match, index, all) => ({
      start: match.index,
      end: index + 1 < all.length ? all[index + 1].index : source.length,
      line: lineIndexAt(source, match.index),
    }),
  );

  return classes.flatMap((klass) => {
    // Sınıf düzeyi `@Permissions` tüm handler'ları kapsar (Nest semantiği).
    const classHasPermissions = PERMISSIONS_DECORATOR.test(
      decoratorBlockAbove(lines, klass.line).join('\n'),
    );
    const body = source.slice(klass.start, klass.end);

    return [...body.matchAll(ROUTE_DECORATOR)].map((match) => {
      const routeLine = lineIndexAt(source, klass.start + match.index);
      // Decorator sırası serbest: route decorator'ının üstünde veya altında
      // olabilir (repo stilinde altında).
      const handlerBlock = [
        ...decoratorBlockAbove(lines, routeLine),
        ...decoratorBlockBelow(lines, routeLine),
      ].join('\n');
      const path = match[2] ?? match[3] ?? '';
      return {
        file: relative(process.cwd(), file).split('\\').join('/'),
        routeKey: `${match[1].toLowerCase()} ${path}`,
        classHasPermissions,
        handlerHasPermissions: PERMISSIONS_DECORATOR.test(handlerBlock),
        line: routeLine + 1,
      };
    });
  });
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
    expect(findings.length).toBeGreaterThan(0);
  });

  it('covers every protected route with @Permissions (handler or class level)', () => {
    const uncovered = findings
      .filter(
        (finding) =>
          !finding.classHasPermissions &&
          !finding.handlerHasPermissions &&
          !allowed.has(`${finding.file} ${finding.routeKey}`),
      )
      .map(
        (finding) =>
          `${finding.file}:${finding.line} ${finding.routeKey} has no @Permissions metadata (fail-open)`,
      );

    expect(uncovered).toEqual([]);
  });

  it('keeps the public route allowlist exact (no stale entries)', () => {
    const stale = PUBLIC_ROUTES.filter((entry) => !seenRouteKeys.has(entry));
    expect(stale).toEqual([]);
  });

  it('keeps allowlisted public routes free of @Permissions metadata', () => {
    // Allowlist'teki bir route'a @Permissions eklenirse allowlist girişi
    // rotlar; bu durumda girişin kaldırılması beklenir (fail-closed netliği).
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
