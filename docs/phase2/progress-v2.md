# Faz 1b — İlerleme Panosu (progress-v2)

**Sahip:** A6 (Docs/Governance) · **Güncelleme kuralı:** her dilimde ilgili satır güncellenir (tek satır = tek dilim).
**Baz main HEAD:** `15c5ab8d44f21b3165cf50658fadbc42b4bd68ae` (main son merge 2026-09-23 12:29 +03)
**Bu panorama:** 2026-09-23 · A6 · from `p1b/phase2-plan-of-record` (baz `15c5ab8`) · `gh`/`git ls-remote` ile doğrulandı
**Şablon:** `docs/phase2/master-prompt-v2.md` §15 · **Plan:** `docs/phase2/remaining-plan-v2.md`
**Tek doğruluk sırası:** `.specify/memory/constitution.md` → `docs/phase1-truth-matrix.md` → `docs/phase2/remaining-plan-v2.md` → `docs/agents/repo-operations.md`

Kabul kuralı (bağlayıcı): bir dilim yalnız **runtime|pilot-ready + exact head SHA + test yolu + CI run URL** ile kapanır.
"PR merge edildi" kapanış kanıtı değildir · zorunlu check `skipped/queued/cancelled` ise PASS sayılmaz · main'e doğrudan push/merge yok.
İnsan kapıları (H1–H7) ajan tarafından "yapıldı" işaretlenemez; `artifacts/H1-H2/` altında **"bekliyor"** olarak izlenir.

`Durum` değerleri: `planlandı | kodlanıyor | verify bekliyor | PR açık | CI bekliyor | merged | blocked | insan bekliyor`

---

## 1. Dilim panosu

