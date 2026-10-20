import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * #445 — istemci-sunucu yetki SEAM'ı.
 *
 * Client (frontend/runtime/app.js) ROUTE_PERMISSIONS tablosu yalnızca
 * kullanılabilirlik yakınsaması taşır; zorlama sunucu @Permissions
 * guard'ındadır. Bu spec statik olarak iki tarafı karşılaştırır:
 * istemcideki her (method, pathTemplate) ikilisi sunucuda aynı method+path
 * şablonuna ve client'ın iddia ettiği izni kapsayan bir @Permissions
 * dekoratörüne sahip olmalıdır. Sunucuda fazladan rota olması serbesttir;
 * istemci fail-closed tablosunda olmayan rotayı zaten çağırmaz.
 */

const root = process.cwd();

const SERVER_CONTROLLERS: Array<{ file: string; controllerBases: string[] }> = [
  { file: 'src/leaves/leave.controller.ts', controllerBases: ['leaves'] },
  {
    file: 'src/daily-operations/daily-operations.controller.ts',
    controllerBases: ['daily-operations', 'daily-operations/leaves'],
  },
  { file: 'src/schedules/schedule.controller.ts', controllerBases: ['schedules'] },
  { file: 'src/kvkk/kvkk-consent.controller.ts', controllerBases: ['consents'] },
  { file: 'src/notifications/notification-draft.controller.ts', controllerBases: ['notifications/drafts'] },
  { file: 'src/notifications/notification-operations.controller.ts', controllerBases: ['notifications'] },
  { file: 'src/attendance/attendance.controller.ts', controllerBases: ['attendance/sessions'] },
];

const METHOD_DECORATORS: Array<[string, string]> = [
  ['GET', 'Get'],
  ['POST', 'Post'],
  ['PATCH', 'Patch'],
  ['PUT', 'Put'],
  ['DELETE', 'Delete'],
];

interface RouteRule {
  method: string;
  path: string;
  permissions: string[];
}

function extractServerRules(): RouteRule[] {
  const rules: RouteRule[] = [];
  for (const entry of SERVER_CONTROLLERS) {
    const source = fs.readFileSync(path.join(root, entry.file), 'utf8');
    // Sınıfları @Controller ayıracıyla böl; sınıf sırası baz sırasıyla üstüste gelir
    const classChunks = source.split(/@Controller\(/).slice(1);
    if (classChunks.length !== entry.controllerBases.length) {
      throw new Error(
        `${entry.file}: beklenen ${entry.controllerBases.length} @Controller sınıfı, bulunan ${classChunks.length}`,
      );
    }
    classChunks.forEach((chunk, index) => {
      const base = entry.controllerBases[index];
      for (const [method, decorator] of METHOD_DECORATORS) {
        const re = new RegExp(`@${decorator}\\(([^)]*)\\)`, 'g');
        let match: RegExpExecArray | null;
        while ((match = re.exec(chunk)) !== null) {
          const subPath = match[1].trim().replace(/^['"]|['"]$/g, '');
          // Rotadan bir SONRAKİ rota dekoratörüne kadar olan bölüm:
          // handler'ın artık @Permissions gibi dekoratörleri buradadır.
          const segment = (chunk.slice((match.index ?? 0) + match[0].length)
            .split(/\n\s*@(?:Get|Post|Patch|Put|Delete)\(/)[0]) ?? '';
          const permsMatch = segment.match(/@Permissions\(([^)]*)\)/);
          if (!permsMatch) {
            throw new Error(
              `${entry.file} ${method} /${base}${subPath ? `/${subPath}` : ''}: @Permissions dekoratörü yok — fail-open yasak (#445 seam)`,
            );
          }
          const permissions = [...permsMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
          const path_ = subPath ? `/${base}/${subPath}` : `/${base}`;
          rules.push({ method, path: path_, permissions });
        }
      }
    });
  }
  return rules;
}

function extractClientRules(): Array<{ method: string; path: string; permission: string }> {
  const app = fs.readFileSync(path.join(root, 'frontend/runtime/app.js'), 'utf8');
  const rules: Array<{ method: string; path: string; permission: string }> = [];
  const re = /\{\s*method:\s*'([A-Z]+)',\s*path:\s*'([^']+)',\s*permission:\s*'([^']+)'\s*\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(app)) !== null) {
    rules.push({ method: match[1], path: match[2], permission: match[3] });
  }
  return rules;
}

describe('runtime route permission seam (#445)', () => {
  const serverRules = extractServerRules();
  const clientRules = extractClientRules();

  it('client affordance table is not empty', () => {
    expect(clientRules.length).toBeGreaterThan(20);
    expect(serverRules.length).toBeGreaterThan(20);
  });

  it('every client entry exists on the server with the same method, path template and guarding permission', () => {
    for (const rule of clientRules) {
      const serverRule = serverRules.find((r) => r.method === rule.method && r.path === rule.path);
      if (!serverRule || !serverRule.permissions.includes(rule.permission)) {
        throw new Error(
          `Seam kırık: client ${rule.method} ${rule.path} permission='${rule.permission}' — sunucu tarafı: ` +
            (serverRule ? serverRule.permissions.join(', ') : 'rota bulunamadı'),
        );
      }
    }
  });

  it('mutating routes are always guarded (no fail-open handler in the controller set)', () => {
    // Extract zaten @Permissions'sız her handler'da fırlatır; bu test
    // beklenen mutasyon sayısının altında düşüşü yakalar.
    const guardedMutations = serverRules.filter((r) => r.method !== 'GET').length;
    expect(guardedMutations).toBeGreaterThan(10);
  });

  it('session and catalog routes stay outside the capability table', () => {
    for (const rule of clientRules) {
      expect(rule.path.startsWith('/context')).toBe(false);
      expect(rule.path.startsWith('/auth')).toBe(false);
    }
  });
});
