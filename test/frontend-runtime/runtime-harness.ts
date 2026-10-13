import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';

const source = fs.readFileSync(path.join(process.cwd(), 'frontend/runtime/app.js'), 'utf8');

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
  vm.runInContext(source + `\nthis.probe = { ${probeExports} };`, context);

  const renderedStrings = () =>
    [...elements.values()].map((el) => `${el.textContent ?? ''} ${el.innerHTML ?? ''}`).join(' ').trim();

  return { element, elements, fetch, probe: context.probe, renderedStrings };
}

export function response(body: unknown, status = 200) {
  return { ok: status === 200, status, text: async () => JSON.stringify(body), headers: { get: () => null } };
}
