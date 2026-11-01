'use strict';

/**
 * check-production-env.cjs
 *
 * Production environment varlık + uzunluk doğrulaması.
 * - Sadece varlık ve sınıf kontrol eder; değer HERHANGİ BİRİ ŞİİRLENEMEZ.
 * - Çıktı: secret-free receipt (ad → present/absent, sınıf, "deferred residual").
 * - Hata fırlatmaz; exit code 0 her şeye karşılık, receipt yazar.
 */

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'artifacts', '332');
const receiptPath = path.join(outDir, 'check-production-env-receipt.json');

const envContract = [
  { name: 'JWT_ACCESS_SECRET',     required: true,  minBytes: 32, kind: 'bootstrap', scope: 'production' },
  { name: 'JWT_REFRESH_SECRET',    required: true,  minBytes: 32, kind: 'bootstrap', scope: 'production' },
  { name: 'AUDIT_HMAC_KEY',        required: true,  minBytes: 32, kind: 'bootstrap', scope: 'production' },
  { name: 'AUDIT_HMAC_KEY_ID',     required: true,  minBytes: 1,  kind: 'bootstrap', scope: 'production' },
  { name: 'KVKK_PSEUDONYM_KEY',    required: false, minBytes: 32, kind: 'lazy',      scope: 'production', deferred: true },
  { name: 'KVKK_CONTACT_KEY',      required: false, exactBytes: 32, kind: 'lazy',  scope: 'production', deferred: true },
  { name: 'KVKK_CONTACT_KEY_ID',   required: false, minBytes: 1,  kind: 'lazy',      scope: 'production' },
  { name: 'DATABASE_URL',          required: true,  kind: 'bootstrap', scope: 'production' },
  { name: 'NODE_ENV',              required: false, kind: 'optional',   scope: 'all' },
];

function hexBytes(value) {
  // value hex string -> byte length
  if (!value) return 0;
  const v = String(value).trim();
  if (v.length % 2 !== 0) return 0; // odd hex = invalid
  return v.length / 2;
}

function checkBytes(value, kind) {
  if (value === undefined || value === null || String(value).trim().length === 0) {
    return { present: false, kind, length: 0, meets: false };
  }
  const v = String(value).trim();
  if (kind === 'exactBytes') {
    const bytes = hexBytes(v);
    return { present: true, kind, length: bytes, meets: bytes === 32 };
  }
  if (kind === 'minBytes') {
    const bytes = v.length; // char count as proxy; for JWT secrets we treat char≥32 as sufficient
    return { present: true, kind, length: bytes, meets: bytes >= 32 };
  }
  return { present: true, kind, length: v.length, meets: true };
}

// Build result
const result = {
  checkedAt: new Date().toISOString(),
  headSha: process.env.GITHUB_SHA || process.env.GIT_COMMIT || 'unknown',
  environment: process.env.NODE_ENV || 'unknown',
  variables: {},
};

// Check each variable against the .env or process.env
for (const spec of envContract) {
  const val = process.env[spec.name];
  const check = checkBytes(val, spec.minBytes !== undefined ? 'minBytes' : (spec.exactBytes !== undefined ? 'exactBytes' : 'present'));

  result.variables[spec.name] = {
    present: check.present,
    kind: spec.kind,
    scope: spec.scope,
    // !!NEVER!! write the secret value; only length class
    lengthClass: check.present ? (check.meets ? '✅ meets' : '❌ weak/too short') : '❌ absent',
    deferred: spec.deferred || false,
  };

  // If required and absent in production → note but do NOT throw (fail-closed is application code's job)
  if (spec.required && !check.present && process.env.NODE_ENV?.toLowerCase() === 'production') {
    // Log to stderr quietly; do not crash
    process.stderr.write(`[check-production-env] ${spec.name}: required but absent in production. Application will fail-closed.\n`);
  }
}

// Write secret-free receipt
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}
fs.writeFileSync(receiptPath, JSON.stringify(result, null, 2));
console.log(`Production env check complete. Receipt written to ${receiptPath} (no secret values).`);

// Exit 0 always — this is a diagnostic, not a bootstrap gate
process.exit(0);