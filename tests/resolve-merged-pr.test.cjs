'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveMergedPullRequest } = require('../scripts/resolve-merged-pr.cjs');
const sha = 'a'.repeat(40);
const pr = { number: 335, merged: true, merged_at: '2026-08-30T05:18:32Z',
  merge_commit_sha: sha, base: { ref: 'main', repo: { full_name: 'sisbas/OkulYonetimSaaS' } },
  head: { sha: 'b'.repeat(40) } };
function fixture(pages, details = { 335: pr }) {
  const calls = []; const waits = []; let index = 0;
  const github = { rest: { repos: { listPullRequestsAssociatedWithCommit() {} },
    pulls: { get: async ({ pull_number }) => ({ data: details[pull_number] }) } },
    paginate: async (_method, args) => { calls.push(args); const value = pages[Math.min(index++, pages.length - 1)];
      if (value instanceof Error) throw value; return value; } };
  return { args: { github, owner: 'sisbas', repo: 'OkulYonetimSaaS', mergeSha: sha,
    wait: async (ms) => { waits.push(ms); } }, calls, waits };
}
test('exact merged main PR succeeds without waiting', async () => {
  const f = fixture([[pr]]); const r = await resolveMergedPullRequest(f.args);
  assert.equal(r.pr, pr); assert.equal(r.attempts, 1); assert.deepEqual(f.waits, []);
  assert.equal(f.calls[0].per_page, 100); assert.equal(f.calls[0].commit_sha, sha);
});
test('delayed indexing succeeds after bounded retries', async () => {
  const f = fixture([[], [], [pr]]); const r = await resolveMergedPullRequest(f.args);
  assert.equal(r.pr, pr); assert.equal(r.attempts, 3); assert.deepEqual(f.waits, [1000, 3000]);
});
test('permanent absence remains failure evidence', async () => {
  const f = fixture([[]]); const r = await resolveMergedPullRequest(f.args);
  assert.equal(r.pr, null); assert.equal(r.attempts, 4); assert.equal(f.calls.length, 4);
  assert.deepEqual(f.waits, [1000, 3000, 6000]);
});
test('ancestor PR never substitutes for exact merge commit', async () => {
  const f = fixture([[pr]], {335: {...pr, merge_commit_sha: 'c'.repeat(40)}});
  assert.equal((await resolveMergedPullRequest(f.args)).pr, null);
});
test('unmerged, wrong target, and foreign repository PRs fail closed', async () => {
  for (const invalid of [{...pr, merged:false},
    {...pr, base:{...pr.base, ref:'feature'}},
    {...pr, base:{ref:'main', repo:{full_name:'someone/else'}}}]) {
    assert.equal((await resolveMergedPullRequest(fixture([[pr]], {335:invalid}).args)).pr, null);
  }
});
test('malformed merge timestamp or head is not evidence', async () => {
  for (const invalid of [{...pr, merged_at:'invalid'}, {...pr, head:{sha:'bad'}}]) {
    assert.equal((await resolveMergedPullRequest(fixture([[pr]], {335:invalid}).args)).pr, null);
  }
});
test('API errors propagate rather than becoming absence or success', async () => {
  await assert.rejects(resolveMergedPullRequest(fixture([new Error('API unavailable')]).args), /API unavailable/);
});
test('ambiguous distinct exact associations fail closed', async () => {
  const other = {...pr, number:336};
  await assert.rejects(resolveMergedPullRequest(fixture([[pr,other]], {335:pr,336:other}).args), /Ambiguous/);
});
test('duplicate entries for same PR do not create ambiguity', async () => {
  assert.equal((await resolveMergedPullRequest(fixture([[pr,pr]]).args)).pr, pr);
});
test('invalid merge SHA is rejected before network access', async () => {
  const f = fixture([[pr]]);
  await assert.rejects(resolveMergedPullRequest({...f.args, mergeSha:'not-a-sha'}), /Invalid merge SHA/);
  assert.equal(f.calls.length, 0);
});
