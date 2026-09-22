import * as fs from 'node:fs';
import * as path from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { E2eEnvironmentError } from './env';

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

export type UiSession = Readonly<{
  page: Page;
  consoleErrors: string[];
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
  maskCredentialInputs: () => Promise<void>;
  screenshot: (name: string) => Promise<string>;
  close: () => Promise<void>;
}>;

const DEFAULT_TEXT_TIMEOUT_MS = 10_000;
const RESPONSE_TIMEOUT_MS = 20_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function createUiSession(input: Readonly<{
  browser: Browser;
  baseUrl: string;
  screenshotDir: string;
  index: { value: number };
}>): Promise<UiSession> {
  fs.mkdirSync(input.screenshotDir, { recursive: true });

  const page = await input.browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  const readOnlyText = async (selector: string): Promise<string> =>
    page.$eval(selector, (element) => element.textContent ?? '').catch(() => '');

  const session: UiSession = {
    page,
    consoleErrors,
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
  if (/(?:\+90|0090|0)?\s?5\d{2}[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}/.test(value)) {
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
