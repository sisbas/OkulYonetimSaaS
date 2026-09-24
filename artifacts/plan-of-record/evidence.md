# §6.2 Devir Paketi — B0 (plan-of-record unblock) + H1/H2 hazırlık

| Alan | Değer |
|---|---|
| Dilim | **B0** (plan-of-record repoya alma) + **H1/H2 insan kapısı paketi** |
| Issue/Refs | Refs #345 #258 · H1 #332 · H2 #329 |
| Branch | `p1b/phase2-plan-of-record` (baz `origin/main` @ `15c5ab8`) |
| PR | **#359** · https://github.com/sisbas/OkulYonetimSaaS/pull/359 |
| Head | `ce5d082d728eb7bf74c1b275878fd726d33c8aa3` |
| Fix zinciri | `a78a909` → `60319e4` → `04d8c2c` → `ce5d082` |

## Değişen dosyalar

- `.gitignore` — `!docs/phase2/` + `!docs/phase2/**` muafiyeti.
- `docs/phase2/{remaining-plan-v2.md,master-prompt-v2.md,README.md,next-phase-plan.md,master-prompt.md,progress-v2.md}` — `git add -f` ile tracked (v1 BAYAT işaretli).
- `artifacts/H1-H2/H1-prod-env-and-health.md` — H1 paketi.
- `artifacts/H1-H2/H2-vercel-waiver.md` — H2 paketi.
- `frontend/ux/spec.md` §13, `frontend/runtime/app.js` — ölü `IMPACT_ANALYSIS_NOT_READY` UI etiketi.
- `docs/phase2/progress-v2.md` — issue #358 satırı + changelog.

## Çalıştırılan komut + sonuç

| Komut | Sonuç |
|---|---|
| `git add -f docs/phase2/*` | 6 dosya tracked (gitignore muafiyeti doğrulandı) |
| Mojibake taraması `Select-String 'Ã\|Ä\|Å\|â€'` | **0 bulgu** |
| `git push origin p1b/phase2-plan-of-record` | `60319e4..ce5d082` · `origin/...` = `ce5d082` (doğrulandı) |
| `gh pr view 356 --json statusCheckRollup` | Vercel FAILURE kanıtı (H2) kaydedildi |
| `gh pr view 359 --json statusCheckRollup` | Backend CI/DB Smoke/Gate1/Governance **SUCCESS** |
| `gh issue create` (trust-anchor) | **#358** açıldı, A3'e yönlendirildi |

## AC eşlemesi

| AC | Kanıt |
|---|---|
| docs/phase2 tracked | `git ls-files docs/phase2/` + `.gitignore` diff |
| progress panosu gerçek HEAD/CI | `docs/phase2/progress-v2.md` §1–§4 |
| H1 paketi (ADLAR + health 200 + şablon, secret yok) | `artifacts/H1-H2/H1-prod-env-and-health.md` |
| H2 paketi (#329 Vercel FAILURE + waiver) | `artifacts/H1-H2/H2-vercel-waiver.md` |
| İnsan kapıları "bekliyor" | Her iki dosyada `DURUM: bekliyor (insan)` |

## İnsan kapısı gereksinimi

- **H1**: prod env secret ADLARI + `/api/v1/health` = 200 → **bekliyor (insan)**.
- **H2**: Vercel preview onarımı/waiver → **bekliyor (insan)**. PR #359'da `Vercel` status FAILURE (gizlenmedi).
- **H5**: `KVKK_PSEUDONYM_KEY` rotasyonu DPO notu (H1 dosyası §4).

## Bilinen boşluklar

- `AUDIT_HMAC_KEY` rotasyonu uçtan uca desteklenmiyor (H1 "BİLİNEN BOŞLUK"; #358).
- `docs/leaves/leave-runtime-contract.md` senkronu A1 R1 merge'i sonrasına ertelendi (bkz. C paketi).