| Dilim | Ajan | Branch | PR | Head | CI | A7 | Durum |
|---|---|---|---|---|---|---|---|
| KICKOFF-BASELINE | A7 | — | — | `15c5ab8` | — | **NO-GO** | A7 NO-GO (12 bulgu: 2 blocker / 4 major / 6 minor) — dilim kapanmadan düzeltilir |
| R1 | A1 | `p1b/leave-decision-impact-gate` | #357 | kod `12876bc` · dal head `66735d8` | ❌ Backend CI `35926738685` · DB Smoke `35926738721` · Gate 1 CI `35926738663` (hepsi FAILURE) | verify bekliyor | CI kırmızı + A7 verify kuyruğunda · **A1 sahipliğinde** (A6 dokunmaz) |
| R4 | A2 | `p1b/security-context-default-deny` | yok | `3a901f9` (origin'e push) | PR yok → PR/CI koşusu yok | verify bekliyor | üretim kodu 1350 satır · A7 verify kuyruğunda · PR açılmadı |
| R5 | A3 | `p1b/notification-consent-versioned` | yok | `2dcdb49` (origin'e push) | PR yok → PR/CI koşusu yok | verify bekliyor | consent versioning + AuditLogRepository wiring fix |
| A3-redaction | A3 | `p1b/audit-kvkk-redaction` | yok | `443d366` (fix: `5208e8f`) | PR yok → PR/CI koşusu yok | verify bekliyor | PR #356 review bulgularının **kod düzeltmesi** burada |
| A4-F1 | A4 | (worktree WIP) | yok | commit'siz WIP | — | — | ORCH anlık görüntüsünü aldı (kanıt snapshot) · **commit yok** |
| R12 | A6 | `p1b/reports-eokul-quarantine-final` | yok | — | — | — | planlandı (A ve C bittikten sonra) |
| R13 | A6 | `p1b/audit-ac-evidence` | yok | — | — | — | planlandı (R12 sonrası) |
| R14 | A6 | `docs/258-truth-matrix-15c5ab8` | **#356** | `a5a19ae` | ❌ PR Governance / Review Thread Resolution `35844318286` · ❌ Vercel (status) | — | **blocked** |
| R15 | A6 | `p1b/attendance-verdicts-rebind` | yok | — | — | — | planlandı (R10/R12'ye bağlı) |
| **#358** | A3 | `p1b/audit-kvkk-redaction` | yok | — | — | — | planlandı · audit checkpoint **trust-anchor** boşluğu (signature verify) · issue [sisbas/OkulYonetimSaaS#358](https://github.com/sisbas/OkulYonetimSaaS/issues/358) |

> **Sütun disiplini:** `Head` **doğrulanmış** SHA'dır (`git rev-parse` / `git ls-remote`), `CI` **run URL** ya da run id taşır; "yeşil" yalnız `success` için yazılır.

---

## 2. Governance kuyruğu (PR durumu)

| PR | Başlık kısası | Head | Merge durumu | Engel |
|---|---|---|---|---|
| **#356** | docs(truth): reconcile Phase 1 truth matrix to main `15c5ab8` | `a5a19ae` | `BLOCKED` | 2 çözülmemiş review thread (`PRRT_kwDOTOQOC86lGBOO`, `PRRT_kwDOTOQOC86lGBOc`) + `Vercel` status FAILURE (H2 insan kapısı, #329) |
| **#357** | feat(leaves): onay kararını gerçek etki analiziyle tek transaction içinde üret (Refs #263) | `66735d8` | `BLOCKED` | Backend CI / DB Smoke / Gate 1 CI FAILURE + Review Thread Resolution FAILURE + Vercel (H2) |
| **#359** | docs(phase2): plan-of-record + progress board (bu PR) | `04d8c2c` | `BLOCKED` | Vercel (H2) + Codex review thread'leri (aşağıda `fixed:` kaydı) · Backend CI düzeltmesi `04d8c2c` ile |
| — | açık başka PR yok (2026-09-24 doğrulaması: `gh pr list --state open` = {#356, #357, #359}) | — | — | — |

**R14 thread politikası (governance, pazarlık dışı):** her thread yalnız `fixed:<sha>` kanıtıyla kapatılır ve yalnız o commit **main'e merge olduktan sonra** resolve edilir.
`deferred`/susturma yorumuyla kapatma yasak (`master-prompt-v2.md` §11-8). Kanıt: `artifacts/R14/evidence.md`.

---

## 3. İnsan kapıları (H1–H7) — ajan "yapıldı" diyemez

| # | Kapı | Durum | Kanıt/paket |
|---|---|---|---|
| H1 | Prod env secret ADLARI + `/api/v1/health` = 200 (#332) | **bekliyor (insan)** | `artifacts/H1-H2/H1-prod-env-and-health.md` |
| H2 | Vercel GitHub App preview onarımı veya kayıtlı waiver (#329) | **bekliyor (insan)** | `artifacts/H1-H2/H2-vercel-waiver.md` |
| H3 | PR başına review + merge (branch protection) | bekliyor (insan) | `docs/devops/merge-governance-standard.md` |
| H4 | Pilot okullar / MSA-DPA / Go-No-Go | bekliyor (insan) | plan §10 |
| H5 | DPO/KVKK: consent modeli, DPIA v1, ihlal prosedürü | bekliyor (insan) | `artifacts/H1-H2/H1-prod-env-and-health.md` §H5 notu (pseudonym rotasyonu) |
| H6 | Milestone hijyeni (M2/M3 kapatma, M4–M7 due date, Faz 1b milestone) | bekliyor (insan) | `artifacts/R14/milestone-hygiene-proposal.md` |
| H7 | Yedek/geri yükleme + rollback provası, SLO alarmı | bekliyor (insan) | plan §10 |

---

## 4. Kayıt (append-only changelog)

| Tarih | Olay | Kanıt |
|---|---|---|
| 2026-09-23 | Plan-of-record (`docs/phase2/**`) gitignore'dan muaf tutuldu ve repoya alındı; bu pano oluşturuldu | `docs/phase2/`, `.gitignore`; PR bu commit |
| 2026-09-23 | KICKOFF-BASELINE A7 NO-GO (12 bulgu) ORCH tarafından raporlandı | `artifacts/verify/**` (A7 worktree) |
| 2026-09-23 | R1/R4/R5/A3-redaction worktree'leri origin'e push edildi; R1 PR #357 açıldı | `git ls-remote origin` · `gh pr list` |
| 2026-09-24 | H1/H2 insan kapısı paketi hazırlandı (`artifacts/H1-H2/`); H1 zorunlu secret ADLARINA `KVKK_PSEUDONYM_KEY` (>=32) + `KVKK_PSEUDONYM_KEY_VERSION` + `AUDIT_HMAC_PREVIOUS_KEYS` eklendi, H5/DPO rotasyon notu işlendi; H2'ye PR #356 `Vercel` FAILURE kanıtı + waiver taslağı kaydedildi | `artifacts/H1-H2/H1-prod-env-and-health.md` · `artifacts/H1-H2/H2-vercel-waiver.md` · `gh pr view 356` |
| 2026-09-24 | Bayat doküman senkronu (R1 sonrası): `docs/leaves/leave-runtime-contract.md` impact-transaction/out-of-scope düzeltmesi; ölü UI etiketi `frontend/ux/spec.md` §13 + `frontend/runtime/app.js`'ten kaldırıldı | `docs/leaves/leave-runtime-contract.md` · `frontend/ux/spec.md` · `frontend/runtime/app.js` |
| 2026-09-24 | Audit checkpoint imza (trust-anchor) boşluğu için issue **#358** açıldı, A3'e yönlendirildi | [sisbas/OkulYonetimSaaS#358](https://github.com/sisbas/OkulYonetimSaaS/issues/358) |
| 2026-09-24 | Plan-of-record PR **#359** açıldı (`p1b/phase2-plan-of-record` @ `60319e4`) | `https://github.com/sisbas/OkulYonetimSaaS/pull/359` |
| 2026-09-24 | PR #359 Backend CI FAIL (run `36059456265`): `test/contracts/leave-runtime.contract.spec.ts` hâlâ eski doküman metnini bekliyor → `docs/leaves` senkronu `04d8c2c` ile geri alındı; A1 R1 merge'i sonrasına ertelendi | `test/contracts/leave-runtime.contract.spec.ts` · `04d8c2c` |
| 2026-09-24 | Codex review thread (H1 paketi): `AUDIT_HMAC_PREVIOUS_KEYS` runtime tarafından okunmuyor → rotasyon uçtan uca desteklenmiyor; H1 paketine "BİLİNEN BOŞLUK" notu eklendi (iddia kaldırıldı) | `artifacts/H1-H2/H1-prod-env-and-health.md` |
