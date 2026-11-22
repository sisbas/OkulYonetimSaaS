const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isProductionHost } = require('./create-preview-admin.cjs');

test('production endpoint is refused regardless of case', () => {
  assert.equal(isProductionHost('postgresql://u:p@EP-ORANGE-SUNSET-AVZLQ9UT-pooler.c-11.us-east-1.aws.neon.tech/neondb'), true);
});

test('host query override (any case) cannot smuggle production', () => {
  assert.equal(isProductionHost('postgresql://u:p@preview.example/neondb?host=ep-orange-sunset-avzlq9ut.example'), true);
  assert.equal(isProductionHost('postgresql://u:p@preview.example/neondb?HOST=EP-ORANGE-SUNSET-AVZLQ9UT.example'), true);
});

test('preview endpoints are accepted', () => {
  assert.equal(isProductionHost('postgresql://u:p@ep-blue-preview-abc.c-11.us-east-1.aws.neon.tech/neondb'), false);
});
