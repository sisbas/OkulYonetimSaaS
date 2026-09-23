## Amaç

Truth matrix, `0b1586c` (2026-09-21) durumunda donmuş kalmıştı ve iki merge'i (PR #349 `fa4abba`, PR #351 `43b6163`) ile kendi kabul harness'imizin merge'ünü (PR #353 `e823ebd`) yansıtmıyordu; bu yüzden kapanmış bulguları "açık", üretilmiş kanıtı "0 spec" olarak gösteriyordu. Bu PR matrix'i gerçek `main` HEAD'ine reconcile eder, her satırı test yolu ve CI run URL'i ile destekler ve sınıflandırmaları **kanıtla tutarlı** hale getirir (kanıt yoksa yükseltme yapılmaz).

## Kapsam
- `docs/phase1-truth-matrix.md` (tek dosya, docs-only):
  - `Last reconciled` + `Main HEAD` = `e823ebd02b85b3996dfdf4bd08b04ce543852892`.
  - **Attendance session lifecycle (#265)** satırı: PR #349 (published-occurrence invariant'ı + sunucu atamalı şube; `src/attendance/attendance-session.service.ts`, `src/schedules/schedule.service.ts`, `test/database/schedule-service.spec.ts`) ve PR #351 (not redaction `src/attendance/attendance-notes.ts`; kontrollü düzeltme `src/attendance/attendance-correction.ts` + `1826000000000-AddAttendanceRecordCorrection`; `@Permissions` sözleşmesi `test/rbac/controller-enforcement-consistency.spec.ts`) kanıtları eklendi; modül envanteri 11 src/7 spec, migration sayısı 33.
  - **RBAC/BOLA** satırı: `test/rbac` 6 → **7** spec.
  - **Fresh-DB UI journey (#269)** satırı: `planning-only` → **`internal`** (harness + ilk journey yeşil; yanlış-yeşil onarımı kaydı; journey'in tamamı hâlâ açık).
  - Gap notları: kapanan enforcement boşluğu (#339 AC-2) ve "e2e count = 0" notu güncellendi.
  - Open gaps + Closure rule yeniden yazıldı; `Evidence CI URLs` bloğu `e823ebd` run'larıyla güncellendi, eski blok "Previous baseline" olarak korundu.

## Kapsam dışı
- Kod, CI workflow, migration veya test değişikliği **yok**.
- `docs/` altındaki diğer dosyalar ve required-check listesi (S0-A2 kapsamı).
- #264/#266/#268 satırlarının sınıflandırması **değiştirilmedi** (kanıt üretilmediği için iyimserleştirme yapılmadı).

## Acceptance criteria
- [x] `Last reconciled` ve `Main HEAD` gerçek main ile birebir eşit → kanıt: `git rev-parse origin/main` = `e823ebd02b85b3996dfdf4bd08b04ce543852892`
- [x] #265 satırında #349 ve #351 kanıtları (dosya yolları + migration + test yolları) var → kanıt: satır 24 içeriği + CI `35817262506`
- [x] #269 satırı kanıtla tutarlı: harness + ilk journey yeşil → `internal`; journey'in tamamı açık → kanıt: `test/e2e` 1 spec + 7 support; P0 run `35782140079`
- [x] `test/rbac` 7 spec ve kapanan enforcement boşluğu doğru yansıtıldı → kanıt: `test/rbac/controller-enforcement-consistency.spec.ts`
- [x] Bayat işaretçi taraması temiz (`e2e = 0`, `6 spec`, `PR #349 açık`, `planning-only | test/e2e` yok) → kanıt: `Select-String` çıktısı, yalnız tarihsel baseline referansları kalır
- [x] Tablo yapısı bozulmadı (15 satır × 8 kolon) → kanıt: pipe sayımı raporu
- [x] `NOT merge-ready` gerekçesi güncel boşluklarla yeniden yazıldı ve kanıtsız satır `runtime`/`pilot-ready`'ye yükseltilmedi → kanıt: Closure rule bölümü

## Test çıktısı

Docs-only değişiklik olduğu için yürütülebilir test yok; içerik doğrulaması ve main sağlığı:

| Doğrulama | Sonuç |
|---|---|
| `git rev-parse origin/main` = matrix `Main HEAD` | PASS (`e823ebd…`) |
| Bayat işaretçi taraması (`e2e = 0`, `6 spec`, `PR #349 açık`, `planning-only \| test/e2e`) | PASS — bulgu yok |
| Tablo kolon tutarlılığı (15 satır × 8 kolon) | PASS |
| Dosya sayısı / satır farkı | PASS — 1 dosya, +30/−14 |
| Main CI (head `e823ebd`): Backend CI, Sprint 1 Quality Gate, DB Smoke, Gate 1 CI, Main Governance Audit, GitGuardian | PASS — hepsi `completed/success` |
| PR #353 required checks (head `0b795b9`) | PASS — P0 harness, Backend, Sprint 1, DB Smoke, Gate 1, PR Governance |

## KVKK/audit etkisi

Kişisel veri, veli/öğrenci iletişim bilgisi, sağlık veya rehberlik notu işlenmez, yazılmaz ve loglanmaz; bu değişiklik yalnız doküman metnidir (dosya adları, commit SHA'ları, test yolları ve CI run URL'leri). Yeni audit kaydı veya redaction davranışı üretilmez; audit/redaction iddiaları yalnız mevcut test kanıtına (`test/kvkk`, `test/audit-redaction`) referansla yazılmıştır. Artefakt/secret sızıntısı yok (GitGuardian ve Sensitive Pattern Scanner bu PR'da çalışır).

## Rollback

Docs-only dilimdir; veri veya şema etkisi yoktur. Geri alma: `git revert <merge-sha>` (tek dosya, çakışmasız). Alternatif: matrix dosyası önceki ana döndürülür (`git checkout <prev> -- docs/phase1-truth-matrix.md`). Migration revert veya feature flag gerekmez.

## CI run referansı

- Main `e823ebd` (bu reconcile'ın dayanağı, tümü `success`):
  - Backend CI: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35817262634
  - Sprint 1 Quality Gate: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35817262506
  - DB Smoke: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35817262559
  - Gate 1 CI: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35817262441
  - Main Governance Audit: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35817262501
  - GitGuardian scan: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35817262566
- Matrix'in dayandığı PR #353 kanıtı (head `0b795b9`): P0 harness `35782140079`, Backend CI `35782139979`, Sprint 1 `35782140088`, PR Governance `35782568425`
- Bu PR'ın kendi required check'leri PR checks sekmesinde listelenir; yeşil olmadan merge talep edilmez.

## Kalite / governance notları
- Issue reference: Refs #258 (TRUTH); ilgili kanıt issue'ları: #265, #269, #339
- İzole dilim: 1 dosya, +30/−14 satır (docs-only)
- Bypass kullanılmadı; `main`'e doğrudan push yok; auto-merge kapalı, merge insan onayıyla.
