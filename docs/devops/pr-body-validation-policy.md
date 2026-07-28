# PR Body Validation Policy

PR body makine tarafından doğrulanmalıdır. PR açıklaması yalnız niyet metni değildir; merge kararında kullanılabilecek kanıt kaydıdır.

## Zorunlu alanlar

Aşağıdaki heading adları exact kullanılmalıdır. Büyük/küçük harf, slash, Türkçe karakter ve boşluk yapısı değiştirilmemelidir.

```text
## Amaç
## Kapsam
## Kapsam dışı
## Acceptance criteria
## Test çıktısı
## KVKK/audit etkisi
## Rollback
## CI run referansı
```

## Kural

Bu alanlardan biri eksik, boş, placeholder veya belirsiz ise PR Governance workflow'u fail olmalıdır.

Belirsiz kabul edilmeyen ifadeler:

- `Pending`
- `sonra güncellenecek`
- `henüz yok`
- `N/A`
- `çalıştırılmadı`
- `PR açıldıktan sonra eklenecek`

## Planning-only PR evidence rule

Planning-only veya documentation-only PR'lar runtime test üretmeyebilir. Buna rağmen `## Test çıktısı` bölümü kanıt içermelidir.

Planning-only PR için kabul edilebilir minimum kanıt:

```text
- Planning-only scope guard: PASS.
- Changed files: docs/... only.
- Runtime code: none.
- Migration: none.
- Ruleset change: none.
- Evidence: <head sha veya run id/URL veya changed-file listesi>.
```

Bu format, runtime test yerine scope guard kanıtı sağlar. PR runtime, API client, migration, workflow veya ruleset değiştiriyorsa planning-only kanıt yeterli değildir; ilgili CI/test run kanıtı zorunludur.

## CI run referansı formatları

`## CI run referansı` bölümü aşağıdaki formatlardan en az birini içermelidir:

```text
- https://github.com/sisbas/OkulYonetimSaaS/actions/runs/<run_id>
- <run_id>
- Backend CI run <run_id>: SUCCESS
- DB Smoke run <run_id>: SUCCESS
- Gate 1 CI run <run_id>: SUCCESS
```

Açık workflow adı + run id formatı tercih edilir. Exact-head olup olmadığı ayrıca reviewer tarafından head SHA ile doğrulanmalıdır.

## KVKK/audit etkisi heading standardı

KVKK/audit bölümü exact heading ile yazılmalıdır:

```text
## KVKK/audit etkisi
```

Aşağıdaki varyantlar kabul edilmez:

- `## KVKK etkisi`
- `## Audit etkisi`
- `## KVKK / audit etkisi`
- `## KVKK ve audit`
- `## KVKK-audit`

## Kabul kriteri

PR açıklaması; kapsam, test/CI kanıtı, KVKK/audit etkisi, rollback ve issue referansını reviewer'ın merge kararı verebileceği açıklıkta taşımalıdır.