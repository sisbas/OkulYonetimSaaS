const { test } = require('node:test');
const assert = require('node:assert/strict');
const { deploymentIdentity, classifyLogs, productionEnvironmentNames, windowsArguments } = require('./diagnose-vercel-deployment.cjs');
const { spawnSync } = require('node:child_process');

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
test('malformed environment schema is not treated as absence of required keys', () => {
  assert.throws(() => productionEnvironmentNames(undefined), /DIAGNOSTIC_SCHEMA_INVALID/);
  assert.throws(() => productionEnvironmentNames({}), /DIAGNOSTIC_SCHEMA_INVALID/);
});
test('Windows command preserves a full API query as one argument', { skip: process.platform !== 'win32' }, () => {
  const query = '/v6/deployments?projectId=fixture&target=preview&limit=3';
  const command = 'node ' + windowsArguments(['-e', 'process.stdout.write(process.argv[1])', query]);
  const result = spawnSync('cmd.exe', ['/d', '/s', '/c', command], {
    windowsVerbatimArguments: true, encoding: 'utf8', timeout: 10000,
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, query);
});
