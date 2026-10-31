import * as fs from 'node:fs';
import * as path from 'node:path';
import puppeteer, { type Browser, type KeyInput, type Page } from 'puppeteer-core';
import { E2eEnvironmentError } from './env';
import { sanitizeTraceFile } from './trace';

/**
 * S0-A1 (#269 AC-2) — gerçek tarayıcı oturumu.
 *
 * Kural: kabul akışı YALNIZCA görünür UI kontrollerini kullanır (yazma,
 * tıklama, form gönderimi, beklenen UI metni). `page.evaluate` içinde
 * `fetch`/XHR ile işlemsel istek YASAKTIR; DOM/localStorage okuması yalnız
 * SIZINTI DENETİMİ için sınırlı biçimde kullanılır.
 *
 * `@sparticuz/chromium` tip tanımı yayınlamaz; sürücü, `pg` sarmalayıcısıyla
 * aynı gerekçeyle dar bir arayüz arkasından yüklenir (yeni bağımlılık yok).
 */

type SparticuzChromium = {
  executablePath: () => Promise<string>;
  args: string[];
  headless?: boolean | 'shell';
};

const REQUIRED_BROWSER_STRATEGY = 'sparticuz';

function loadSparticuzChromium(): SparticuzChromium {
  const strategy = process.env.PUPPETEER_EXECUTABLE_STRATEGY ?? REQUIRED_BROWSER_STRATEGY;
  if (strategy !== REQUIRED_BROWSER_STRATEGY) {
    throw new E2eEnvironmentError(
      `PUPPETEER_EXECUTABLE_STRATEGY must be '${REQUIRED_BROWSER_STRATEGY}' (received: ${strategy}).`,
    );
  }

  let loaded: unknown;
  try {
    // @sparticuz/chromium provides no type declarations in this repository.
    loaded = require('@sparticuz/chromium');
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    throw new E2eEnvironmentError(
      `@sparticuz/chromium could not be loaded after npm ci (${detail}).`,
    );
  }

  const moduleValue = loaded as { default?: SparticuzChromium } & SparticuzChromium;
  const resolved = moduleValue.default ?? moduleValue;
  if (typeof resolved.executablePath !== 'function' || !Array.isArray(resolved.args)) {
    throw new E2eEnvironmentError('@sparticuz/chromium did not expose executablePath()/args.');
  }
  return resolved;
}

export type StorageSnapshot = Readonly<{
  local: string[];
  session: string[];
  cookie: string;
}>;

export type NetworkEntry = {
  method: string;
  url: string;
  status: number | 'PENDING';
};

export type AxeViolation = Readonly<{
  id: string;
  impact: 'minor' | 'moderate' | 'serious' | 'critical' | null;
  help: string;
  nodes: number;
}>;

export type TraceResult = Readonly<{
  path: string;
  redactionFindings: string[];
}>;

export type UiSession = Readonly<{
  page: Page;
  consoleErrors: string[];
  /** İstek/yığın logu: hangi isteğin gidip hangi status ile döndüğünün müşteri-taraflı gerçeği. */
  networkLog: () => NetworkEntry[];
  navigateToRuntime: () => Promise<number>;
  armResponse: (pathFragment: string, method: string) => Promise<number>;
  text: (selector: string) => Promise<string>;
  attribute: (selector: string, name: string) => Promise<string | null>;
  isVisible: (selector: string) => Promise<boolean>;
  bodyText: () => Promise<string>;
  activeElementId: () => Promise<string>;
  storageSnapshot: () => Promise<StorageSnapshot>;
  typeInto: (selector: string, value: string) => Promise<void>;
  clickElement: (selector: string) => Promise<void>;
  submitForm: (formSelector: string) => Promise<void>;
  waitForText: (selector: string, pattern: RegExp, timeoutMs?: number) => Promise<string>;
  /** Odaklama: gerçek klavye akışı (senaryo 12) için selector'a odaklanır. */
  focus: (selector: string) => Promise<void>;
  /** Gerçek klavye tuşu (Enter/Tab/...). DOM enjeksiyonu yok. */
  press: (key: KeyInput) => Promise<void>;
  /** Select elemanına değer atar (page.select; DOM yazar — form değeri). */
  selectValue: (selector: string, value: string) => Promise<void>;
  /** Çoklu elemanın metinlerini okur (salt okunur). */
  queryTexts: (selector: string) => Promise<string[]>;
  /** Eşleşen eleman sayısını okur (salt okunur). */
  countElements: (selector: string) => Promise<number>;
  maskCredentialInputs: () => Promise<void>;
  screenshot: (name: string) => Promise<string>;
  /** S5-B2: görünür viewport (desktop/mobile) değiştirir. */
  setViewport: (width: number, height: number) => Promise<void>;
  /** S5-B2: gerçek ağ kesintisi (offline durumu). */
  setOffline: (offline: boolean) => Promise<void>;
  /**
   * S5-B2: yaln�zca eşleşen isteği geciktirir; loading durumunun gerçekten
   * render edildiğini kanıtlamak için kullanılır. İşlemsel istek üretmez.
   */
  withDelayedRequest: <T>(
    urlFragment: string,
    delayMs: number,
    action: () => Promise<T>,
  ) => Promise<T>;
  /** S5-B2: axe-core WCAG 2.2 A/AA taraması; DOM'a yazmaz. */
  axeScan: (options?: Readonly<{ include?: string }>) => Promise<AxeViolation[]>;
  /** S5-B2: yatay taşma (responsive kırılma) ölçümü. */
  hasHorizontalOverflow: () => Promise<boolean>;
  /** S5-B2: Chrome trace kaydını başlatır. */
  startTrace: (filePath: string) => Promise<void>;
  /** S5-B2: trace'i durdurur, PII/secret maskeler ve artefakt yolunu döner. */
  stopTrace: () => Promise<TraceResult>;
  close: () => Promise<void>;
}>;

