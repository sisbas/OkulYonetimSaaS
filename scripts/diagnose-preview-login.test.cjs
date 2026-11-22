const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isTrustedPreviewUrl } = require('./diagnose-preview-login.cjs');

test('trusted project preview URL is accepted', () => {
  assert.equal(isTrustedPreviewUrl('https://okulyonetimsaas-git-ops-503-cre-d108e4-sisbas-projects-d3c081cb.vercel.app'), true);
  assert.equal(isTrustedPreviewUrl('https://okul-yonetim-saas.vercel.app'), true);
});

test('foreign Vercel hosts are refused so secrets are never sent there', () => {
  assert.equal(isTrustedPreviewUrl('https://attacker-project.vercel.app'), false);
  assert.equal(isTrustedPreviewUrl('https://okulyonetimsaas-evil.attacker.vercel.app'), false);
  assert.equal(isTrustedPreviewUrl('https://okulyonetimsaas-git-x-otherteam.vercel.app'), false);
});
