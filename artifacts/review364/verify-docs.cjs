// Documentation/source assertions; no runtime or production acceptance claim.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execFileSync, spawnSync } = require('node:child_process');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const main = '9bd8d5dc333cdfe575e2500ff6e2828673edcc84';
const base = main;
const docPath = 'artifacts/H1-H2/H1-prod-env-and-health.md';
const source = (path) => git('show', `${main}:${path}`);
assert.equal(git('rev-parse', 'origin/main'), main, 'Refresh source snapshot if main changes');
const changed = new Set([
  ...git('diff', '--name-only', base).split('\n'),
  ...git('ls-files', '--others', '--exclude-standard').split('\n'),
].filter(Boolean));
for (const path of changed) assert.match(path, /^(artifacts\/H1-H2\/H1-prod-env-and-health\.md|artifacts\/review364\/)/);
const app = source('src/app.module.ts').replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
assert.match(app, /import\s*\{\s*AuditModule\s*\}/);
const imports = app.match(/@Module\(\{\s*imports:\s*\[([\s\S]*?)\],/)[1];
assert.doesNotMatch(imports, /\bAuditModule\b/);
assert.match(source('src/common/audit/audit.module.ts'), /providers:[\s\S]*AuditQueryService/);
assert.match(source('src/common/audit/audit-query.service.ts'), /constructor\([\s\S]*?resolveAuditHmacKeyRing\(\)/);
assert.match(source('src/common/audit/audit-query.service.ts'), /resolveHmacKey: auditHmacKeyResolver\(keyRing\)/);
assert.doesNotMatch(source('src/auth/auth.service.ts'), /JWT_KEY_ID|\bkeyid\b|\bkid\b/);
const jwtReads = spawnSync('git', ['grep', '-n', 'JWT_KEY_ID', main, '--', 'src'], { encoding: 'utf8' });
assert.equal(jwtReads.status, 1, 'JWT_KEY_ID must remain absent from runtime source');
const checkpoint = source('src/common/audit/audit-query.service.ts').split('async lastCheckpoint()')[1];
assert.doesNotMatch(checkpoint.match(/SELECT[\s\S]*?FROM audit_chain_checkpoints/)[0], /\bsignature\b/);
const rules = JSON.parse(execFileSync('gh', ['api', 'repos/sisbas/OkulYonetimSaaS/rulesets/19052349'], { encoding: 'utf8' }));
const prRules = rules.rules.find((r) => r.type === 'pull_request').parameters;
assert.equal(prRules.required_review_thread_resolution, true);
assert.equal(prRules.required_approving_review_count, 0);
assert.equal(rules.rules.find((r) => r.type === 'required_status_checks').parameters.required_status_checks.length, 10);
assert.match(source('docs/phase2/progress-v2.md'), /main'e merge olduktan sonra/);
const decision = JSON.parse(execFileSync('gh', ['issue', 'view', '368', '--json', 'state'], { encoding: 'utf8' }));
assert.equal(decision.state, 'OPEN');
function validate(doc) {
  assert.match(doc, /runtime desteği BLOKLU/);
  assert.match(doc, /boot'ta FATAL\s+garantisi yoktur/);
  assert.match(doc, /#367 \/ PR #366 güvenli wiring/);
  assert.match(doc, /retention erişilebilirliği\s+veya güvenliği iddia etmez/);
  assert.match(doc, /şu an bu pakete dayanarak `AUDIT_HMAC_KEY` rotasyonu yapmamalıdır/);
  assert.match(doc, /JWT_KEY_ID[^\n]*Desteklenmiyor/);
  assert.match(doc, /POLICY_DEADLOCK #368/);
  assert.doesNotMatch(doc, /rotasyonu — \*\*DESTEKLENİYOR\*\*/);
}
const doc = fs.readFileSync(docPath, 'utf8');
assert.doesNotMatch(doc, /^(<<<<<<<|=======|>>>>>>>)/m, 'Unresolved merge marker');
validate(doc);
assert.throws(() => validate(doc.replace('runtime desteği BLOKLU', 'DESTEKLENİYOR')));
assert.throws(() => validate(doc.replace("garantisi yoktur", 'garantisi vardır')));
assert.throws(() => validate(doc.replace('Desteklenmiyor', 'Destekleniyor')));
const body = fs.readFileSync('artifacts/review364/pr-body.md', 'utf8').replace(/\r\n/g, '\n');
for (const heading of ['Amaç', 'Kapsam', 'Kapsam dışı', 'Acceptance criteria', 'Test çıktısı', 'KVKK/audit etkisi', 'Rollback', 'CI run referansı', 'Issue reference']) {
  assert.ok(body.includes(`## ${heading}\n`), `Missing PR body heading: ${heading}`);
}
assert.match(body, /yeni Draft correction PR/);
assert.match(body, /Post-merge/);
assert.match(body, /Refs #332 #259 #358 #367 #368/);
console.log('PASS: docs scope, current-main disconnected wiring/key-ring/checkpoint/JWT source, live 10-context/0-approval ruleset, OPEN #368; 3 negative documentation mutations rejected. No runtime acceptance inferred.');
