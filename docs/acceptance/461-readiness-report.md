# #461 — Readiness report (baseline `origin/main` `e0ff64e`)

**Tarih:** 2026-11-02 · **Branch:** `feat/461-acceptance-foundation` · **Sınıflandırma:** `internal`
(henüz `runtime|pilot-ready` değil)

Bu rapor #461'in beş kabul kriterini mevcut main'e karşı değerlendirir. Amaç eksikleri gizlemek
değil, kapatma sırasını kanıtlamaktır.

## Kabul kriterleri

| # | Kriter | Durum | Kanıt / gerekçe |
|---|---|---|---|
| AC-1 | Beş görevi kapsayan checklist spec user story'lerinden türetilmiş | **PASS (bu branch)** | `docs/acceptance/461-manual-acceptance-checklist.md`; görevler #441 user story 14–46 ve 1–13'e dayanıyor. |
| AC-2 | Gerçek okul müdürü checklist'i yardımsız tamamlar | **BLOCKED** | Gerçek müdür ve staging URL henüz yok; ayrıca görev 2/3/4/5 için arayüz/foundation eksik. |
| AC-3 | Kritik/ciddi erişilebilirlik bulgusu = 0 | **BLOCKED** | #269 kanıtı eski pilot runtime içindir (axe critical/serious = 0, 390×844). Yeni ekranlar için yeniden üretilmeli. |
| AC-4 | Mobil-first küçük viewport'ta doğrulandı | **BLOCKED** | Mevcut `styles.css` yalnız `@media (max-width: 820px)` içeriyor; yeni ekranların mobil kanıtı yok. |
| AC-5 | Sonuç ticket'a isim/tarih ile kaydedildi | **BLOCKED** | AC-2 tamamlanmadan kayıt üretilemez. |

## Beş görev — mevcut yetenek

| Görev | Bugünkü durum | Eksik | Bağlı iş |
|---|---|---|---|
| 1. Bugün'de günün kuyrukları | **FAIL** — Bugün paneli operasyon kuyruklarıyla açılmıyor; takvim önde. | Operasyon-öncelikli hiyerarşi, alan bazlı boş durumlar, stratejik hedefler. | #454 → #458 |
| 2. Operasyon'da yerinde yoklama | **FAIL** — Yoklama için ham `scheduleEventId` + `studentIds` gerekiyor; günün tüm dersleri okunamıyor; roster API'si yok. | F1 roster, F2 günün dersleri, F3 sunucu-türetimli oturum, #454 UI. | F1 → F2 → F3 → #454 |
| 3. İzin kararı + yedek kapısı | **FAIL** — `impact`/`candidates` yalnız onaylı izinde; onay açık dersi engellemiyor. | F4 önizleme + sunucu kapısı, #455 karar rayı. | F4 → #455 |
| 4. Bildirim onayı + mesaj + consent | **FAIL** — Snapshot'ta mesaj gövdesi yok; consent kapısı UI'da yok. | F5 mesaj gövdesi + consent kontrolü, #456 UI. | F5 → #456 |
| 5. Programı gün takvimiyle yayınla | **FAIL** — Program ham UUID formu; schedule read endpoint'i yok; publish gate yok. | #447/#448 sign-off → #449 → #450 → #451/#452 → #453. | Program track |

## Bloker zinciri

```text
F1 → F2 → F3 → #454 → #458 ─┐
        └────→ #455 (F4)     ├→ #460 → #461
F5 ─────→ #456               │
                             │
#447/#448 → #449 → #450 → #451/#452 → #453 ─┘
```

- **#460** açık; blocker'ları #453, #456, #458.
- **#453** açık; blocker'ları #451, #452.
- **#451/#452** açık; #450'ye bağlı.
- **#450/#449** açık; #447/#448 insan sign-off'larına bağlı.
- **#461** açık; #460'a bağlı.

## Ortam durumu

| Ortam | Durum | Not |
|---|---|---|
| Production `/api/v1` | **KIRIK** | #332: `JWT_ACCESS_SECRET` eksik; `/api/v1` 500. #507 açık. |
| Staging | **BEKLİYOR** | Owner “staging URL” sağlayacak; auth secret'ları ve sentetik seed gerekli. |
| Yerel | **YOK** | Bu worktree'de `node_modules`, Docker, PostgreSQL yok; tam E2E yalnız CI'da (`postgres:16`). |
| CI | **VAR** | `test:e2e` gerçek Chromium + gerçek Nest + gerçek PostgreSQL ile çalışıyor; insan kapısı için tarayıcı erişimi yok. |

## Mevcut kanıtlar ve sınırları

- #269 / PR #506: axe critical/serious = 0 (masaüstü + mobil), 390×844 yatay taşma yok, klavye
  akışı, DB audit + PII-redakte trace. **Sınır:** eski pilot runtime; #441 ekranları için geçerli
  değil.
- `test/frontend-runtime/runtime-wcag-evidence.spec.ts`: statik WCAG kanıtı; **sınır:** DOM/browser
  davranışını değil, shell/CSS sözleşmesini doğruluyor.
- `test/e2e/stage5-full-journey.acceptance.e2e-spec.ts`: uçtan uca journey; **sınır:** yeni beş
  görev, dört publish-blocked state, 412/428 ve canlı istatistik henüz eklenmedi.

## Bu branch'te yapılanlar

- [x] Kapsam istisnası ADR'si: `docs/adr/0004-student-roster-and-preapproval-foundation.md`.
- [x] Gözlemci checklist'i: `docs/acceptance/461-manual-acceptance-checklist.md`.
- [x] #447/#448 sign-off kaydı: `docs/acceptance/461-signoff-record.md`.
- [x] F1 roster foundation: `docs/acceptance/461-f1-roster-surface.md`; birim testleri
      yeşil, gerçek PostgreSQL kanıtı CI'da (`test/database/student-roster.db.spec.ts`).
- [ ] F2–F5 foundation.
- [ ] #454/#455/#456/#458 UI.
- [ ] #447/#448 sign-off.
- [ ] #449–#453 program track.
- [ ] #460 journey.
- [ ] #461 gerçek müdür kapısı.

## Kapanış için gereken kanıt

1. #460 journey: exact head SHA + test yolu + yeşil CI run URL'si; dört blocked state, 412/428,
   teacher no-draft, canlı istatistik.
2. Yeni ekranlar için axe raporu: critical = 0, serious = 0; masaüstü + 390×844.
3. Mobil viewport ekran görüntüleri ve yatay taşma kontrolü.
4. Staging URL + build SHA + sentetik veri seti.
5. Doldurulmuş checklist + müdür adı/tarihi + gözlemci imzası; #461 yorumu.
6. #447/#448 imzaları; #453/#460 kapanış kanıtları.

> **Not:** “PR merge edildi” kapanış kanıtı değildir. Zorunlu check `skipped/queued/cancelled` ise
> PASS sayılmaz. İnsan kapıları ajan tarafından “yapıldı” işaretlenemez.
