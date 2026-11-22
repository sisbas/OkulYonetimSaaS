const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  previewBranchCandidates,
  selectBranch,
  connectionUriUrl,
  isProductionHost,
} = require('./seed-preview-branch-admin.cjs');

test('preview branch candidates cover slashed git branch names', () => {
  const names = previewBranchCandidates('feat/runtime-ux-shell');
  assert.ok(names.includes('preview/feat/runtime-ux-shell'));
  assert.ok(names.includes('preview/feat-runtime-ux-shell'));
  assert.deepEqual(previewBranchCandidates('refs/heads/feat/runtime-ux-shell'), names);
});

test('selectBranch resolves the Vercel × Neon preview naming convention', () => {
  const branches = [
    { id: 'br-main', name: 'main' },
    { id: 'br-preview', name: 'preview/feat-runtime-ux-shell' },
  ];
  assert.equal(selectBranch(branches, 'feat/runtime-ux-shell').id, 'br-preview');
  assert.equal(selectBranch(branches, 'missing-branch'), null);
});

test('connection URI query targets the resolved branch only', () => {
  const url = new URL(connectionUriUrl('project-1', 'br-preview', 'neondb', 'neondb_owner'));
  assert.equal(url.pathname, '/api/v2/projects/project-1/connection_uri');
  assert.equal(url.searchParams.get('branch_id'), 'br-preview');
  assert.equal(url.searchParams.get('database_name'), 'neondb');
  assert.equal(url.searchParams.get('role_name'), 'neondb_owner');
  assert.equal(url.searchParams.get('pooled'), 'true');
});

test('production Neon endpoint is refused', () => {
  assert.equal(
    isProductionHost('postgresql://u:p@ep-orange-sunset-avzlq9ut-pooler.c-11.us-east-1.aws.neon.tech/neondb'),
    true,
  );
  assert.equal(
    isProductionHost('postgresql://u:p@ep-blue-preview-abc.c-11.us-east-1.aws.neon.tech/neondb'),
    false,
  );
});
