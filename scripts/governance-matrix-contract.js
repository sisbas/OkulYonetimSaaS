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

function extractAcceptanceCriteria(body) {
  return body.match(/(?:^|\n)#{2,3}\s*Acceptance criteria\s*\n([\s\S]*?)(?=\n#{2,3}\s|\s*$)/i)?.[1]?.trim() || '';
}

function stripDecisionLine(line) {
  return line
    .replace(/^\s*[-*]\s*/, '')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .trim();
}

function blockingDecisionLines(body) {
  return body
    .replace(/```[\s\S]*?```/g, '')
    .split(/\r?\n/)
    .map(stripDecisionLine)
    .filter(Boolean)
    .filter((line) => {
      const match = /^(?:karar|decision|son karar|merge|ready\/merge|runtime ready\/merge|governance|authorization|merge authorization|runtime|status|durum)\s*[:\-–—]\s*(.+)$/i.exec(line);
      if (!match) return false;
      return /\b(hold|not authorized|unauthorized|no-go|no go)\b/i.test(match[1]);
    });
}

function evaluateAcceptance(input) {
  const failures = [];
  const body = input.body || '';
  const ac = extractAcceptanceCriteria(body);
  const checklistItems = ac.match(/^\s*[-*]\s*\[[ xX]\]\s+.{10,}$/gim) || [];
  const uncheckedItems = checklistItems.filter((item) => /^\s*[-*]\s*\[\s\]\s+.{10,}$/i.test(item));
  const weak = /^(|[-_. ]+|n\/a|na|none|null|todo|tbd|boş|yok|placeholder)$/i;

  if (!ac || weak.test(ac.trim()) || checklistItems.length < 1) {
    failures.push('acceptance-checklist-missing');
  }
  if (!input.draft && uncheckedItems.length > 0) {
    failures.push('ready-unchecked-acceptance');
  }
  const decisions = blockingDecisionLines(body);
  if (!input.draft && decisions.length > 0) {
    failures.push('ready-blocking-decision');
  }

  return { allowed: failures.length === 0, failures };
}

function evaluateMerge(input) {
  const failures = [];
  if (input.draft) failures.push('draft');
  if (input.behind) failures.push('branch-stale');
  if (!input.approval) failures.push(input.staleApproval ? 'stale-approval' : 'approval-missing');
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

const validBody = `## Acceptance criteria
- [x] Backend CI PASS
- [x] Merge Governance Enforcement SUCCESS

## Karar
MERGE: GO
`;

const draftUncheckedBody = `## Acceptance criteria
- [ ] Backend CI PASS
- [x] Rollback documented

## Karar
Status: Draft development
`;

const readyUncheckedBody = `## Acceptance criteria
- [ ] Backend CI PASS
- [x] Rollback documented
`;

const readyHoldBody = `## Acceptance criteria
- [x] Backend CI PASS
- [x] Rollback documented

## Karar
MERGE: HOLD
`;

const readyNotAuthorizedBody = `## Acceptance criteria
- [x] Backend CI PASS
- [x] Rollback documented

## Karar
AUTHORIZATION: NOT AUTHORIZED
`;

const readyHistoricalHoldBody = `## Acceptance criteria
- [x] Backend CI PASS
- [x] Rollback documented

## Not
Previous incident used the word HOLD in historical notes only.

## Karar
MERGE: GO
`;

const semanticScenarios = [
  {
    name: 'draft-unchecked-ac-development-allowed',
    input: { draft: true, body: draftUncheckedBody },
    acceptanceAllowed: true,
  },
  {
    name: 'ready-unchecked-ac-fails',
    input: { draft: false, body: readyUncheckedBody },
    acceptanceAllowed: false,
  },
  {
    name: 'ready-merge-hold-fails',
    input: { draft: false, body: readyHoldBody },
    acceptanceAllowed: false,
  },
  {
    name: 'ready-not-authorized-fails',
    input: { draft: false, body: readyNotAuthorizedBody },
    acceptanceAllowed: false,
  },
  {
    name: 'ready-historical-hold-note-does-not-fail',
    input: { draft: false, body: readyHistoricalHoldBody },
    acceptanceAllowed: true,
  },
  {
    name: 'ready-all-ac-checked-no-hold-passes',
    input: { draft: false, body: validBody },
    acceptanceAllowed: true,
  },
];

const mergeScenarios = [
  {
    name: 'draft-unchecked-ac-merge-blocked',
    input: { checks: successChecks(), approval: true, unresolvedThreads: 0, draft: true },
    allowed: false,
  },
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
    name: 'stale-approval',
    input: { checks: successChecks(), approval: false, staleApproval: true, unresolvedThreads: 0 },
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

for (const scenario of semanticScenarios) {
  const result = evaluateAcceptance(scenario.input);
  assert.equal(result.allowed, scenario.acceptanceAllowed, `${scenario.name}: unexpected acceptance decision: ${result.failures.join(', ')}`);
  console.log(`${scenario.name}: ${result.allowed ? 'AC PASS' : 'AC FAIL'}`);
}

for (const scenario of mergeScenarios) {
  const result = evaluateMerge(scenario.input);
  assert.equal(result.allowed, scenario.allowed, `${scenario.name}: unexpected merge decision: ${result.failures.join(', ')}`);
  console.log(`${scenario.name}: ${result.allowed ? 'MERGE ALLOWED' : 'MERGE BLOCKED'}`);
}

console.log('PASS: governance fail-closed contract matrix');

module.exports = {
  REQUIRED_CHECKS,
  blockingDecisionLines,
  evaluateAcceptance,
  evaluateMerge,
};
