## Amaç
#258 [P1B-00][TRUTH] — Phase 1 capability truth matrix'i yayınla. Her yeteneği planning-only/internal/runtime/pilot-ready sınıflandır, immutable evidence (main HEAD SHA a11036d, test path, CI URL) bağla, yanlış issue/PR referanslarını tespit et. Tracker kapanışını executable kanıta bağla.

## Kapsam
- docs/phase1-truth-matrix.md: 13 satırlık capability matrix + gap notes + Faz 1b scope/non-goal
- LIVE src envanteri (bugün): schedules/leaves/auth/courses/rooms/teachers/time-slots = runtime; attendance/notifications/reports/rbac/kvkk = internal/planning-only; e2e = 0
- Kritik bulgu: RBAC 11 src / 0 test (BOLA P0 risk); attendance #330 nedeniyle merge-blocklu; notification/reporting planning-only
- Phase 1b non-goal: tercih-robotu (ayrı ürün), Notion sync (local fallback), production auto-merge (HCO off)

## Kapsam dışı
- Gerçek kod değişikliği (analiz + doküman)
- Migration (gerektirmez → DB Smoke etkilenmez)
- Browser E2E yazımı (#269)

## Acceptance criteria
- [x] Her Phase 1 capability tek classification + immutable evidence (HEAD a11036d)
- [x] P0/P1 gap'leri linked open Faz 1b issue'larla temsil (#330/#263/#265/#266/#264/#268/#269/#259)
- [x] Unchecked/HOLD criteria'lı kapalı tracker "complete" rapor edilmez (matrix'te NOT merge-ready)
- [x] Matrix GitHub'da yayın (docs/phase1-truth-matrix.md)
- [ ] Notion senkronu (non-goal, local fallback)

## Test çıktısı
Migration-free PR → DB Smoke etkilenmez. Governance + test CI geçer.
Local: npx jest src --passWithNoTests → mevcut testler etkilenmez (sadece docs eklendi).

## KVKK/audit etkisi
Yok (doküman). RBAC 0-test bulgusu KVKK/BOLA riskini flag'ler (düzeltme #259/#263 kapsamında).

## Rollback
git revert <merge-sha>; docs-only, kod etkilemez.

## CI run referansı
Governance + test CI: PR açılınca tetiklenir.

---
HCO contract: merge'i insan açık onaylamadıkça YAPMA. Auto-merge codepath DEFAULT OFF.

Refs #258
