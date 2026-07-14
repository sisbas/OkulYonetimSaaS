# M2 KVKK Consent Permission Contract Alignment

## Decision

The seeded permission key for KVKK consent read capability is:

```text
student:kvkk:read
```

The contract key below is not seeded and must not be used in runtime guards:

```text
student:consent:read
```

## Scope

This is a documentation-only contract alignment for PR #58 Codex P2 review.

No runtime behavior is changed:

- no controller implementation
- no service implementation
- no entity implementation
- no repository implementation
- no migration
- no seed change
- no authorization behavior change
- no test weakening

## Seed evidence

`src/database/seeds/permissions.seed.ts` includes `student:kvkk:read`.

`student:consent:read` is not part of the current permission seed and is not approved for runtime use.

## Role decision

| Role | KVKK consent read decision |
|---|---|
| `tenant_admin` | allowed only through seeded `student:kvkk:read` within tenant scope |
| `operations_manager` | raw consent read remains restricted; eligibility/minimized result is preferred unless explicit seeded permission and purpose are approved |
| `teacher` | forbidden; teacher must not receive KVKK consent read permission |

## Contract rule

Any M2 contract or implementation that needs KVKK consent read capability must reference:

```text
student:kvkk:read
```

not:

```text
student:consent:read
```

If a future separate consent-specific permission key is required, it must be introduced in a dedicated seed/catalog/test PR and remain pending until CI and QA accept it.

## PR #58 P2 resolution

This file resolves the PR #58 P2 finding by binding KVKK consent read semantics to the existing seeded key and blocking runtime use of the unseeded `student:consent:read` key.

## Merge policy

Future M2 implementation PRs must remain HOLD if they use unseeded permission keys in runtime guards.

Required before merge:

- Sprint 1 Quality Gate PASS
- Backend CI PASS
- DB Smoke PASS
- Gate 1 CI PASS
- GitGuardian / secret scanner clear
- Codex review threads resolved or outdated
