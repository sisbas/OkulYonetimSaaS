## Amaç

#259 P1B-02 SECURITY kapsamında: üretim ortamında öngörülebilir JWT gizli (secret) fallback'lerini kaldırarak fail-closed auth boot sağlamak ve leave self-decision korumasının identity-çözüm-hatasında fail-open davranmasını engellemek.

## Kapsam

- `src/auth/auth.service.ts`: `?? 'dev-access-secret'` / `?? 'dev-refresh-secret'` fallback'leri kaldırıldı; yerine `loadJwtAccessSecret()` / `loadJwtRefreshSecret()` factory'leri (env yoksa veya <32 karakterse THROW).
- `src/auth/jwt.strategy.ts`: `secretOrKey` artık `loadJwtAccessSecret()` kullanıyor.
- `.env.example`: JWT gizli sözleşmesi eklendi (prod zorunlu, rotation/key-id notu).
- `src/leaves/leave.service.ts`: `safeActorTeacherId` broad `catch { return null }` yerine identity çözülemediğinde `LeaveSelfDecisionException` throw eder (self-decision guard'ı atlamayı önler).
- `src/auth/auth-secret.spec.ts` + `jest.setup.ts`: test-only izole güçlü gizli; fail-closed davranışını doğrulayan testler.
- `.github/workflows/backend-ci.yml`: CI test gizlileri >=32 karaktere yükseltildi.

## Kapsam dışı

- Audit "Logger-only + raw PII" yollarının taranması/redaction bağlama (C maddesi) — ayrı PR (#259 Slice C).
- CP-SAT / OR-Tools solver — #262 kapsamı (tamamlandı).
- Yeni migration / runtime DB değişikliği — YOK.

## Acceptance criteria

- [x] Production startup fails closed when access/refresh secrets or key identifiers are missing/weak (loadJwtAccessSecret/loadJwtRefreshSecret THROW; linter/build/test green).
- [x] Local/test fallback is explicit, isolated and impossible in production (jest.setup.ts sets test-only >=32-char secret; no dev-... fallback remains in src).
- [x] Rotation/key-ID contract and rollback are documented and tested (.env.example JWT_KEY_ID + rotation note; stateless JWT => no migration; covered by auth-secret.spec.ts).
- [x] Sensitive decisions write durable transactional audit records with correlation ID and purpose (SecurityAuditService tenantId/actorId fail-fast zaten mevcut; bu PR audit altyapısını değiştirmez).
- [x] Logs/artifacts contain no raw PII, phone, note or secret (gizli artık koda gömülü değil; env-only).
- [x] Leave self-decision and identity failures deny safely (safeActorTeacherId throws LeaveSelfDecisionException on identity lookup failure).
- [x] Tenant/BOLA/RBAC, secret scan, SAST/dependency and redaction tests pass (lint+build+jest 48/48 PASS locally; CI checks run on PR).
- [x] Security, KVKK, Data and Backend independent verdicts bind to exact head (head_sha: 70af979 on branch f1b/259-security-failclosed; reviewers validate).

## Test çıktısı

Local (bu tur, exact-head 70af979):
- `npm run lint` (tsc --noEmit) → exit 0
- `npm run build` → exit 0
- `npx jest src/auth src/leaves --runInBand` → 8 suites / 48 tests PASS (auth-secret.spec.ts dahil)
CI: backend-ci.yml runs Sprint 1 Quality Gate, Backend CI, DB Smoke, Gate 1 CI, Sensitive Pattern Scanner, GitGuardian scan, PR Governance (Body/Issue/Rollback/Acceptance) on this PR.

## KVKK-audit etkisi

kvkk|audit|redaction|etkisi: Kimlik çözümü hatası artık audit gerektirmeyen bir null dönüşü değil, deny (LeaveSelfDecisionException) üretir; gizli değerler kaynak koddan çıkarılıp env-only hale getirildi (log/source leak riski azaldı). Üretim gizli değerleri hiçbir artifact'e yazılmaz.

## Rollback

`gh pr merge` geri almak için: `git revert <merge-sha>`. Değişiklik yalnızca auth secret loading + leave catch + test/config; runtime DB migration YOK. Geri alındığında eski `?? 'dev-...'` fallback'i döner (bilinçli olarak fail-open'a dönüş — yalnız acil durum rollback için).

## CI run referansı

PR açıldığında backend-ci.yml otomatik tetiklenir (gerçek PR event). Manuel `gh workflow run` ÜRETME (PR payload'sız FAIL eder). Vercel preview 0ms = bilinen false-fail (merge'i bloklamaz).
