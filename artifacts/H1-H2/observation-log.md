# H2 Gözlem Kaydı (Production Observation Log)

**Amaç:** Vercel preview waive edildiği için (bkz. `docs/devops/vercel-h2-waiver-and-observation.md`),
değişikliklerin **gözlemlenmesi** bu dosyada kayıt altına alınır. Bu bir **merge gate'i değildir**.
**Kural:** Her `main` merge'i / prod deploy sonrası bir satır eklenir. Gözlem kırmızısı çıkarsa
`RCA → REPAIR` ayrı iş olarak açılır; **gizlenemez**.

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

- `target_base_url`: prod API tabanı (ör. `https://<prod-alias>/api/v1`)
- `production_alias`: kullanıcıların gördüğü genel alias
- `production_deployment_id`: Vercel deployment kimliği (`dpl_...`) — varsa
- `expected_head_sha`: `7f555c8` (bu turda)

> Not: Prod secret kurulumu **H1** kapsamındadır (`KVKK_PSEUDONYM_KEY`, `JWT_*`, `AUDIT_HMAC_KEY`, `DATABASE_URL`).
> H1 tamamlanmadan prod gözlemi yeşil dönmeyebilir; sıra: **H1 env → deploy → observation**.
