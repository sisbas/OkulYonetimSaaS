// Read-only documentation/source guard; never executes the proposed H6 commands.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execFileSync, spawnSync } = require('node:child_process');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const main = '9bd8d5dc333cdfe575e2500ff6e2828673edcc84';
const source = (path) => git('show', `${main}:${path}`);
const api = (path) => JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8' }));
const pr = api('repos/sisbas/OkulYonetimSaaS/pulls/365');
assert.equal(pr.base.ref, 'main');
assert.match(pr.base.sha, /^[a-f0-9]{40}$/);
// A fresh Actions checkout can be shallow. Restore ancestry, not an arbitrary
// intermediate review revision, before determining the actual PR merge-base.
if (git('rev-parse', '--is-shallow-repository') === 'true') {
  git('fetch', '--no-tags', '--unshallow', 'origin');
}
if (spawnSync('git', ['rev-parse', '--verify', 'origin/main']).status !== 0) {
  git('fetch', '--no-tags', 'origin', 'refs/heads/main:refs/remotes/origin/main');
}
if (spawnSync('git', ['cat-file', '-e', `${pr.base.sha}^{commit}`]).status !== 0) {
  git('fetch', '--no-tags', 'origin', pr.base.sha);
}
const base = git('merge-base', 'HEAD', pr.base.sha);
assert.equal(git('rev-parse', 'origin/main'), main);
const changed = new Set([...git('diff', '--name-only', base).split('\n'), ...git('ls-files', '--others', '--exclude-standard').split('\n')].filter(Boolean));
function validateScope(paths) {
  for (const path of paths) assert.match(path, /^(docs\/phase2\/milestone-issue-reconciliation\.md|artifacts\/review365\/)/);
}
validateScope(changed);
assert.ok(changed.has('docs/phase2/milestone-issue-reconciliation.md'), 'Entire PR document must be in scope');
assert.throws(() => validateScope([...changed, 'src/out-of-scope.ts']));
console.log(`Scope merge-base: ${base}; live PR base: ${pr.base.sha}; full PR paths: ${changed.size}`);
assert.match(source('docs/phase2/README.md'), /next-phase-plan.md[^\n]*BAYAT/);
const plan = source('docs/phase2/remaining-plan-v2.md');
assert.match(plan, /F3[^\n]*Hafta 6–8[^\n]*R12–R15/);
assert.match(plan, /\*\*R12\*\*[^\n]*#268/);
assert.match(source('docs/phase2/next-phase-plan.md'), /milestones\/7[^\n]*2026-12-04[^\n]*M7/);
const milestoneList = api('repos/sisbas/OkulYonetimSaaS/milestones?state=all&per_page=100');
assert.equal(milestoneList.length, 8);
assert.equal(milestoneList.find((m) => m.title === 'M7').number, 8);
assert.equal(milestoneList.find((m) => m.number === 7).title, 'M6');
assert.ok(milestoneList.every((m) => m.due_on === null), 'No proposed dates have been applied');
for (const number of [3, 4]) {
  const m = milestoneList.find((m) => m.number === number);
  assert.equal(m.state, 'open');
  assert.equal(m.open_issues, 0);
}
const issue = api('repos/sisbas/OkulYonetimSaaS/issues/339');
assert.equal(issue.state, 'open');
assert.match(issue.body, /Architecture, Security, KVKK, Data ve QA verdict/);
assert.equal((issue.body.match(/- \[ \]/g) || []).length, 12);
assert.equal(spawnSync('git', ['cat-file', '-e', `${main}:artifacts/verify/R4/verdict.md`]).status, 128);
const rules = api('repos/sisbas/OkulYonetimSaaS/rulesets/19052349');
const required = rules.rules.find((r) => r.type === 'required_status_checks').parameters.required_status_checks.map((c) => c.context);
assert.equal(required.length, 10);
assert.equal(rules.rules.find((r) => r.type === 'pull_request').parameters.required_approving_review_count, 0);
assert.equal(rules.rules.find((r) => r.type === 'pull_request').parameters.required_review_thread_resolution, true);
assert.match(source('docs/phase2/progress-v2.md'), /main'e merge olduktan sonra/);
assert.equal(api('repos/sisbas/OkulYonetimSaaS/issues/368').state, 'open');
function validate(doc) {
  assert.match(doc, /AÇIK \/ BLOCKED/);
  assert.match(doc, /BLOCKED — Architecture, Security, KVKK, Data\/DB, QA/);
  assert.match(doc, /required_approving_review_count=0/);
  assert.match(doc, /POLICY_DEADLOCK #368 OPEN/);
  for (const context of required) assert.ok(doc.includes(context), `Missing required context ${context}`);
  assert.match(doc, /\*\*#268 R12'yi F3 \(hafta 6–8\)\*\*/);
  assert.match(doc, /H6 owner onayına sunulan hesaplı öneri/);
  assert.doesNotMatch(doc, /KAPATILABİLİR|tüm on zorunlu context SUCCESS/);
  const commands = doc.match(/```bash\n([\s\S]*?)```/)[1];
  const dates = [...commands.matchAll(/milestones\/(\d+) -f due_on=([^\s]+)/g)];
  assert.deepEqual(dates.map((m) => Number(m[1])).sort(), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(dates.find((m) => m[1] === '8')[2], '2026-11-18T00:00:00Z');
  for (const number of ['1', '6']) {
    assert.equal(dates.find((m) => m[1] === number)[2], '2026-11-18T00:00:00Z');
  }
  assert.equal(dates.find((m) => m[1] === '7')[2], '2026-11-04T00:00:00Z');
  assert.match(commands, /for n in 358 329 332 362 345;[^\n]*"Phase 1b Closure"/);
  assert.match(commands, /for n in 344;[^\n]*"Phase 2 - Commercial Release"/);
  assert.doesNotMatch(commands, /for n in [^;]*345;[^\n]*"Phase 2 - Commercial Release"/);
  assert.equal((commands.match(/-X POST[^\n]*-f due_on=/g) || []).length, 2);
  assert.match(doc, /9\/9[^\n]*10\/10/);
}
const doc = fs.readFileSync('docs/phase2/milestone-issue-reconciliation.md', 'utf8').replace(/\r\n/g, '\n');
validate(doc);
assert.throws(() => validate(doc.replace('AÇIK / BLOCKED', 'KAPATILABİLİR')));
assert.throws(() => validate(doc.replace('milestones/8 -f due_on=2026-11-18', 'milestones/8 -f due_on=2026-10-31')));
assert.throws(() => validate(doc.replace('milestones/2 -f due_on=', 'milestones/99 -f due_on=')));
assert.throws(() => validate(doc.replace('milestones/6 -f due_on=2026-11-18', 'milestones/6 -f due_on=2026-10-24')));
assert.throws(() => validate(doc.replace('for n in 344;', 'for n in 344 345;')));
console.log('PASS: docs-only scope; live 10 contexts/0 approvals; #339 12 unchecked ACs; missing verdict artifact; milestone dependent-phase dates and 8/8,9/9,10/10 command arithmetic; #345 Phase 1b ownership; OPEN #368; 5 negative mutations rejected. Remote milestones/issues unchanged.');
