## Amaç

<!-- Bu PR neden açıldı? Hangi problemi, kullanıcı hikâyesini veya teknik borcu kapatıyor? -->

Merged #364 sonrası H1 rehberini güncel main ve kabul edilmiş audit güvenlik sınırlarıyla eşleştiren Draft correction PR.
Main snapshot: `b3e1a359c6f5b7dbf27d88daac5fd5395c5ebf48`.

## Kapsam

<!-- Bu PR içinde yapılan değişiklikleri maddeleyin. -->

- `artifacts/H1-H2/H1-prod-env-and-health.md`: #366 AuditModule wiring/retention quarantine ve #369 bounded checkpoint doğrulamasını yansıtır; eski “module kayıtlı değil” ve “checkpoint imzası doğrulanmıyor” ifadelerini düzeltir.
- Üretim H1 kanıtı ve kullanılabilir verifier için tamamlanmayan insan/owner kapılarını açıkça korur (#373, #368).
- `artifacts/review364/verify-docs.cjs`: kaynak snapshot, scope, güncel HTTP güven sınırı, JWT_KEY_ID, checkpoint doğrulaması ve açık owner kararlarını salt-okunur doğrular.

## Kapsam dışı

<!-- Bu PR'ın bilinçli olarak kapsamadığı işleri yazın. -->

- Runtime kodu, production deploy/rotasyon/health gözlemi, platform verify authority kararı, governance/ruleset/thread değişikliği, issue closure ve merge.

## Acceptance criteria

<!-- Ölçülebilir kabul kriterlerini checklist olarak yazın. -->

- [x] H1 rehberi current main'deki #366/#369 düzeltmelerini, kayıtlı AuditModule'ü, fail-closed ring boot kontrolünü ve bounded checkpoint sınırını doğru belgeler.
- [x] JWT_KEY_ID desteğinin bulunmadığı ve mevcut verify/retention HTTP güven sınırı kaynak assertion'larıyla doğrulanır.
- [x] Scope/source guard ile negatif belge mutasyonları PASS.
- [ ] Production H1 kanıtı ve güvenli wiring runtime kabulü: code wiring #366/#369 ile main'e merge edilmiştir; production `/api/v1/health` 200 kanıtı yoktur ve tenant verify endpoint'i owner kararı gelene kadar kontrollü 403 döndürür.
- [ ] Bağımsız exact-head review ve H3 owner kararı.
- [ ] POLICY_DEADLOCK #368 owner kararı; governance acceptance.
- [ ] Bu correction PR'ın H3 owner review/merge ile main'e teslimi.

## Test çıktısı

<!--
Zorunlu kanıt alanıdır. Gerçek PASS/FAIL, SUCCESS/FAILURE veya GitHub Actions run kanıtı içermelidir.
Belirsiz ifadeler kabul edilmez: Pending, sonra güncellenecek, çalıştırılmadı, N/A.

Planning-only / documentation-only PR için kabul edilebilir minimum format:
- Planning-only scope guard: PASS.
- Changed files: `docs/...` veya `.github/...` ile sınırlı.
- Runtime code: none.
- Migration: none.
- Ruleset change: none.
- Evidence: dosya kapsamı, commit/head SHA veya GitHub Actions run id/URL.
-->

- Planning-only scope/source guard: `node artifacts/review364/verify-docs.cjs` — PASS (4 negative mutations rejected).
- Changed files: yalnız `artifacts/H1-H2/H1-prod-env-and-health.md` ve `artifacts/review364/{verify-docs.cjs,pr-body.md}`.
- Runtime code: none.
- Migration: none.
- Ruleset change: none.
- `git diff --check`: PASS.
- `node --check artifacts/review364/verify-docs.cjs`: PASS.
- Merged-source snapshot asserted by the guard: main `b3e1a359c6f5b7dbf27d88daac5fd5395c5ebf48`; no production/runtime acceptance inferred.
- `npm` product/runtime tests were not run for this docs-only correction.

## KVKK/audit etkisi

<!-- Kişisel veri, veli iletişim bilgisi, öğrenci bilgisi, rehberlik notu, audit log veya notification payload etkisini yazın. Etki yoksa neden yok yazın. -->

- KVKK etkisi: yeni PII veya secret yok.
- Audit etkisi: rehber current-main quarantine/verification boundaries'ni açıklar; runtime policy değişikliği yok.
- Redaction ihtiyacı: yok.

## Rollback

<!-- Revert, migration revert, feature flag kapatma, restore veya hotfix adımlarını yazın. -->

- `git revert <bu-PR-merge-sha>`; yalnız doküman ve doğrulama artifact'ı geri alınır.
- Şema/veri dönüşümü ve runtime kod değişikliği yoktur.

## CI run referansı

<!--
Kabul edilen formatlar:
- GitHub Actions URL: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/<run_id>
- Run id: <run_id>
- Açık workflow adı + run id: Backend CI run <run_id>: SUCCESS

Pending/sonra güncellenecek kabul edilmez. Workflow henüz oluşmadıysa PR Draft kalmalı veya Test çıktısı altında planning-only scope guard PASS kanıtı yazılmalıdır.
-->

Main'e merge edilen kaynak kod CI kanıtı: [#366 DB Smoke](https://github.com/sisbas/OkulYonetimSaaS/actions/runs/36873447959) ve [#369 DB Smoke](https://github.com/sisbas/OkulYonetimSaaS/actions/runs/36695971712). Bu run'lar merged code dilimlerini kanıtlar; production H1 kabulü veya bu correction PR'ın exact-head review'ü değildir.

## Issue reference

<!-- Fixes #123 veya Refs #123 yazın. -->

Refs #332 #259 #358 #367 #368 #373.
