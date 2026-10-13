import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';

const source = fs.readFileSync(path.join(process.cwd(), 'frontend/runtime/app.js'), 'utf8');

export interface RuntimeHarness {
  element: (id: string) => Record<string, any>;
  elements: Map<string, Record<string, any>>;
  fetch: jest.Mock;
  probe: any;
  renderedStrings: () => string;
}

export function runtime(probeExports = 'state, applyCatalog, login, updateContext, apiRequest'): RuntimeHarness {
  const elements = new Map<string, Record<string, any>>();
  const element = (id: string) => {
    if (!elements.has(id)) elements.set(id, { value: '', innerHTML: '', textContent: '', disabled: false, hidden: false,
      dataset: {}, addEventListener: () => {}, focus: () => {} });
    return elements.get(id)!;
  };
  const fetch = jest.fn();
  const context = vm.createContext({ document: { querySelector: element, querySelectorAll: () => [], addEventListener: () => {} },
    fetch, URLSearchParams });
  vm.runInContext(source + `\nthis.probe = { ${probeExports} };`, context);
  const renderedStrings = () => [...elements.values()]
    .map((el) => `${el.textContent ?? ''} ${el.innerHTML ?? ''}`)
    .join(' ')
    .trim();
  return { element, elements, fetch, probe: context.probe, renderedStrings };
}

export function response(body: unknown, status = 200) {
  return { ok: status === 200, status, text: async () => JSON.stringify(body), headers: { get: () => null } };
}
