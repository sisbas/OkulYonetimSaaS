const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isTrustedPreviewUrl, scrubBody } = require('./diagnose-preview-login.cjs');

test('trusted project preview URL is accepted', () => {
  assert.equal(isTrustedPreviewUrl('https://okulyonetimsaas-git-ops-503-cre-d108e4-sisbas-projects-d3c081cb.vercel.app'), true);
  assert.equal(isTrustedPreviewUrl('https://okulyonetimsaas-f1f907b2k-sisbas-projects-d3c081cb.vercel.app'), true);
  assert.equal(isTrustedPreviewUrl('https://okul-yonetim-saas.vercel.app'), true);
});

test('foreign Vercel hosts are refused so secrets are never sent there', () => {
  assert.equal(isTrustedPreviewUrl('https://attacker-project.vercel.app'), false);
  assert.equal(isTrustedPreviewUrl('https://okulyonetimsaas-evil.attacker.vercel.app'), false);
  assert.equal(isTrustedPreviewUrl('https://okulyonetimsaas-git-x-otherteam.vercel.app'), false);
});

test('scrubBody removes markup, emails, bearer tokens and long opaque values', () => {
  const raw = '<html><body>500: FUNCTION_INVOCATION_FAILED for preview-admin@okul.example ' +
    'with Bearer abc.def.ghi and AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA</body></html>';
  const result = scrubBody(raw);
  assert.equal(result.includes('<'), false);
  assert.equal(result.includes('preview-admin@okul.example'), false);
  assert.equal(result.includes('abc.def.ghi'), false);
  assert.equal(result.includes('AAAA'), false);
  assert.equal(result.includes('FUNCTION_INVOCATION_FAILED'), true);
});

test('scrubBody truncates long bodies', () => {
  assert.equal(scrubBody('word '.repeat(50)).length, 120);
});
