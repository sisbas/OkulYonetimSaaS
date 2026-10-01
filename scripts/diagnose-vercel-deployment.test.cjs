const { test } = require('node:test');
const assert = require('node:assert/strict');
const { deploymentIdentity, classifyLogs, productionEnvironmentNames } = require('./diagnose-vercel-deployment.cjs');

test('deployment output never includes raw metadata, errors or environment values', () => {
  const result = deploymentIdentity({ id: 'dpl_abc', url: 'app-abc.vercel.app', readyState: 'ERROR',
    errorCode: 'BUILD_FAILED', errorMessage: 'Resource provisioning failed PRIVATE_VALUE',
    env: { JWT_ACCESS_SECRET: 'PRIVATE_VALUE' }, meta: { githubCommitSha: 'a'.repeat(40), extra: 'PRIVATE_VALUE' } });
  assert.equal(result.resourceProvisioningFailure, true);
  assert.equal(result.commitSha, 'a'.repeat(40));
  assert.ok(!JSON.stringify(result).includes('PRIVATE_VALUE'));
});
test('runtime classification reports only known variable names and boolean categories', () => {
  const result = classifyLogs('FATAL: JWT_ACCESS_SECRET is required PRIVATE_VALUE\nMODULE_NOT_FOUND PRIVATE_VALUE');
  assert.deepEqual(result.requiredVariableFailures, ['JWT_ACCESS_SECRET']);
  assert.equal(result.moduleNotFound, true);
  assert.ok(!JSON.stringify(result).includes('PRIVATE_VALUE'));
});
test('environment evidence is production-scoped names only', () => {
  const result = productionEnvironmentNames([
    { key: 'JWT_ACCESS_SECRET', target: ['production'], value: 'PRIVATE_VALUE' },
    { key: 'DATABASE_URL', target: ['preview'], value: 'PRIVATE_VALUE' },
    { key: 'PRIVATE_VALUE', target: ['production'], value: 'PRIVATE_VALUE' },
  ]);
  assert.deepEqual(result, ['JWT_ACCESS_SECRET']);
  assert.ok(!JSON.stringify(result).includes('PRIVATE_VALUE'));
});
