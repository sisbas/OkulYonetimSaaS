// Documentation/source assertions; no runtime or production acceptance claim.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execFileSync, spawnSync } = require('node:child_process');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const main = 'b3e1a359c6f5b7dbf27d88daac5fd5395c5ebf48';
const base = git('merge-base', main, 'HEAD');
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
assert.match(imports, /\bAuditModule\b/);
assert.match(source('src/common/audit/audit.module.ts'), /providers:[\s\S]*AuditQueryService/);
assert.match(source('src/common/audit/audit-query.service.ts'), /constructor\([\s\S]*?resolveAuditHmacKeyRing\(\)/);
assert.match(source('src/common/audit/audit-query.service.ts'), /resolveHmacKey: auditHmacKeyResolver\(keyRing\)/);
const controller = source('src/common/audit/audit.controller.ts');
assert.match(controller, /@Get\('verify'\)/);
assert.match(controller, /throw new ForbiddenException\('Audit verification is unavailable'\)/);
assert.doesNotMatch(controller, /@Post\('retention\/(?:plan|run)'\)/);
assert.doesNotMatch(controller, /this\.query\.verify/);
assert.doesNotMatch(source('src/auth/auth.service.ts'), /JWT_KEY_ID|\bkeyid\b|\bkid\b/);
const jwtReads = spawnSync('git', ['grep', '-n', 'JWT_KEY_ID', main, '--', 'src'], { encoding: 'utf8' });
assert.equal(jwtReads.status, 1, 'JWT_KEY_ID must remain absent from runtime source');
const checkpoint = source('src/common/audit/audit-query.service.ts').split('async lastCheckpoint()')[1];
assert.match(checkpoint.match(/SELECT[\s\S]*?FROM audit_chain_checkpoints/)[0], /\bsignature\b/);
assert.match(checkpoint, /timingSafeEqual/);
assert.match(checkpoint, /signAuditEntryHash/);
assert.match(source('docs/security/audit-http-quarantine.md'), /returns a controlled 403/);
assert.match(source('docs/security/audit-http-quarantine.md'), /Neither[\s\S]*retention\/plan[\s\S]*retention\/run/);
assert.match(source('test/runtime-integration/api-routing-authority.spec.ts'), /retention/);
const rules = JSON.parse(execFileSync('gh', ['api', 'repos/sisbas/OkulYonetimSaaS/rulesets/19052349'], { encoding: 'utf8' }));
const prRules = rules.rules.find((r) => r.type === 'pull_request').parameters;
assert.equal(prRules.required_review_thread_resolution, true);
assert.equal(prRules.required_approving_review_count, 0);
assert.equal(rules.rules.find((r) => r.type === 'required_status_checks').parameters.required_status_checks.length, 10);
assert.match(source('docs/phase2/progress-v2.md'), /main'e merge olduktan sonra/);
const decision = JSON.parse(execFileSync('gh', ['issue', 'view', '368', '--json', 'state'], { encoding: 'utf8' }));
assert.equal(decision.state, 'OPEN');
const authority = JSON.parse(execFileSync('gh', ['issue', 'view', '373', '--json', 'state'], { encoding: 'utf8' }));
assert.equal(authority.state, 'OPEN');
function validate(doc) {
  assert.match(doc, /`AuditModule` main runtime'ında kayıtlıdır/);
  assert.match(doc, /resolveAuditHmacKeyRing\(\).*Nest provider oluşturulurken çalışır/s);
  assert.match(doc, /GET \/api\/v1\/audit\/verify[\s\S]*?403/);
  assert.match(doc, /retention\/plan.*retention\/run/s);
  assert.match(doc, /#373 OPEN/);
  assert.match(doc, /production 200 kanıtı[\s\S]*bu pakette yoktur/);
  assert.match(doc, /bu pakete dayanarak `AUDIT_HMAC_KEY` rotasyonu yapmamalıdır/);
  assert.match(doc, /#358.*Checkpoint imza doğrulaması main'de uygulanmıştır/s);
  assert.match(doc, /JWT_KEY_ID[^\n]*Desteklenmiyor/);
  assert.match(doc, /POLICY_DEADLOCK #368/);
  assert.doesNotMatch(doc, /rotasyonu — \*\*DESTEKLENİYOR\*\*/);
}
const doc = fs.readFileSync(docPath, 'utf8');
assert.doesNotMatch(doc, /^(<<<<<<<|=======|>>>>>>>)/m, 'Unresolved merge marker');
validate(doc);
assert.throws(() => validate(doc.replace("`AuditModule` main runtime'ında kayıtlıdır", "`AuditModule` main runtime'ında kayıtlı değildir")));
assert.throws(() => validate(doc.replace('kontrollü **403**', 'kontrollü **200**')));
assert.throws(() => validate(doc.replace('bu pakete dayanarak `AUDIT_HMAC_KEY` rotasyonu yapmamalıdır', '`AUDIT_HMAC_KEY` rotasyonu yapılabilir')));
assert.throws(() => validate(doc.replace('Desteklenmiyor', 'Destekleniyor')));
const body = fs.readFileSync('artifacts/review364/pr-body.md', 'utf8').replace(/\r\n/g, '\n');
for (const heading of ['Amaç', 'Kapsam', 'Kapsam dışı', 'Acceptance criteria', 'Test çıktısı', 'KVKK/audit etkisi', 'Rollback', 'CI run referansı', 'Issue reference']) {
  assert.ok(body.includes(`## ${heading}\n`), `Missing PR body heading: ${heading}`);
}
assert.match(body, /Draft correction PR/);
assert.match(body, /#366.*#369.*main/);
assert.match(body, /Refs #332 #259 #358 #367 #368 #373/);
console.log('PASS: docs scope, current-main safe audit wiring/quarantine/checkpoint/JWT source, live governance ruleset, OPEN #368/#373; 4 negative documentation mutations rejected. No production/runtime acceptance inferred.');
