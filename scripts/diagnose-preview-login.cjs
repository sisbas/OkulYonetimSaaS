'use strict';

/**
 * #503 — read-only probe of a Vercel preview deployment's API surface.
 * Prints HTTP statuses, selected platform headers and a scrubbed, truncated
 * prefix of non-JSON bodies. Never logs the password, bypass secret, tokens,
 * emails or complete response bodies.
 */
const INTERESTING_HEADERS = ['x-vercel-error', 'x-vercel-id', 'x-matched-path', 'content-type'];

function isTrustedPreviewUrl(base) {
  const trustedPreview = /^https:\/\/okulyonetimsaas-[a-z0-9-]+-sisbas-projects-d3c081cb\.vercel\.app$/i.test(base);
  const trustedProductionAlias = /^https:\/\/okul-yonetim-saas\.vercel\.app$/i.test(base);
  return trustedPreview || trustedProductionAlias;
}

function scrubBody(value) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[email]')
    .replace(/[A-Za-z0-9_-]{32,}/g, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

async function main() {
  const base = String(process.env.PREVIEW_URL ?? '').trim().replace(/\/+$/, '');
  const bypass = String(process.env.VERCEL_BYPASS_SECRET ?? '').trim();
  const email = String(process.env.ADMIN_EMAIL ?? '').trim();
  const password = String(process.env.ADMIN_PASSWORD ?? '');
  // Yalnız bu projenin ekip alan adına ait preview/preview alias URL'leri;
  // aksi halde bypass secret ve şifre yabancı bir host'a gönderilebilir.
  if (!isTrustedPreviewUrl(base)) throw new Error('UNTRUSTED_PREVIEW_URL');
  if (!bypass) throw new Error('BYPASS_SECRET_REQUIRED');
  if (!email || !password) throw new Error('CREDENTIALS_REQUIRED');

  const headers = {
    accept: 'application/json',
    'x-vercel-protection-bypass': bypass,
  };

  async function probe(path, options = {}) {
    const response = await fetch(base + path, {
      ...options,
      headers: { ...headers, ...(options.headers ?? {}) },
      redirect: 'manual',
      signal: AbortSignal.timeout(20000),
    });
    const platform = {};
    for (const header of INTERESTING_HEADERS) {
      const value = response.headers.get(header);
      if (value) platform[header] = value.slice(0, 120);
    }
    if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
      return { path, status: response.status, redirect: true, ...platform };
    }
    const raw = await response.text();
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch { /* non-JSON body kept as a scrubbed prefix */ }
    const isNestJson = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);
    const message = !isNestJson ? null
      : Array.isArray(parsed.message) ? parsed.message.slice(0, 3)
      : typeof parsed.message === 'string' ? parsed.message.slice(0, 200)
      : null;
    return {
      path,
      status: response.status,
      ...platform,
      message,
      code: isNestJson && typeof parsed.code === 'string' ? parsed.code.slice(0, 80) : null,
      hasToken: Boolean(isNestJson && parsed.accessToken),
      bodyKind: parsed === null ? 'non-json' : 'json',
      // Hata yanıtlarında gövde, platformun nedeni (env/import/route) gösterir.
      // Başarılı yanıtlarda PII riski nedeniyle gövde hiç okunmaz/yazılmaz.
      bodyPrefix: response.status >= 400 ? scrubBody(raw) : null,
    };
  }

  async function safeProbe(path, options) {
    try { return await probe(path, options); }
    catch { return { path, status: 0, probeFailed: true }; }
  }

  const loginOptions = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  };
  const definitions = [
    ['dbInfo', '/api/dbinfo'],
    ['apiRoot', '/api/v1'],
    ['apiRootSlash', '/api/v1/'],
    ['health', '/api/v1/health'],
    ['login', '/api/v1/auth/login', loginOptions],
    ['loginGet', '/api/v1/auth/login'],
    ['authNested', '/api/v1/auth/__probe'],
    ['unknownNested', '/api/v1/__probe'],
    ['healthAfterWarmup', '/api/v1/health'],
  ];
  const results = {};
  for (const [name, path, options] of definitions) {
    results[name] = await safeProbe(path, options);
  }
  console.log(JSON.stringify(results, null, 2));
}

module.exports = { isTrustedPreviewUrl, scrubBody };

if (require.main === module) {
  main().catch((error) => {
    const code = /^(UNTRUSTED_PREVIEW_URL|BYPASS_SECRET_REQUIRED|CREDENTIALS_REQUIRED)$/.test(String(error.message))
      ? String(error.message) : 'PROBE_FAILED';
    console.error(code);
    process.exitCode = 1;
  });
}
