# PR #71 / PR #78 Merge Governance Postmortem

## Problem

PR #71 ve PR #78 beklenen draft/CI-gated süreçten önce merge edildi. Bu durum merge butonunun yalnız PR gövdesi, manuel niyet veya belirsiz CI kanıtına dayanarak açık kalabildiğini gösterir.

## Kök neden sınıfları

- Workflow var ama required check listesine bağlanmamış olabilir.
- PR açıklaması mevcut ama makine tarafından doğrulanmıyor olabilir.
- En az bir review, stale approval dismissal ve thread resolution aynı anda zorunlu olmayabilir.
- Direct push veya admin bypass pratikte açık kalmış olabilir.
- `Draft` niyeti PR gövdesinde belirtilmiş ama GitHub'ın gerçek draft metadata'sı kullanılmamış olabilir.

## Alınan önlem

Bu branch aşağıdaki teknik önlemleri ekler:

- PR gövdesi için zorunlu bölüm doğrulaması
- Issue reference kontrolü
- Rollback plan kontrolü
- Acceptance criteria checklist kontrolü
- Sensitive pattern scanner
- GitGuardian secret scan workflow'u
- Gate 1 CI required check adı
- Sprint 1 Quality Gate required check adı
- Backend CI required check adı
- DB Smoke required check adı
- Required check activation dokümantasyonu

## Release blocker

Bu governance branch'i merge edildikten sonra required checks branch protection/ruleset içine eklenmezse problem çözülmüş sayılmaz.

## Kabul kriteri

`main` ve aktifse `backend` branch'inde merge butonu, tüm required status checks success olmadan, geçerli review olmadan ve review thread'leri çözülmeden kullanılabilir kalmamalıdır.