const DEFAULT_TEXT_TIMEOUT_MS = 10_000;
const RESPONSE_TIMEOUT_MS = 20_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveAxeSource(): string {
  try {
    return require.resolve('axe-core/axe.min.js');
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    throw new E2eEnvironmentError(`axe-core could not be resolved after npm ci (${detail}).`);
  }
}

export async function createUiSession(input: Readonly<{
  browser: Browser;
  baseUrl: string;
  screenshotDir: string;
  index: { value: number };
  timeZone?: string;
  viewport?: Readonly<{ width: number; height: number }>;
}>): Promise<UiSession> {
  fs.mkdirSync(input.screenshotDir, { recursive: true });

  const page = await input.browser.newPage();
  // Okul saati yerel saat diliminden gelir: datetime-local değerlerinin
  // (örn. "2026-10-26T08:00") sayfada `new Date(...)` ile Avrupa/İstanbul
  // okul saatine göre yorumlanması gerekir; CI headless Chrome UTC'de
  // çalıştığı için aksi halde izin-etki çakışması sınırda kaçırılır (#266).
  await page.emulateTimezone(input.timeZone ?? 'Europe/Istanbul').catch(() => undefined);
  // HTTP cache KAPALI: aynı URL'e yapılan tekrar ziyaretler 304 (Not Modified)
  // dönerse "canlı 200" iddiası yanlış negatif üretir (ilk CI koşusunda
  // gözlendi: Expected 200 / Received 304). Kabul kanıtı her seferinde gerçek
  // bir ağ yanıtına bağlanmalıdır.
  await page.setCacheEnabled(false);
  await page.setViewport(
    input.viewport === undefined
      ? { width: 1440, height: 900 }
      : { width: input.viewport.width, height: input.viewport.height },
  );
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  const networkEntries: NetworkEntry[] = [];
  page.on('request', (request) => {
    networkEntries.push({ method: request.method(), url: request.url(), status: 'PENDING' });
  });
  page.on('response', (response) => {
    for (let i = networkEntries.length - 1; i >= 0; i -= 1) {
      const entry = networkEntries[i];
      if (entry.status === 'PENDING' && entry.url === response.url()) {
        entry.status = response.status();
        break;
      }
    }
  });

  const readOnlyText = async (selector: string): Promise<string> =>
    page.$eval(selector, (element) => element.textContent ?? '').catch(() => '');

  const traceState: { path: string | null } = { path: null };

  const session: UiSession = {
    page,
    consoleErrors,
    networkLog: () => networkEntries.slice(),
    navigateToRuntime: async () => {
      const response = await page.goto(`${input.baseUrl}/runtime/`, {
        waitUntil: 'networkidle2',
        timeout: 30_000,
      });
      return response?.status() ?? 0;
    },
    armResponse: (pathFragment: string, method: string) =>
      page
        .waitForResponse(
          (response) =>
            response.url().includes(pathFragment) && response.request().method() === method,
          { timeout: RESPONSE_TIMEOUT_MS },
        )
        .then((response) => response.status()),
    text: readOnlyText,
    attribute: (selector: string, name: string) =>
      page.$eval(selector, (element, attribute) => element.getAttribute(String(attribute)), name),
    // Okuma amaçlı DOM incelemesi: yalnız görünürlük ölçümü yapar, DOM'a yazmaz.
    isVisible: (selector: string) =>
      page.$eval(selector, (element) => {
        if (element.classList.contains('hidden')) return false;
        const style = window.getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden';
      }),
    bodyText: () => page.evaluate(() => document.body.innerText),
    activeElementId: () =>
      page.evaluate(() => (document.activeElement as HTMLElement | null)?.id ?? ''),
    // Okuma amaçlı storage incelemesi (kural 14 istisnası).
    storageSnapshot: () =>
      page.evaluate(() => ({
        local: Object.keys(localStorage),
        session: Object.keys(sessionStorage),
        cookie: document.cookie,
      })),
    typeInto: async (selector: string, value: string) => {
      await page.click(selector);
      await page.type(selector, value, { delay: 5 });
    },
    clickElement: async (selector: string) => {
      await page.click(selector);
    },
    submitForm: async (formSelector: string) => {
      await page.click(`${formSelector} button[type="submit"]`);
    },
    waitForText: async (selector: string, pattern: RegExp, timeoutMs = DEFAULT_TEXT_TIMEOUT_MS) => {
      const deadline = Date.now() + timeoutMs;
      let last = '';
      while (Date.now() < deadline) {
        last = await readOnlyText(selector);
        if (pattern.test(last)) return last;
        await sleep(150);
      }
      throw new Error(`Timed out waiting for ${String(pattern)} in ${selector} (last: "${last}").`);
    },
    focus: async (selector: string) => {
      await page.focus(selector);
    },
    press: async (key: KeyInput) => {
      await page.keyboard.press(key);
    },
    selectValue: async (selector: string, value: string) => {
      await page.select(selector, value);
    },
    queryTexts: async (selector: string) =>
      page.$$eval(
        selector,
        (elements) => elements.map((element) => element.textContent ?? ''),
      ),
    countElements: async (selector: string) =>
      page.$$eval(selector, (elements) => elements.length),
    /**
     * Kimlik alanlarını GERÇEK klavye etkileşimiyle boşaltır (DOM enjeksiyonu
     * yok). Böylece ekran görüntüleri maskeli kalır.
     */
    maskCredentialInputs: async () => {
      for (const selector of ['#password', '#email']) {
        const element = await page.$(selector);
        if (!element) continue;
        await page.click(selector);
        await page.keyboard.down('Control');
        await page.keyboard.press('KeyA');
        await page.keyboard.up('Control');
        await page.keyboard.press('Backspace');
      }
    },
    screenshot: async (name: string) => {
      input.index.value += 1;
      // puppeteer v24 expects a literal-typed '.png' path; the assertion keeps
      // the artefact extension contract visible to the type system.
      const file = path.join(
        input.screenshotDir,
        `${String(input.index.value).padStart(2, '0')}-${name}.png`,
      ) as `${string}.png`;
      await page.screenshot({ path: file, fullPage: true });
      return path.relative(path.dirname(input.screenshotDir), file).replace(/\\/g, '/');
    },
    setViewport: async (width: number, height: number) => {
      await page.setViewport({ width, height });
    },
    setOffline: async (offline: boolean) => {
      await page.setOfflineMode(offline);
    },
    withDelayedRequest: async <T>(
      urlFragment: string,
      delayMs: number,
      action: () => Promise<T>,
    ): Promise<T> => {
      await page.setRequestInterception(true);
      const handler = (request: import('puppeteer-core').HTTPRequest): void => {
        if (request.url().includes(urlFragment)) {
          setTimeout(() => {
            request.continue().catch(() => undefined);
          }, delayMs);
        } else {
          request.continue().catch(() => undefined);
        }
      };
      page.on('request', handler);
      try {
        return await action();
      } finally {
        page.off('request', handler);
        await page.setRequestInterception(false).catch(() => undefined);
      }
    },
    axeScan: async (options = {}) => {
      await page.addScriptTag({ path: resolveAxeSource() });
      // Selector resolution happens INSIDE the page context; passing `document`
      // from the Node test process would throw `ReferenceError: document is not
      // defined` (observed in CI run 41210193163).
      const context = options.include ?? null;
      const result = await page.evaluate(async (selector: string | null) => {
        // `axe` is injected by addScriptTag above; the check keeps a missing
        // injection from reading as a clean scan (fail-closed).
        const axeRuntime = (globalThis as unknown as { axe?: { run: Function } }).axe;
        if (axeRuntime === undefined || typeof axeRuntime.run !== 'function') {
          throw new Error('axe-core was not injected into the page.');
        }
        const target = selector === null ? document : document.querySelector(selector);
        if (target === null) throw new Error(`axeScan target not found: ${String(selector)}`);
        const scan = await axeRuntime.run(target, {
          runOnly: {
            type: 'tag',
            values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
          },
        });
        return (scan.violations ?? []).map((violation: {
          id: string;
          impact: string | null;
          help: string;
          nodes: unknown[];
        }) => ({
          id: violation.id,
          impact: violation.impact,
          help: violation.help,
          nodes: violation.nodes.length,
        }));
      }, context);
      return result as AxeViolation[];
    },
    hasHorizontalOverflow: async () =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 ||
          document.body.scrollWidth > document.body.clientWidth + 1,
      ),
    startTrace: async (filePath: string) => {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      traceState.path = filePath;
      await page.tracing.start({
        path: filePath as `${string}.json`,
        screenshots: false,
        categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline'],
      });
    },
    stopTrace: async () => {
      const target = traceState.path;
      if (target === null) throw new Error('stopTrace called without startTrace.');
      await page.tracing.stop();
      traceState.path = null;
      const result = sanitizeTraceFile(target);
      return { path: target, redactionFindings: result.findings };
    },
    close: async () => {
      await page.close();
    },
  };

  return Object.freeze(session);
}

