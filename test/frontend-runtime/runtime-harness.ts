import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';

const RUNTIME_ROOT = path.join(process.cwd(), 'frontend/runtime');
const SCREEN_MODULES = ['decisions', 'consents', 'notifications', 'schedule', 'attendance'];

// Core first, then the screen modules in the order index.html loads them, so a
// probe can drive any screen the way the browser does.
const source = [
  fs.readFileSync(path.join(RUNTIME_ROOT, 'app.js'), 'utf8'),
  ...SCREEN_MODULES.map((name) => fs.readFileSync(path.join(RUNTIME_ROOT, 'screens', `${name}.js`), 'utf8')),
].join('\n');

export interface MockElement {
  id?: string;
  value: string;
  innerHTML: string;
  textContent: string;
  disabled: boolean;
  hidden: boolean;
  dataset: Record<string, string>;
  classList: {
    add: (c: string) => void;
    remove: (c: string) => void;
    toggle: (c: string, force?: boolean) => void;
    contains: (c: string) => boolean;
  };
  setAttribute: (k: string, v: string) => void;
  getAttribute: (k: string) => string | null;
  addEventListener: () => void;
  focus: () => void;
  closest: (sel: string) => MockElement | null;
  querySelector: (sel: string) => MockElement | null;
}

export interface RuntimeHarness {
  element: (sel: string) => MockElement;
  elements: Map<string, MockElement>;
  fetch: jest.Mock;
  probe: any;
  renderedStrings: () => string;
}

function makeElement(init: Partial<MockElement> = {}): MockElement {
  const classes = new Set<string>();
  const attrs = new Map<string, string>();
  const el: MockElement = {
    value: '',
    innerHTML: '',
    textContent: '',
    disabled: false,
    hidden: false,
    dataset: {},
    classList: {
      add: (c: string) => classes.add(c),
      remove: (c: string) => classes.delete(c),
      toggle: (c: string, force?: boolean) => {
        if (force === undefined ? !classes.has(c) : force) classes.add(c);
        else classes.delete(c);
      },
      contains: (c: string) => classes.has(c),
    },
    setAttribute: (k: string, v: string) => attrs.set(k, v),
    getAttribute: (k: string) => attrs.get(k) ?? null,
    addEventListener: () => {},
    focus: () => {},
    closest: () => null,
    querySelector: () => null,
    ...init,
  };
  // Seed initial classList from init.classList array if provided
  if (Array.isArray(init.classList)) {
    for (const c of init.classList) classes.add(c);
  }
  // Seed hidden class from init.hidden boolean
  if (init.hidden) classes.add('hidden');
  return el;
}

export function runtime(
  probeExports = 'state, applyCatalog, login, updateContext, apiRequest',
  permissions: string[] = [],
): RuntimeHarness {
  const elements = new Map<string, MockElement>();

  // Pre-register tab elements
  const tabNames = ['bugun', 'teacher', 'ops', 'notifications', 'program', 'attendance'];
  for (const name of tabNames) {
    const tab = makeElement({ dataset: { tab: name } });
    tab.setAttribute('aria-selected', name === 'bugun' ? 'true' : 'false');
    elements.set(`.tab[data-tab="${name}"]`, tab);
  }

  // Pre-register panel elements — bugun visible by default, rest hidden
  const panelNames = ['bugun', 'teacher', 'ops', 'notifications', 'program', 'attendance'];
  for (const name of panelNames) {
    const panel = makeElement({ dataset: { panel: name }, hidden: name !== 'bugun' });
    elements.set(`#${name}-panel`, panel);
  }

  const element = (sel: string) => {
    if (!elements.has(sel)) elements.set(sel, makeElement());
    return elements.get(sel)!;
  };

  const querySelectorAll = (sel: string) => {
    const results: MockElement[] = [];
    if (sel === '.tab' || sel === '.tab:not(.hidden)') {
      for (const [key, el] of elements) {
        if (key.startsWith('.tab[data-tab=')) results.push(el);
      }
      if (sel === '.tab:not(.hidden)') return results.filter((el) => !el.classList.contains('hidden'));
      return results;
    }
    if (sel === '.runtime-panel') {
      for (const [key, el] of elements) {
        if (key.endsWith('-panel') && key.startsWith('#')) results.push(el);
      }
      return results;
    }
    return results;
  };

  const fetch = jest.fn();
  const querySelector = (sel: string) => {
    // Handle attribute selectors like .tab[aria-selected="true"]
    const attrMatch = sel.match(/^\.tab\[aria-selected="(.+)"\]$/);
    if (attrMatch) {
      const wanted = attrMatch[1];
      for (const [key, el] of elements) {
        if (key.startsWith('.tab[data-tab=') && el.getAttribute('aria-selected') === wanted) {
          return el;
        }
      }
      return null;
    }
    return element(sel);
  };
  const document = {
    querySelector,
    querySelectorAll,
    addEventListener: () => {},
    getElementById: (id: string) => element(`#${id}`),
  };
  const context = vm.createContext({ document, fetch, URLSearchParams });
  // #445: persona kotu — boot sonrası izin anahtarları atanır
  // (applyCatalog bundan sonra çağrılırsa üzerine yazar; fail-closed default []).
  vm.runInContext(
    `${source}\nthis.probe = { ${probeExports} };\nthis.probe.state.permissions = ${JSON.stringify(permissions)};\n`,
    context,
  );

  const renderedStrings = () =>
    [...elements.values()].map((el) => `${el.textContent ?? ''} ${el.innerHTML ?? ''}`).join(' ').trim();

  return { element, elements, fetch, probe: context.probe, renderedStrings };
}

