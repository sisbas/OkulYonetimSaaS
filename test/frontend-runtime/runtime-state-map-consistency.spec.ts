import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * #443 — kanonik UI-state haritasının iç tutarlılığı.
 *
 * `SERVER_REASON_UI` ve `HTTP_STATUS_UI_STATE` yalnızca `UI_STATES` içinde
 * tanımlı durumlara işaret edebilir; aksi hâlde harita, çizimde var olmayan
 * bir duruma yönlendirir ve kullanıcı boş/hatalı bölge görür. Emekli
 * (status'tan türetilmiş) kodların runtime'a geri sızmadığı da doğrulanır.
 *
 * Not: main'deki `runtime-ui-state-map.spec.ts` davranışı kapsar; bu spec
 * haritanın statik tutarlılığını kapsar (drift koruması).
 */
const APP = path.join(process.cwd(), 'frontend/runtime/app.js');
const source = fs.readFileSync(APP, 'utf8');

function objectBlock(name: string): string {
  const start = source.indexOf(`const ${name} = {`);
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf('\n};', start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

function definedUiStates(): string[] {
  return [...objectBlock('UI_STATES').matchAll(/^\s{2}([a-z_]+):\s*\{/gm)].map((match) => match[1]);
}

describe('#443 canonical UI-state map consistency', () => {
  const uiStates = new Set(definedUiStates());

  it('defines a UI_STATES entry for every state the map can emit', () => {
    const reasonStates = [...objectBlock('SERVER_REASON_UI').matchAll(/state:\s*'([a-z_]+)'/g)].map(
      (match) => match[1],
    );
    const httpStates = [...objectBlock('HTTP_STATUS_UI_STATE').matchAll(/^\s*\d+:\s*'([a-z_]+)'/gm)].map(
      (match) => match[1],
    );

    expect(reasonStates.length).toBeGreaterThan(0);
    expect(httpStates.length).toBeGreaterThan(0);
    for (const state of [...reasonStates, ...httpStates]) {
      expect({ state, defined: uiStates.has(state) }).toEqual({ state, defined: true });
    }
  });

  it('never re-introduces retired status-minted reason codes', () => {
    for (const retired of [
      'SERVER_ERROR',
      'OFFLINE_OR_UNAVAILABLE',
      'VALIDATION_FAILED',
      'RESOURCE_NOT_VISIBLE',
      'AUTH_REQUIRED',
    ]) {
      expect(source).not.toContain(retired);
    }
    // İstemci kendi gerekçe kodunu üretmez (K-29/K-30).
    expect(source).not.toMatch(/reasonCode\s*=\s*'[A-Z_]+'/);
  });

  it('keeps the observable HTTP statuses mapped to canonical states', () => {
    for (const status of ['0', '400', '401', '403', '404', '409', '412', '424', '428', '429']) {
      expect(objectBlock('HTTP_STATUS_UI_STATE')).toMatch(new RegExp(`^\\s*${status}:\\s*'[a-z_]+'`, 'm'));
    }
  });
});
