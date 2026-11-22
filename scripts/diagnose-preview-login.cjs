'use strict';

/**
 * #503 — read-only probe of a Vercel preview deployment's auth surface.
 * Prints HTTP statuses and a scrubbed message only. Never logs the password,
 * tokens, response bodies or the protection bypass secret.
 */
function isTrustedPreviewUrl(base) {
  const trustedPreview = /^https:\/\/okulyonetimsaas-[a-z0-9-]+-sisbas-projects-d3c081cb\.vercel\.app$/i.test(base);
  const trustedProductionAlias = /^https:\/\/okul-yonetim-saas\.vercel\.app$/i.test(base);
  return trustedPreview || trustedProductionAlias;
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
    if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
      return { path, status: response.status, redirect: true, message: null, code: null, hasToken: false };
    }
    let parsed = null;
    try { parsed = await response.json(); } catch { /* non-JSON body ignored */ }
    return {
      path,
      status: response.status,
      message: typeof parsed?.message === 'string' ? parsed.message.slice(0, 200) : null,
      code: typeof parsed?.code === 'string' ? parsed.code.slice(0, 80) : null,
      hasToken: Boolean(parsed?.accessToken),
    };
  }

  async function safeProbe(path, options) {
    try { return await probe(path, options); }
    catch { return { path, status: 0, probeFailed: true, message: null, code: null, hasToken: false }; }
  }

  const health = await safeProbe('/api/v1/health');
  const login = await safeProbe('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  console.log(JSON.stringify({ health, login }, null, 2));
}

module.exports = { isTrustedPreviewUrl };

if (require.main === module) {
  main().catch((error) => {
    const code = /^(UNTRUSTED_PREVIEW_URL|BYPASS_SECRET_REQUIRED|CREDENTIALS_REQUIRED)$/.test(String(error.message))
      ? String(error.message) : 'PROBE_FAILED';
    console.error(code);
    process.exitCode = 1;
  });
}