export function response(body: unknown, status = 200) {
  return { ok: status === 200, status, text: async () => JSON.stringify(body), headers: { get: () => null } };
}

/**
 * #445 — persona kotları (tek kaynak). Sunucu seeds'indeki anahtar
 * gerçekliğini temsil eder; yetki kapsamına özel davranış
 * runtime-role-navigation ve boundary speclerinde test edilir.
 */

// Akış persona kotu: ROUTE_PERMISSIONS'taki tüm bilinen anahtarlar
// (tenant_admin benzeri). Kopya/hygiene/akış specleri karar-sonrası UX'i
// test ettiği için bu kotla yüklenirler.
export const ALL_PERMISSION_KEYS = [
  'attendance:generate', 'attendance:lock', 'attendance:own:read',
  'attendance:own:submit', 'attendance:record:update', 'attendance:update',
  'consent:read', 'consent:revoke',
  'daily_operations:own:read', 'daily_operations:read', 'daily_operations:update',
  'dashboard:teacher_own_summary:read', 'dashboard:read',
  'leave:approve', 'leave:create', 'leave:impact:read', 'leave:own:read',
  'leave:read', 'leave:reject',
  'notification:draft:approve', 'notification:draft:close', 'notification:draft:read',
  'parent_notification:approve', 'parent_notification:send',
  'schedule:draft:create', 'schedule:draft:update', 'schedule:own:read',
  'schedule:publish', 'schedule:read',
  'user:read',
];

// Öğretmen (sunucu seeds): dar anahtar seti, üst küme değil.
export const TEACHER_PERMISSION_KEYS = [
  'attendance:own:read', 'attendance:own:submit', 'attendance:record:update',
  'daily_operations:own:read', 'dashboard:teacher_own_summary:read',
  'leave:create', 'leave:own:read', 'schedule:own:read', 'user:read',
];

// Operasyon yöneticisi: öğretmen anahtarlarını kapsayan üst küme (ops ⊇
// teacher) → teacher sekmesi de görünür (kullanılabilirlik yakınsaması).
export const OPS_PERMISSION_KEYS = [
  ...TEACHER_PERMISSION_KEYS,
  'attendance:generate', 'attendance:lock', 'attendance:update',
  'consent:read', 'consent:revoke',
  'daily_operations:read', 'daily_operations:update',
  'leave:approve', 'leave:impact:read', 'leave:read', 'leave:reject',
  'notification:draft:approve', 'notification:draft:close',
  'notification:draft:read', 'parent_notification:approve', 'parent_notification:send',
  'schedule:draft:create', 'schedule:draft:update', 'schedule:publish', 'schedule:read',
];

// Kurum (tenant) yöneticisi: operasyon üst kümesi + kullanıcı/tenant yönetimi
// (sunucu seeds tenant_admin'in kapsayıcı üst kümesi).
export const TENANT_ADMIN_PERMISSION_KEYS = [
  ...OPS_PERMISSION_KEYS,
  'attendance:report:read',
  'user:create', 'user:update', 'user:read',
];

// Yalnız-okur persona (story 79): hiçbir akış anahtarı yok; yayınlanmış program
// tamamen gizli kalır (GET published-schedule ucu henüz mevcut değil).
export const VIEWER_PERMISSION_KEYS = ['dashboard:read', 'schedule:read', 'user:read'];