export async function launchE2eBrowser(): Promise<Browser> {
  const chromium = loadSparticuzChromium();
  const executablePath = await chromium.executablePath();
  if (!fs.existsSync(executablePath)) {
    throw new E2eEnvironmentError(
      '@sparticuz/chromium did not provide a runnable browser executable after npm ci.',
    );
  }

  return puppeteer.launch({
    executablePath,
    args: Array.from(
      new Set([
        ...chromium.args,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ]),
    ),
    ...(chromium.headless === undefined ? {} : { headless: chromium.headless }),
    timeout: 90_000,
    protocolTimeout: 90_000,
  });
}

export const PHONE_LEAK_PATTERN =
  /(?<![0-9A-Za-z])(?:\+90|0090|0)?\s?5\d{2}[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}(?![0-9A-Za-z])/;

/**
 * PII/secret sızıntı taraması. Kabul artefaktları (DOM metni, report.json,
 * screenshot öncesi ekran) bu kurala uymak zorundadır.
 */
export function scanTextForLeaks(text: string): string[] {
  const value = String(text ?? '');
  const findings: string[] = [];
  if (/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/.test(value)) {
    findings.push('jwt-token');
  }
  if (/Bearer\s+[A-Za-z0-9._~+/=-]{12,}/.test(value)) {
    findings.push('authorization-header');
  }
  if (/Invalid credentials|QueryFailedError|stack trace|credential_hash|password hash/i.test(value)) {
    findings.push('raw-backend-detail');
  }
  // Sınırlar: eşleşme bir harf ya da rakama bitişik olamaz. Sadece rakam
  // sınırı yetmiyordu: deterministik `studentRef` gibi hex özetlerin içinde
  // `5471383712fd76…` gibi rastgele 10 haneli diziler gerçek telefonla
  // karışıyordu (CI'da `phone-like-value` yanlış pozitifi). Gerçek telefonlar
  // (`+90 532 123 45 67`, `05321234567`) ayraç ya da metin sınırıyla
  // ayrıldığından tarama zayıflamaz.
  if (PHONE_LEAK_PATTERN.test(value)) {
    findings.push('phone-like-value');
  }
  for (const match of value.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) {
    const email = match[0];
    // Yalnız sentetik fixture alan adı kabul edilir; gerçek görünümlü e-posta
    // (veli/öğretmen iletişim bilgisi) release blocker'dır.
    if (!email.toLowerCase().endsWith('@qa.invalid')) {
      findings.push(`non-synthetic-email:${email}`);
    }
  }
  return Array.from(new Set(findings));
}
