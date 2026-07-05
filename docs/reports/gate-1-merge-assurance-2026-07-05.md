# Gate 1 Merge Assurance Report — 2026-07-05

## 1. Branch Update

- Current branch: `work`.
- Initial `git status`: clean working tree.
- `git fetch origin`: **FAIL** — no `origin` remote is configured in this checkout.
- Update method attempted: `git merge origin/main` after fetch.
- backend branch main ile güncellendi mi: **No**.
- conflict çıktı mı: **No merge executed; no unresolved conflict files detected**.
- conflict dosyaları: None.
- conflict çözümü davranış değiştirdi mi: No.
- main ile commit farkı: unavailable because `origin/main` does not exist locally.

### Conflict Status Report

- backend branch main ile güncellendi mi? **No**
- Kullanılan yöntem: **merge attempted**
- Conflict çıktı mı? **No; fetch failed before merge**
- Conflict çıkan dosyalar: **None**
- Conflict çözümü davranış değiştirdi mi? **No**
- backend güncelleme sonrası main ile commit farkı:
  - commit count: unavailable
  - file diff summary: unavailable
  - notable files: unavailable

## 2. CI Results

| Command | Result | Duration | Important output | Error summary |
| --- | --- | ---: | --- | --- |
| `npm ci` | FAIL | 3s | npm reported missing lockfile | No `package-lock.json` or `npm-shrinkwrap.json`; `npm ci` cannot run. |
| `npm run build` | FAIL | 5s | `tsc -p tsconfig.json` executed | Dependencies unavailable because `npm ci` failed; TypeScript reported missing NestJS/TypeORM/Jest/Node types. |
| `npm run test:rbac` | FAIL | 2s | Script resolved to `jest --runInBand test/rbac` | `jest: not found`. |
| `npm run test:database` | FAIL | 2s | Script resolved to `jest --runInBand test/database` | `jest: not found`. |
| `npm run db:migrate` | FAIL | 2s | Script resolved to TypeORM migration runner | `typeorm-ts-node-commonjs: not found`. |
| `npm run db:seed:permissions` | FAIL | 2s | Script resolved to `ts-node src/database/seeds/permissions.seed.ts` | `ts-node: not found`. |
| `npm run db:verify` | FAIL | 2s | Script resolved to `ts-node scripts/verify-datasource.ts` | `ts-node: not found`. |
| `npm run db:seed:permissions` idempotency run 1 | FAIL | 3s | Same seed script | `ts-node: not found`. |
| `npm run db:seed:permissions` idempotency run 2 | FAIL | 1s | Same seed script | `ts-node: not found`. |
| `npm run db:verify` post-idempotency | FAIL | 1s | Same verify script | `ts-node: not found`. |

Seed idempotency expected DB output could not be observed because the seed command did not start. Static inspection shows the seed uses upsert/`ON CONFLICT` logic for tenants, permissions, roles, and role_permissions, but runtime idempotency remains unverified.

## 3. Permission Seed ↔ Product Owner Alignment

### Permission count

- Expected: 115
- Actual: 115 by static seed inspection.
- Result: PASS static / FAIL runtime verification due command failure.

### Domain kapsamı

- Missing domains: None.
- Extra domains: None.
- Result: PASS static.

### Faz 1 dışı permission kontrolü

- Out-of-scope permissions: None.
- Result: PASS static.

### Role mapping kontrolü

- tenant_admin permission count:
  - Expected: 115
  - Actual: 115 by static seed mapping.
  - Result: PASS static / FAIL runtime verification due command failure.
- operations_manager forbidden permissions present: None.
  - Result: PASS static.
- teacher forbidden permissions present: None.
  - Result: PASS static.
- öğretmen parent contact kapalı: PASS static.
- öğretmen tüm öğrenci/tüm yoklama/audit kapalı: PASS static.
- operasyon veli bildirimi KVKK sınırında: PASS static for forbidden list; PO/legal semantic boundary still depends on application-level KVKK guards and successful tests.
- PO onayı gereken açık permission: None found in the specified out-of-scope domain list.

## 4. Route Decorator ↔ Seed Uyumu

- Decorator keys missing from seed: None.
- Seed keys unused by decorators: 115 keys; no `RequirePermission(...)` decorator usages were found under `src` or `test`.
- Result: PASS for subset rule, because decorator key set is empty.

## 5. Tenant Guard / Repository Guard Smoke Kontrolü

Repository-level tenant guard tests exist in `test/database/tenant-guard.spec.ts` and repository scope tests exist in `test/rbac/tenant-repository-scope.spec.ts`, but they did not execute because Jest is unavailable.

- Tenant-scoped query without tenantId blocked? Present in tests; runtime unverified.
- Tenant filter override blocked? Present in tests; runtime unverified.
- Cross-tenant findById blocked/null? Present in tests; runtime unverified.
- Teacher own-resource tests pass? Runtime unverified because `npm run test:rbac` failed to start.

## 6. Merge Blockers

- [BLOCKER] backend branch main ile güncellenmedi — no `origin` remote / no `origin/main` ref.
- [BLOCKER] npm ci fail — lockfile missing.
- [BLOCKER] build fail — dependencies unavailable after `npm ci` failure.
- [BLOCKER] test:rbac fail — Jest unavailable.
- [BLOCKER] test:database fail — Jest unavailable.
- [BLOCKER] db:migrate fail — TypeORM CLI unavailable.
- [BLOCKER] db:seed:permissions fail — ts-node unavailable.
- [BLOCKER] db:verify fail — ts-node unavailable.

No static blocker was found for permission count, teacher forbidden permissions, operations_manager forbidden permissions, decorator keys, or out-of-scope permission domains.

## 7. Final Recommendation

**MERGE BLOCKED**

## 8. Required Follow-ups

1. Configure/fetch the real remote containing `main`, then re-run `git fetch origin` and `git merge origin/main` or the repo-standard rebase.
2. Add/restore a committed `package-lock.json` or update the expected install command away from `npm ci`.
3. Re-run the full CI command set after dependencies are installable.
4. Re-run seed idempotency against a clean non-production test database and capture the expected counts:
   - Permission count = 115
   - Duplicate permission = 0
   - Duplicate role_permission = 0
   - tenant_admin permissions = 115
