# H2 — Vercel Preview: Kayıtlı Waiver + Gözlem Alternatifi (#329)

**Karar tarihi:** 2026-09-27 · **Karar veren:** CTO (insan kapısı H2) · **Durum:** **WAIVER KAYITLI**
**Refs:** #329, #332 (H1), `docs/phase2/remaining-plan-v2.md` §10/H2 · **Sahiplik:** docs = A6; karar = CTO.

Bu belge, Vercel GitHub App preview hatasının **merge bloklayıcı olmadığını** kayda geçirir ve
CTO'nun talebi doğrultusunda **değişiklikleri gözlemleme** işini ayrı bir kanala bağlar. Gizleme/susturma
YASAK: aşağıdaki FAILURE kayıtları olduğu gibi taşınır.

---

## 1. Karar

1. **Waiver verildi:** `Vercel` **StatusContext** FAILURE'ı, PR merge için **bloklayıcı değildir**.
2. **Gerekçe:** Constitution **I** — kanonik kabul yüzeyi `/api/v1` + `/api/v1/health`'tir; tarayıcı/Builder
   preview **kabul tanımlamaz**. Vercel preview bir destek artefaktıdır.
3. **Waiver'ın kapsamı dışı:** zorunlu check'ler (Backend CI, DB Smoke, Gate 1 CI, Sprint 1 Quality Gate,
   Sensitive Pattern Scanner, GitGuardian, PR Governance) ve **H1** (prod `/api/v1/health` = 200). Bunlar
   waiver ile geçilemez.
4. **Gözlem korunur (CTO talebi):** preview/deploy davranışı **ayrı, zorunlu-olmayan** bir gözlem kanalıyla
   izlenir (§3). Bu kanalın yeşil/kırmızı olması merge'i bloklamaz; **kanıt ve görünürlük** sağlar.

### 1.1 Kararın kanıtı — waiver uygulanmış merge'ler (Vercel FAILURE iken merge edildi)

| PR | Head SHA | Vercel | Merge commit | Merge zamanı |
|---|---|---|---|---|
| #361 `fix(audit,kvkk)…` | `9b20bb3` | **FAILURE** | `e794450` | 2026-09-27 13:43 UTC |
| #360 `feat(security)…` | `8246222` | **FAILURE** | `82cfb41` | 2026-09-27 13:43 UTC |
| #357 `feat(leaves)…` | `29eed7b` | **FAILURE** | `7f555c8` | 2026-09-27 13:50 UTC |

Kaynak: `gh pr list --state merged`, `gh pr checks <n>` (2026-09-27). Bu üç merge'de **tüm zorunlu check'ler
yeşildi**; yalnız `Vercel` StatusContext kırmızıydı → waiver pratikte uygulanmış ve kayıt altına alınmıştır.

---

## 2. Kayıtlı waiver metni

```text
VERCEL PREVIEW WAIVER (kayıtlı) — #329
- Kapsam: `Vercel` StatusContext FAILURE (preview deployment) · tüm PR'lar
- Örnek kayıtlar: #356 (a5a19ae), #357 (29eed7b), #360 (8246222), #361 (9b20bb3)
- Gerekçe: Vercel preview destek artefaktıdır; kanonik kabul yüzeyi /api/v1 + /api/v1/health'tir
  (constitution I). Zorunlu check'ler SUCCESS olmadan bu waiver HİÇBİR merge'i meşrulaştırmaz.
- Etki: preview-only; prod runtime/DB/migration/kanıt yüzeylerini etkilemez.
- Gözlem telafisi: §3'teki manuel gözlem workflow'u zorunlu değildir ama her prod deploy'unda çalıştırılır.
- Süre: 2026-09-27 itibarıyla geçerli; #329 kök nedeni giderilip `Vercel` SUCCESS dönünce İPTAL edilir.
- Onaylayan (insan): CTO (H2 sahibi) · Tarih: 2026-09-27
- Kayıt yeri: bu dosya + `artifacts/H1-H2/H2-vercel-waiver.md` + #329 issue yorumu
```

---

## 3. Gözlem alternatifi (merge gate'i DEĞİL, görünürlük kanalı)

