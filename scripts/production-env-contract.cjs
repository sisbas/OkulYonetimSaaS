'use strict';

/**
 * Production environment contract definitions.
 *
 * - Name: env var adı
 * - Required: production'da zorunlu mu (bootstrap-fatalsı / lazy / opsiyonel)
 * - MinBytes: minimum byte uzunluğu (≥32 = 256-bit). "chars" if exact-byte contract.
 * - Scope: production | preview | development (hangı scope'ta aktif olduğu)
 * - Kind: "bootstrap" | "lazy" | "optional"
 * - Deprecated: bu turda bu değişken eklenmeyecek/kaydedilecek
 *
 * Bu dosya DEĞERLERİ YOK; yalnız sözleşmeyi ve receipt'ı dışarıya bastırır.
 * Herhangi bir sır/anahtar buraya yazılmaz.
 */

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'artifacts', '332');
const contractPath = path.join(outDir, 'production-env-contract.json');

const envContract = [
  // JWT signing secrets — bootstrap fatalsı; ≥32 karakter; production
  {
    name: 'JWT_ACCESS_SECRET',
    required: true,
    minBytes: 32,
    kind: 'bootstrap',
    scope: 'production',
    description: 'JWT access token signing secret (≥32 chars). Refuses to boot if missing or weak in production.',
  },
  {
    name: 'JWT_REFRESH_SECRET',
    required: true,
    minBytes: 32,
    kind: 'bootstrap',
    scope: 'production',
    description: 'JWT refresh token signing secret (≥32 chars). Required at login.',
  },
  // Audit HMAC key — bootstrap fatalsı; ≥32 karakter; production
  {
    name: 'AUDIT_HMAC_KEY',
    required: true,
    minBytes: 32,
    kind: 'bootstrap',
    scope: 'production',
    description:
      'Audit chain HMAC-SHA256 key (≥32 chars). Refuses to boot if missing or weak in production. Every durable audit row is chained and signed with this key.',
  },
  {
    name: 'AUDIT_HMAC_KEY_ID',
    required: true,
    minBytes: 1,
    kind: 'bootstrap',
    scope: 'production',
    description: 'Key identifier for audit HMAC rotation. Defaults to "key-1".',
  },
  // KVKK pseudonym key — lazy; ≥32 karakter; production (bu turda eklenmiyor / deferred)
  {
    name: 'KVKK_PSEUDONYM_KEY',
    required: false,
    minBytes: 32,
    kind: 'lazy',
    scope: 'production',
    description:
      'Deterministic pseudonymization key for student/tenant/session UUIDs. Lazy: missing in production causes fail-closed in pseudonym generation but not bootstrap.',
    deferred: true,
    deprecationNote: 'Deferred this round per decision; notification/pseudonym flows may fail-closed in production.',
  },
  // KVKK contact key — exact 32 bytes; production (bu turda eklenmiyor / deferred)
  {
    name: 'KVKK_CONTACT_KEY',
    required: false,
    exactBytes: 32,
    kind: 'lazy',
    scope: 'production',
    description:
      'AES-256-GCM envelope key for parent contact values. Exactly 32 bytes. Lazy: missing causes fail-closed decrypt in parent-contact flows but not bootstrap.',
    deferred: true,
    deprecationNote: 'Deferred this round per decision; parent-contact encrypted flows may fail-closed in production.',
  },
  // KVKK contact key ID — lazy
  {
    name: 'KVKK_CONTACT_KEY_ID',
    required: false,
    minBytes: 1,
    kind: 'lazy',
    scope: 'production',
    description: 'Key identifier for KVKK contact key rotation. Defaults to current version tag.',
    deferred: true,
  },
  // Database — already present; listed for contract completeness
  {
    name: 'DATABASE_URL',
    required: true,
    kind: 'bootstrap',
    scope: 'production',
    description: 'PostgreSQL connection URL for application runtime.',
  },
  // Node environment
  {
    name: 'NODE_ENV',
    required: false,
    kind: 'optional',
    scope: 'all',
    description: 'Application environment. Must be "production" in production scope.',
  },
];

// Write contract JSON (values never included; only schema + flags)
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}
fs.writeFileSync(contractPath, JSON.stringify(envContract, null, 2));
console.log(`Production env contract written to ${contractPath} (value-free schema).`);

// Also produce a human-readable receipt (secret-free)
const receiptLines = [
  '# Production Environment Contract Receipt (value-free)',
  `Generated: ${new Date().toISOString()}`,
  '',
  '| Variable | Required in Production? | Kind | Scope | Deferred This Round? |',
  '|---|---|---|---|---|',
];

for (const v of envContract) {
  const req = v.required === true ? '✅' : '❌';
  const kind = v.kind;
  const scope = v.scope;
  const def = v.deferred === true ? '✅ deferred' : '❌ no';
  receiptLines.push(`| \`${v.name}\` | ${req} | ${kind} | ${scope} | ${def} |`);
}
receiptLines.push('');
fs.appendFileSync(path.join(outDir, 'production-env-contract-receipt.md'), receiptLines.join('\n'));
console.log(`Receipt written to ${path.join(outDir, 'production-env-contract-receipt.md')} (secret-free).`);