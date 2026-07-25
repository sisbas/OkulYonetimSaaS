'use strict';

const assert = require('node:assert/strict');

const REQUIRED_CHECKS = [
  'Sprint 1 Quality Gate',
  'Backend CI',
  'DB Smoke',
  'Gate 1 CI',
  'Sensitive Pattern Scanner',
  'GitGuardian scan',
  'PR Governance / Body Validation',
  'PR Governance / Issue Reference',
  'PR Governance / Rollback Plan',
  'PR Governance / Acceptance Criteria',
];

function evaluate(input) {
  const failures = [];
  if (input.draft) failures.push('draft');
  if (input.behind) failures.push('branch-stale');
  if (!input.approval) failures.push('approval-missing');
  if ((input.unresolvedThreads || 0) > 0) failures.push('unresolved-thread');

  for (const name of REQUIRED_CHECKS) {
    const check = input.checks[name];
    if (!check) failures.push(`missing:${name}`);
    else if (check.status !== 'completed') failures.push(`pending:${name}`);
    else if (check.conclusion !== 'success') failures.push(`failed:${name}:${check.conclusion || 'unknown'}`);
  }
  return { allowed: failures.length === 0, failures };
}

function successChecks() {
  return Object.fromEntries(REQUIRED_CHECKS.map((name) => [name, { status: 'completed', conclusion: 'success' }]));
}

const scenarios = [
  {
    name: 'required-check-missing',
    input: { checks: { ...successChecks(), 'Backend CI': undefined }, approval: true, unresolvedThreads: 0 },
    allowed: false,
  },
  {
    name: 'required-check-pending',
    input: { checks: { ...successChecks(), 'Backend CI': { status: 'in_progress', conclusion: null } }, approval: true, unresolvedThreads: 0 },
    allowed: false,
  },
  {
    name: 'required-check-cancelled',
    input: { checks: { ...successChecks(), 'Backend CI': { status: 'completed', conclusion: 'cancelled' } }, approval: true, unresolvedThreads: 0 },
    allowed: false,
  },
  {
    name: 'required-check-failed',
    input: { checks: { ...successChecks(), 'Backend CI': { status: 'completed', conclusion: 'failure' } }, approval: true, unresolvedThreads: 0 },
    allowed: false,
  },
  {
    name: 'approval-missing',
    input: { checks: successChecks(), approval: false, unresolvedThreads: 0 },
    allowed: false,
  },
  {
    name: 'unresolved-thread',
    input: { checks: successChecks(), approval: true, unresolvedThreads: 1 },
    allowed: false,
  },
  {
    name: 'all-success',
    input: { checks: successChecks(), approval: true, unresolvedThreads: 0 },
    allowed: true,
  },
];

for (const scenario of scenarios) {
  const result = evaluate(scenario.input);
  assert.equal(result.allowed, scenario.allowed, `${scenario.name}: unexpected merge decision: ${result.failures.join(', ')}`);
  console.log(`${scenario.name}: ${result.allowed ? 'MERGE ALLOWED' : 'MERGE BLOCKED'}`);
}

console.log('PASS: governance fail-closed contract matrix');

module.exports = { REQUIRED_CHECKS, evaluate };