Vercel preview'ın sağladığı "değişikliği görme" ihtiyacı, mevcut **WP-07F Production Observation**
workflow'u ile karşılanır. Bu workflow **manuel** çalışır, hedef URL + **exact head SHA** alır ve
runtime/API gözlem artefaktı üretir (artifact, exact SHA'ya bağlıdır).

### 3.1 Çalıştırma (her `main` merge'i / prod deploy sonrası)

```bash
# 1) Exact SHA'yı TAZE remote'tan türet (stale origin/main ile gözlem sözleşmesi kırılır)
git fetch origin --prune
FULL_SHA="$(git rev-parse origin/main)"          # 40 karakterlik tam SHA

# 2) Gözlemi çalıştır (workflow uzak varsayılan daldan dispatch edilir → --ref main açıkça verilir)
gh workflow run "WP-07F Production Observation" --ref main \
  -f target_base_url="https://<prod-alias>/api/v1" \
  -f production_alias="https://<prod-alias>" \
  -f production_deployment_url="https://<deployment-url>" \
  -f production_deployment_id="<dpl_...>" \
  -f expected_head_sha="$FULL_SHA"

# 3) Sonuç + artefakt
gh run list --workflow "WP-07F Production Observation" --limit 3
gh run view <run-id>
```

**Zorunlu girdiler (script sözleşmesi):**

- `expected_head_sha`: **tam 40 karakter** SHA (workflow `report.commitSha`/`deploymentCommitSha` ile **birebir string** karşılaştırır; kısa SHA gözlemi FAIL ettirir).
- **Deployment kimliği zorunludur:** `production_deployment_url` **veya** `production_deployment_id`'den **en az biri** verilmelidir;
  ikisi de boşsa `scripts/observe-production-runtime.js` → `MISSING_DEPLOYMENT_IDENTITY` ile run'ı reddeder.
  (Yalnız alias'a sahipseniz `production_deployment_url` alanını doldurun.)
- `self_test_unreachable_api: true` yalnız **negatif prova** içindir (erişilemez API → `overallStatus=FAIL`
  + `API_UNREACHABLE` beklenir); normal gözlemde kullanılmaz.

### 3.2 Tamamlayıcı yüzeyler (mevcut)

| Workflow | Ne yapar | Zorunlu merge gate'i mi? |
|---|---|---|
| `WP-07F Production Observation` | Prod runtime + `/api/v1` gözlemi, exact SHA artefaktı | **Hayır** (manuel, gözlem kanalı) |
| `WP-07F P0 Browser E2E` | Fresh DB + gerçek backend + gerçek tarayıcı kabulü | **Hayır — mevcut ruleset'te zorunlu status check DEĞİL** |
| `demo-frontend-smoke` / `full-vision-demo-smoke` | Statik/demo yüzey dumanı | Hayır |

**Düzeltme (review P2):** `P0 browser E2E and artifact evidence`, `.github/rulesets/main-merge-governance.json`
içindeki 10 zorunlu context arasında **yer almaz** (o liste: Sprint 1 Quality Gate · Backend CI · DB Smoke ·
Gate 1 CI · Sensitive Pattern Scanner · GitGuardian scan · PR Governance / Body Validation · Issue Reference ·
Rollback Plan · Acceptance Criteria). Bu workflow **kabul yüzeyi** olarak koşar ve kanıt üretir, ancak bugünkü
ruleset'e göre merge'i **bloklamaz**. Onu zorunlu hâle getirmek ayrı bir governance değişikliğidir (ruleset + `docs/devops/required-checks.md` güncellemesi) ve bu belgenin kapsamında değildir.

### 3.3 Gözlem kaydı kuralı

- Her prod deploy sonrası gözlem run'ının **URL'i ve `expected_head_sha`'sı** ilgili PR/issue yorumuna veya
  `artifacts/H1-H2/observation-log.md`'ye yazılır.
- Gözlem kırmızısı çıkarsa: `RCA → REPAIR` (ayrı iş); **merge engeli değildir**, ancak gizlenemez.
- H1 (prod `/api/v1/health` = 200) ayrı ve **zorunlu** insan kapısıdır; bu waiver onu kapsamaz.

---

## 4. İptal koşulları

1. `#329` kök nedeni giderilir ve yeni bir preview deploy'da `Vercel` status **SUCCESS** dönerse waiver iptal edilir.
2. Faz 1b kapanış kapısı (§12) — H2 satırı "kayıtlı waiver" olarak kapatılır veya gerçek onarım kanıtı istenir.
3. Vercel GitHub App kurulumu/preview lifecycle değişirse bu belge güncellenir (sürüm notu eklenir).

**İlişkili:** `artifacts/H1-H2/H2-vercel-waiver.md` · `artifacts/H1-H2/H1-prod-env-and-health.md` ·
`docs/devops/required-checks.md` · `docs/phase2/progress-v2.md`
