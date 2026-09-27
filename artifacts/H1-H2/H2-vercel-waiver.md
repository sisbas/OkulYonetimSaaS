# H2 — Vercel GitHub App preview onarımı **veya** kayıtlı waiver (#329) (İNSAN KAPISI)

**DURUM: WAIVER KAYITLI (CTO, 2026-09-27)** · **Sahip:** İnsan sahibi/operatör · **Refs:** #329, plan §10/H2
**Karar belgesi:** `docs/devops/vercel-h2-waiver-and-observation.md` (waiver + **gözlem alternatifi**).
**Kural:** Gizleme/susturma YASAK. Bu dosya FAILURE kayıtlarını **olduğu gibi** (run URL'i ile) taşır.

---

## 1. Kanıt — PR #356 `Vercel` status FAILURE (kayıt, gizlenmez)

| Alan | Değer |
|---|---|
| PR | **#356** · `docs(truth): reconcile Phase 1 truth matrix to main 15c5ab8` |
| Head SHA | `a5a19aeedda6dca0ddacf0572dd4c0e1f928cec4` |
| Merge durumu | **BLOCKED** |
| Vercel status | **FAILURE** (StatusContext, `context: Vercel`) |
| Vercel hedef URL | `https://vercel.com/sisbas-projects-d3c081cb/okulyonetimsaas/4ck6ehQ9vdXYmpfbmHGnQ7a6Jy8F` |
| Review Thread Resolution | **FAILURE** · `https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35844318286/job/107126663480` |
| Doğrulama kaynağı | `gh pr view 356 --json statusCheckRollup` (2026-09-24) |

> Not: `Vercel Preview Comments` (CheckRun) = SUCCESS; asıl blok `Vercel` **StatusContext** FAILURE'dır.
> Bu ayrım kayda geçirilir; FAILURE **gizlenmez/susturulmaz**.

## 2. Neden Vercel preview kabul yüzeyi değildir (constitution I)

Constitution **I (Backend API Scope Is Authoritative)**: kanonik runtime yüzeyi `/api/v1` + `/api/v1/health`'tir;
tarayıcı preview / Builder preview / statik demo **kabul tanımlamaz**. Vercel preview bir *destek* artefaktıdır.
Bu nedenle preview FAILURE, backend kabul koşullarını (test yolu + CI run + exact SHA) geçersiz kılmaz —
**ancak** kayıtlı bir waiver olmadan da görmezden gelinemez (görünür kayıt zorunlu).

## 3. Waiver metni taslağı (insan doldurur + imzalar)

```text
VERCEL PREVIEW WAIVER (kayıtlı) — #329
- Kapsam: PR <#> / head <sha> Vercel StatusContext FAILURE
- Vercel hedef URL: https://vercel.com/...
- Gerekçe: Vercel preview destek artefaktıdır; kanonik kabul yüzeyi /api/v1 + /api/v1/health'tir
  (constitution I). Backend zorunlu check'leri (Backend CI, DB Smoke, Gate 1 CI, PR Governance) SUCCESS.
- Etki: preview-only; prod runtime/DB/migration kanıtını etkilemez.
- Süre: <tarih> itibarıyla geçerli; #329 kök neden giderilince iptal.
- Onaylayan (insan): <ad / rol>    Tarih: <UTC>
- Kayıt yeri: bu dosya + #329 issue yorumu
```

## 4. Onarım yolu (alternatif — tercih edilen)

1. Vercel projesinde build log'unu incele (hedef URL); kök neden (bundle/env/build config) belirle.
2. Gizli değer gerektiren env'ler Vercel'de tanımlı mı kontrol et — **değer yazılmaz**, yalnız adlar (bkz. H1).
3. Onarım sonrası yeni preview deploy'da `Vercel` status **SUCCESS** olmalı (run URL'i kanıt).
4. Waiver uygulanacaksa §3 metni imzalanıp #329'a yorum olarak eklenir.

---

## 5. KARAR KAYDI (CTO, 2026-09-27) — waive edildi + gözlem alternatifi

| Alan | Değer |
|---|---|
| Karar | **Waiver KAYITLI** (gerçek onarım ertelendi) |
| Kapsam | `Vercel` StatusContext FAILURE (preview deployment), tüm PR'lar |
| Kapsam dışı | Zorunlu check'ler ve **H1** (prod `/api/v1/health` 200) — waive EDİLEMEZ |
| Gözlem telafisi | `WP-07F Production Observation` (manuel dispatch, `expected_head_sha` ile exact commit'e bağlı) — **merge gate'i değil** |
| Kanıt (waiver uygulanmış merge'ler) | #361 `9b20bb3`→`e794450`, #360 `8246222`→`82cfb41`, #357 `29eed7b`→`7f555c8` (üçünde de yalnız Vercel kırmızıydı) |
| İptal | #329 giderilip `Vercel` SUCCESS dönünce veya Faz 1b kapanışında |
| Karar belgesi | `docs/devops/vercel-h2-waiver-and-observation.md` |
| Gözlem kaydı | `artifacts/H1-H2/observation-log.md` |

> Bu kayıt, H2'nin "yapıldı" sayılması DEĞİLDİR: kök neden (`#329`) açıktır ve preview hâlâ kırmızıdır.
> Kayıtlı waiver, yalnız **merge blokajını** kaldırır; görünürlük gözlem kanalıyla korunur.

