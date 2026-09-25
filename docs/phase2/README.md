# docs/phase2 — Faz 1b Kapanış Seti (v2)

Bu klasör, Faz 1b'yi **pilot-ready** hale getirip canlıya (pilot okullara) çıkarma işini yürütür.

| Dosya | Rol | Durum |
|---|---|---|
| `remaining-plan-v2.md` | Kalan iş planı: envanter, fizibilite, sprintler, dilim kuyruğu, KPI, insan işleri | **GÜNCEL (2026-09-23, main `15c5ab8`)** |
| `master-prompt-v2.md` | Orkestratör master prompt + ajan brifleri (kopyala-yapıştır) | **GÜNCEL** |
| `next-phase-plan.md` | v1 plan (main `43b6163` bazlı) | **BAYAT — yerini `remaining-plan-v2.md` aldı** |
| `master-prompt.md` | v1 master prompt (main `43b6163` bazlı) | **BAYAT — yerini `master-prompt-v2.md` aldı** |

## Neden v2?

v1 yazıldıktan sonra main'e 4 merge girdi ve v1'in ilk sprint dilimleri tamamlandı:

- `e823ebd` #353 — **gerçek** kabul harness'ı (`test/e2e/`) + fail-closed kabul guard'ı (`test/acceptance-guard/`) + workflow'un kabul yoluna bağlanması
- `c64d0a1` #352 — tamper-evident audit zinciri, retention/query/controller, attendance absences → **notification outbox** (transactional, idempotent), KVKK eligibility/redaction guard'ları
- `3b75acc` #355 — guard'a non-acceptance yüzeyi kaydı
- `15c5ab8` #354 — truth matrix reconcile (main HEAD `e823ebd`)

Bu yüzden v1'in `S0-A1`, `S0-A2`, `S0-B1`, `S0-C1`, `S2-B1` dilimleri **kapandı**; kalan iş kümesi `remaining-plan-v2.md` §2'de yeniden numaralandı (R1–R15).

## Tek doğruluk kaynakları (çelişkide bu sırayla kazanır)

1. `.specify/memory/constitution.md` (anayasa)
2. `docs/phase1-truth-matrix.md` (kabiliyet sınıflandırması — kod gerçeğine reconcile edilir)
3. `docs/phase2/remaining-plan-v2.md` (kalan iş + kabul)
4. `docs/agents/repo-operations.md` (ajan operasyon tuzakları; Windows/UTF-8/push/`git add -f`)
5. `docs/agents/issue-tracker.md`, `docs/devops/merge-governance-standard.md`

## Hızlı başlangıç

```bash
gh issue list --repo sisbas/OkulYonetimSaaS --state open --limit 50
gh pr list  --repo sisbas/OkulYonetimSaaS --state open
git fetch origin --prune && git --no-pager log --oneline origin/main -5
# Sonra: docs/phase2/master-prompt-v2.md §6 orkestratör döngüsünü başlat, §10 briflerini ajanlara dağıt.
```
