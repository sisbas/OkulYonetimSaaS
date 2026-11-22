'use strict';

/**
 * Seed a synthetic admin into the Neon branch that backs a PR's Vercel preview.
 *
 * Vercel × Neon creates one branch per preview: `preview/<git-branch>`.
 * The shared PREVIEW_DATABASE_URL admin (#503) is therefore not available in a
 * PR-specific preview database. This script resolves that branch through the
 * Neon API, obtains a connection URI, and delegates the actual insert/reset to
 * the existing create-preview-admin.cjs / reset-preview-admin.cjs guards.
 *
 * Safety:
 * - requires explicit `confirm=preview`;
 * - refuses the known production Neon endpoint;
 * - never prints the connection URI or password;
 * - only touches the single branch matching the requested git branch.
 */
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { Client } = require('pg');
const { isProductionHost } = require('./create-preview-admin.cjs');

const NEON_API = 'https://console.neon.tech/api/v2';
const DEFAULT_DATABASE = 'neondb';
const DEFAULT_ROLE = 'neondb_owner';
const ADMIN_EMAIL = 'preview-admin@okul.example';
const ADMIN_FULL_NAME = 'Önizleme Yöneticisi';

function previewBranchCandidates(branch) {
  const raw = String(branch || '').trim().replace(/^refs\/heads\//, '');
  if (!raw) return [];
  const slug = raw.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return [
    `preview/${raw}`,
    `preview/${slug}`,
    `preview/${raw.replace(/\//g, '-')}`,
    slug,
  ].filter(Boolean);
}

function selectBranch(branches, branch) {
  const wanted = new Set(previewBranchCandidates(branch).map((name) => name.toLowerCase()));
  return (Array.isArray(branches) ? branches : []).find((item) =>
    wanted.has(String(item?.name || '').toLowerCase()),
  ) || null;
}

function connectionUriUrl(projectId, branchId, databaseName, roleName) {
  const url = new URL(`${NEON_API}/projects/${encodeURIComponent(projectId)}/connection_uri`);
  url.searchParams.set('branch_id', branchId);
  url.searchParams.set('database_name', databaseName);
  url.searchParams.set('role_name', roleName);
  url.searchParams.set('pooled', 'true');
  return url.toString();
}

async function neonApi(pathSuffix, apiKey, init = {}) {
  const response = await fetch(`${NEON_API}${pathSuffix}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`NEON_HTTP_${response.status}: ${detail.slice(0, 200)}`);
  }
  return response.json();
}

function redact(value, secrets) {
  let out = String(value ?? '');
  for (const secret of secrets) {
    if (secret) out = out.split(secret).join('<redacted>');
  }
  try {
    const host = new URL(secrets[0] || '').hostname;
    if (host) out = out.split(host).join('<redacted-host>');
  } catch {
    // not a URL; nothing extra to redact
  }
  return out;
}

async function userExists(connectionString, email) {
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 20000,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const result = await client.query('SELECT 1 FROM users WHERE lower(email) = lower($1)', [email]);
    return result.rowCount > 0;
  } finally {
    await client.end();
  }
}

async function main() {
  const confirm = String(process.env.PREVIEW_RESET_CONFIRM ?? '').trim().toLowerCase();
  if (confirm !== 'preview') throw new Error('CONFIRM_REQUIRED');

  const apiKey = String(process.env.NEON_API_KEY ?? '').trim();
  const projectId = String(process.env.NEON_PROJECT_ID ?? '').trim();
  const branchName = String(process.env.PREVIEW_BRANCH ?? '').trim();
  const password = String(process.env.ADMIN_PASSWORD ?? '');
  if (!apiKey) throw new Error('NEON_API_KEY_REQUIRED');
  if (!projectId) throw new Error('NEON_PROJECT_ID_REQUIRED');
  if (!branchName) throw new Error('PREVIEW_BRANCH_REQUIRED');
  if (password.length < 12) throw new Error('PASSWORD_TOO_SHORT');

  const databaseName = String(process.env.DATABASE_NAME || DEFAULT_DATABASE).trim();
  const roleName = String(process.env.ROLE_NAME || DEFAULT_ROLE).trim();
  const email = String(process.env.ADMIN_EMAIL || ADMIN_EMAIL).trim().toLowerCase();

  const listing = await neonApi(`/projects/${encodeURIComponent(projectId)}/branches`, apiKey);
  const branches = Array.isArray(listing?.branches) ? listing.branches : [];
  const branch = selectBranch(branches, branchName);
  if (!branch?.id) {
    throw new Error(`PREVIEW_BRANCH_NOT_FOUND: ${previewBranchCandidates(branchName).join(', ')}`);
  }

  const uriUrl = new URL(connectionUriUrl(projectId, branch.id, databaseName, roleName));
  const uriResponse = await neonApi(uriUrl.pathname + uriUrl.search, apiKey);
  const connectionString = String(uriResponse?.uri ?? '');
  if (!connectionString.startsWith('postgres')) throw new Error('CONNECTION_URI_INVALID');
  if (isProductionHost(connectionString)) throw new Error('PRODUCTION_DB_REFUSED');

  const exists = await userExists(connectionString, email);
  const script = exists ? 'reset-preview-admin.cjs' : 'create-preview-admin.cjs';
  const result = spawnSync(process.execPath, [path.join(__dirname, script)], {
    env: {
      ...process.env,
      DATABASE_URL: connectionString,
      ADMIN_EMAIL: email,
      ADMIN_FULL_NAME: ADMIN_FULL_NAME,
      ADMIN_PASSWORD: password,
      PREVIEW_RESET_CONFIRM: 'preview',
    },
    encoding: 'utf8',
  });
  const secrets = [connectionString, password, apiKey];
  if (result.error) throw new Error(redact(result.error.message, secrets));
  if (result.status !== 0) {
    throw new Error(
      `SEED_FAILED (${script}): ${redact((result.stderr || result.stdout || '').trim().split('\n')[0], secrets)}`,
    );
  }
  process.stdout.write(
    JSON.stringify({
      mode: 'PREVIEW_BRANCH_ADMIN_SEEDED',
      outcome: exists ? 'reset' : 'created',
      branch: branch.name,
      email,
      host: new URL(connectionString).hostname,
    }) + '\n',
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(String(error.message || error));
    process.exitCode = 1;
  });
}

module.exports = {
  previewBranchCandidates,
  selectBranch,
  connectionUriUrl,
  isProductionHost,
};
