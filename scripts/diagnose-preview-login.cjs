'use strict';

/**
 * #503 — read-only probe of a Vercel preview deployment's auth surface.
 * Prints HTTP statuses and a scrubbed message only. Never logs the password,
 * tokens, response bodies or the protection bypass secret.
 */
async function main() {
  const base = String(process.env.PREVIEW_URL ?? '').trim().replace(/\/+$/, '');
  const bypass = String(process.env.VERCEL_BYPASS_SECRET ?? '').trim();
  const email = String(process.env.ADMIN_EMAIL ?? '').trim();
  const password = String(process.env.ADMIN_PASSWORD ?? '');
  if (!/^https:\/\/[a-z0-9.-]+\.vercel\.app$/i.test(base)) throw new Error('BAD_PREVIEW_URL');
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
      signal: AbortSignal.timeout(20000),
    });
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

  const health = await probe('/api/v1/health');
  const login = await probe('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  console.log(JSON.stringify({ health, login }, null, 2));
}

main().catch((error) => {
  const code = /^(BAD_PREVIEW_URL|BYPASS_SECRET_REQUIRED|CREDENTIALS_REQUIRED)$/.test(String(error.message))
    ? String(error.message) : 'PROBE_FAILED';
  console.error(code);
  process.exitCode = 1;
});
