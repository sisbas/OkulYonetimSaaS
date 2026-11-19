# H2 Gözlem Kaydı (Production Observation Log)

**Amaç:** Vercel preview waive edildiği için (bkz. `docs/devops/vercel-h2-waiver-and-observation.md`),
değişikliklerin **gözlemlenmesi** bu dosyada kayıt altına alınır. Bu bir **merge gate'i değildir**.
**Kural:** Her `main` merge'i / prod deploy sonrası bir satır eklenir. Gözlem kırmızısı çıkarsa
`RCA → REPAIR` ayrı iş olarak açılır; **gizlenemez**.

> **Not (2026-11-19):** #503 ile preview deployment'ları tekrar çalışır hâle geldi ve #329 waiver'ı
> **RETIRED** oldu (bkz. `docs/devops/vercel-h2-waiver-and-observation.md` §5). Yukarıdaki gerekçe artık
> tarihseldir; bu dosya gözlem kaydı olarak korunur.

## Çalıştırma

```bash
gh workflow run "WP-07F Production Observation" \
  -f target_base_url="https://<prod-alias>/api/v1" \
  -f production_alias="https://<prod-alias>" \
  -f production_deployment_id="<dpl_...>" \
  -f expected_head_sha="$(git rev-parse origin/main)"
```

## Kayıt tablosu

| # | Tarih (UTC) | main SHA | Deploy/alias | Observation run URL | overallStatus | Not |
|---|---|---|---|---|---|---|
| 1 | 2026-09-27 | `7f555c8` (#357 merge) | — | **bekliyor** (prod alias/deploy kimliği insan girdisi; H1 ile birlikte yürütülecek) | — | H1 (prod `/api/v1/health` 200) ile aynı turda çalıştırılacak |

## İlk tur için gerekli insan girdileri (H1 ile ortak)

```bash
# Exact SHA'yı taze remote'tan al (stale origin/main sözleşmeyi kırar)
git fetch origin --prune
FULL_SHA="$(git rev-parse origin/main)"   # bu turda: 7f555c8c30b207fb2500e09335d387858b096566
```

- `target_base_url`: prod API tabanı (ör. `https://<prod-alias>/api/v1`)
- `production_alias`: kullanıcıların gördüğü genel alias
- **Deployment kimliği — ZORUNLU (biri yeterli):** `production_deployment_url` **veya** `production_deployment_id` (`dpl_...`).
  İkisi de boş verilirse `scripts/observe-production-runtime.js` → **`MISSING_DEPLOYMENT_IDENTITY`** ile run'ı reddeder.
  Yalnız alias'a sahipseniz bu alana deployment URL'ini yazın.
- `expected_head_sha`: **tam 40 karakter** SHA → bu turda `7f555c8c30b207fb2500e09335d387858b096566`
  (workflow tam string karşılaştırması yapar; **kısa SHA kullanılamaz**).

> Not: Prod secret kurulumu **H1** kapsamındadır (`KVKK_PSEUDONYM_KEY`, `JWT_*`, `AUDIT_HMAC_KEY`, `DATABASE_URL`).
> H1 tamamlanmadan prod gözlemi yeşil dönmeyebilir; sıra: **H1 env → deploy → observation**.

---

## #503 preview toparlanması (2026-11-19)

| Tarih | PR / head | Deployment | Sonuç | Kanıt |
|---|---|---|---|---|
| 2026-11-19 | #530 / `eb70ff3` | [`HKPv3FdVv7Lj7RtwqYK8rvWyVb1j`](https://vercel.com/sisbas-projects-d3c081cb/okulyonetimsaas/HKPv3FdVv7Lj7RtwqYK8rvWyVb1j) | Vercel check `SUCCESS` · deployment `READY` | `gh pr checks 530` |

- Kök neden: Neon Free 10-branch limiti + biriken `preview/*` branch'leri.
- Onarım: kullanıcı branch'leri temizledi; taze redeploy `READY`.
- Kalıcı önleme: `.github/workflows/cleanup-neon-preview-branch.yml` + Vercel pre-production retention.
- Bu kanıtla #329 waiver'ı **RETIRED**; ayrıntılar `docs/devops/vercel-h2-waiver-and-observation.md` §5'te.
