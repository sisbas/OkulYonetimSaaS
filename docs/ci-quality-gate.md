# Sprint 1 CI Quality Gate Standard

## Amaç

Sprint 1 kontrollü kodlama sürecinde küçük PR'ların `main` branch'i kırmasını engellemek. Her PR için okunabilir PASS/FAIL sonucu, ilk hata satırı, failure sınıfı ve rollback yolu görünür olmalıdır.

## Scope

Bu standart Gate 1 kapanışından sonra Sprint 1 geliştirme PR'ları için geçerlidir.

- Faz 1 MVP dışına çıkan PR'lar merge edilmez.
- Belirsiz CI sonucu olan PR'lar merge edilmez.
- KVKK/audit etkisi açıklanmamış PR'lar merge edilmez.

## CI kontrol zinciri

Sıra zorunludur. Zincir ilk hard failure noktasında durur ve GitHub Step Summary içinde ilk hata satırını raporlar.

| Sıra | Kontrol | Komut | Failure sınıfı |
|---:|---|---|---|
| 1 | Install | `npm ci` | dependency/install veya env/config |
| 2 | Lint/static check | `npm run lint` | code quality/build failure |
| 3 | Unit test | `npm run test:unit` | real test failure veya flaky |
| 4 | Migration check | `npm run db:migrate` | env/config veya schema failure |
| 5 | Seed check | `npm run db:seed:permissions` | env/config veya seed failure |
| 6 | Datasource verify | `npm run db:verify` | env/config veya schema failure |
| 7 | RBAC tests | `npm run test:rbac` | real test failure |
| 8 | KVKK tests | `npm run test:kvkk` | real test failure |
| 9 | Audit/redaction tests | `npm run test:audit-redaction` | real test failure / release blocker |
| 10 | Build | `npm run build` | code quality/build failure |

## PASS/FAIL raporu

Her workflow run için GitHub Actions summary aşağıdaki alanları üretmelidir:

| Alan | Zorunlu değer |
|---|---|
| Workflow | `Sprint 1 Quality Gate` |
| Job | `npm ci → lint → test → migration/seed → RBAC/KVKK/audit → build` |
| Run sonucu | `completed / success` veya `completed / failure` |
| İlk hata satırı | FAIL varsa ilk anlamlı hata satırı |
| Failure sınıfı | `flaky`, `env/config`, `real test failure`, `schema failure`, `build failure` |
| Retry kararı | Kör retry yok; önce sınıflandırma |
| Blokaj seviyesi | Yok / Orta / Yüksek / Release blocker |

## Failure sınıflandırması

| Sınıf | İşaretler | Karar |
|---|---|---|
| Flaky test/runtime | Timeout, worker exit, aralıklı başarısızlık | Tek retry yapılabilir; ikinci failure blocker |
| Env/config | DB bağlantı hatası, missing file, tsconfig/config parse, secret/env eksikliği | Backend/DevOps triage; merge yok |
| Real test failure | Jest assertion, RBAC/KVKK/audit test failure | İlgili ekip düzeltmeden merge yok |
| Schema failure | Migration/seed/datasource verify failure | Backend/API blocker |
| Build failure | TypeScript compile failure | Merge yok |
| Audit/redaction failure | PII masking, token/credential, parent contact, guidance note sızıntısı | Release blocker |

## Branch policy notu

Hedef branch: `main`.

Minimum politika:

1. `main` branch'e doğrudan push yapılmaz.
2. Tüm kod değişiklikleri PR ile gelir.
3. PR merge için `Sprint 1 Quality Gate` success olmalıdır.
4. Gate 1 kapsamındaki `Gate 1 CI` tarihsel kanıt olarak saklanır; Sprint 1 geliştirme PR'larında yeni workflow kullanılır.
5. PR açıklamasında acceptance criteria, test çıktısı, KVKK/audit etkisi ve rollback planı bulunmalıdır.
6. Main kırılırsa önce revert yapılır; ardından hotfix PR açılır.

Önerilen required status check:

```text
Sprint 1 Quality Gate / npm ci → lint → test → migration/seed → RBAC/KVKK/audit → build
```

## Gate 1 sonrası Sprint 1 workflow ayrımı

| Workflow | Amaç | Kullanım |
|---|---|---|
| Gate 1 CI | Tenant/Auth/RBAC/KVKK temel kabul zincirini kapatmak | Gate 1 kanıtı ve manuel doğrulama |
| Sprint 1 Quality Gate | Her Sprint 1 PR'ında main'i korumak | PR ve main push quality gate |

## Rollback / revert standardı

Main kırılırsa:

1. Son başarılı `main` run tespit edilir.
2. Kıran merge commit veya PR bulunur.
3. Önce revert PR açılır.
4. Revert PR'da aynı quality gate çalışır.
5. DB migration varsa `npm run db:migrate:revert` etkisi ayrıca notlanır.
6. Production/pilot ortamına veri etkisi varsa KVKK/audit notu eklenir.

## Riskli merge uyarı listesi

Aşağıdaki durumlardan biri varsa merge önerilmez:

- CI `queued`, `in_progress`, `cancelled`, `skipped` veya görünmüyor.
- Failure sınıfı yazılmamış.
- İlk hata satırı ayrıştırılmamış.
- Migration/seed failure var.
- KVKK/audit/redaction failure var.
- Parent/guardian contact, token, credential, email, phone veya rehberlik notu loglama etkisi açıklanmamış.
- PR template alanları boş bırakılmış.
- Rollback planı yok.
- Main ile branch arasında büyük divergence var.
- PR fazla geniş kapsamlı ve Faz 1 dışına taşıyor.

## Sprint 1 kapanış cümlesi

```text
Sprint 1 Quality Gate: completed / success
Retry required: no
Blocker: none
Main protection: active through PR quality gate
```
