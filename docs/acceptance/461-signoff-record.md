# #447 / #448 — Human sign-off record

> Bu kayıt insan kapıları içindir. Ajan kendi başına sign-off veremez; “bekliyor” durumu
> `ready-for-human` olarak izlenir. Program track'i (#449 → #453 → #460 → #461) bu imzalar
> tamamlanmadan kapanmaz.

## Kapsam

| Issue | Konu | Bağlayıcı belge |
|---|---|---|
| #447 | Schedule runtime alignment + programme read surface | `docs/m3/schedule-contract-v2.md`, `docs/acceptance/447-review-package.md` |
| #448 | Management draft-read permission key | `src/rbac/permission-catalog.ts`, `docs/m3/schedule-contract-v2.md` |
| #449 | Programme read surface (#447'nin parçası; ayrıca takip edilir) | `docs/acceptance/447-review-package.md` |

## #447 — Schedule contract sign-off

### Kapsam ve imza notu (2026-11-17, owner kararı)

- **Kapsam B:** #449 (programme read surface) ayrı bir PR değil; bu paketin parçasıdır.
  `GET /schedules/drafts`, `GET /schedules/:scheduleId`, `GET /schedules/published`
  ve `@PermissionsAny` (OR yetki) guard'ı bu sign-off'a dahildir.
- **Sürüm kararı (2026-11-17, owner):** Contract `M3_CONTRACT_V2` / `2.0.0`'a
  yükseltilir; sözleşme metninin anlamı donmuş metinle birebir aynıdır; yalnız
  ID/descriptor/sürüm/dosya adı değişir. §13.2 (dedicated contract-only PR) ve
  §13.5 (contract PR'ında runtime kodu yasak) kurallarının bu değişiklik için
  askıya alındığı kayda geçer.
- **İmza notu:** Beş rolü **aynı kişi** (sisbas, owner) imzalamıştır. Bu,
  bağımsız gözden geçirme değil; ilgili risklerin tümünün tek sorumlu mercide
  toplandığı açıkça beyan edilmiştir.

### İmza vermesi gereken roller

| Rol | İsim | Karar (`APPROVE` / `CONCERN` / `BLOCK`) | Tarih | Gerekçe / koşul | Kanıt |
|---|---|---|---|---|---|
| Product / PO | | | | | |
| Technical Architecture | | | | | |
| Data Model | | | | | |
| Frontend | | | | | |
| QA / KVKK / Security | | | | | |

### Onaylanan sözleşme maddeleri

- [ ] Draft creation plural canonical path'te (`POST /schedules/drafts`); koşullu revision header kabul etmiyor; revision 1'de oluşturuyor.
- [ ] Mevcut-kaynak mutasyonları kaynağa bağlı, tam eşleşen koşullu revision header'ı (`If-Match`) istiyor.
- [ ] Eksik header 428 `SCHEDULE_VERSION_REQUIRED`, uyuşmayan header 412 `SCHEDULE_VERSION_MISMATCH`; ikisi birbirine ve genel hataya çökmüyor.
- [ ] Read surface var; yayınlanmış/taslak ayrımı izinle korunuyor (`management_draft` / `published_branch` / `published_own`).
- [ ] Validation `schedule:validate` + `schedule:conflict:read` ile korunuyor; genel read ile değil.
- [ ] Cross-scope erişim non-enumerating 404 (`Kayıt bulunamadı`, tenant/branch/unknown-id ayırt edilemez).
- [ ] Müsait sözleşme descriptor `M3_CONTRACT_V2` / `2.0.0`'dır; `m3-schedule-contract.spec.ts` bunu pinler.
- [ ] Yetkilendirme guard'ı yalnız `every`'yi yönlendirir; OR semantiği `@PermissionsAny` ile açıktır.
- [ ] Mutasyonlar `ETag` yayımlar; istemci revision'ı kendi hesaplamaz.
- [ ] Frontend reason/state eşlemesi on altı kanonik kodun tamamını kapsıyor (`test/frontend-runtime/runtime-state-map-consistency.spec.ts` pinler). Dört publish-blocked state'in ekranları ve #453 kapı rayı bu PR değildir.


### Karar notu

```text
#447 sign-off:
- Product/PO:
- Technical Architecture:
- Data Model:
- Frontend:
- QA/KVKK/Security:
Sonuç: APPROVE | CONCERN | BLOCK
Koşullar:
Tarih:
```

## #448 — Management draft-read permission key sign-off

> **KAPANDI — 2026-11-17, sisbas (owner), PR #527 (`0b75a011`).** Onay kaydı
> issue #448 yorumundadır (2026-11-17, "Kapanış notu"); required check'ler yeşildir.
> Bu tablo o kararın yansıtılmış özetidir.

### İmza vermesi gereken roller

| Rol | İsim | Karar (`APPROVE` / `CONCERN` / `BLOCK`) | Tarih | Gerekçe / koşul |
|---|---|---|---|---|
| Product / PO | sisbas | APPROVE | 2026-11-17 | `schedule:draft:read` yetki katalogunda onaylandı; yalnız yönetim taslak okuması |
| Security / KVKK | sisbas | APPROVE | 2026-11-17 | Teacher/viewer/parent/assistant grant'ları yok; migration idempotent |
| Technical Architecture | sisbas | APPROVE | 2026-11-17 | `1920000000000-AddScheduleDraftReadPermission` tüm tenant'lara anahtar + admin/ops grant'ı |
| Data Model | sisbas | APPROVE | 2026-11-17 | Yalnız permissions/role_permissions tablosu; iş verisine dokunmaz |

### Onaylanan maddeler

- [x] Yeni izin anahtarı yalnız yönetim taslağı okumasını açar; yayınlanmış okumayı genişletmez.
- [x] Anahtar `permission-catalog.ts` ve seed'de tanımlı; rol matrisi fail-closed.
- [x] Anahtar `/context` capability kanalında makine-okur olarak taşınır; kullanıcı metnine sızmaz.
- [x] Audit/KVKK gereksinimi net: okuma audit'i yok; yalnız yolu `schedule:draft:read` olan yönetim eylemleri audit edilir.
- [x] Cross-tenant ve cross-branch negatif testleri var.
- [x] Geri alma planı var (anahtar kaldırıldığında 403/404 davranışı ve `1920000000000` migration'ın revert'ü).

### Karar notu

```text
#448 sign-off:
- Product/PO:
- Security/KVKK:
- Technical Architecture:
- Data Model:
Sonuç: APPROVE | CONCERN | BLOCK
Koşullar:
Tarih:
```

## Reviewer'a giden paket

Her imza isteğinde şunlar birlikte gönderilir:

1. İlgili issue ve bağlayıcı sözleşme bağlantısı.
2. Değişen dosyaların diff'i ve exact head SHA.
3. Test yolu + CI run URL'si (yeşil, zorunlu check'ler skipped/queued değil).
4. Riskler, geri alma planı ve KVKK/audit notu.
5. Açık sorular ve reviewer'dan beklenen karar formatı.

## Durum

| Issue | Durum | Son güncelleme | Not |
|---|---|---|---|
| #447 | `ready-for-human` — paket hazırlandı; imza bekliyor | 2026-11-17 | Paket: `docs/acceptance/447-review-package.md`; kapsam B (#449 dahil); sözleşme `M3_CONTRACT_V2` 2.0.0; aynı gün owner beş rolü imzalayacak |
| #448 | `closed` | 2026-11-17 | PR #527 (`0b75a011`), tüm required check'ler yeşil |
| #449 | açık (parçası #447) | 2026-11-17 | Kapsam B; kanıtlar PR'da; kapanış imza sonrası aynı PR'da yapılacak |

> **Kapanış kuralı:** #449 ayrı bir imza turu gerektirmez; kanıtları #447'nin
> imzasıyla aynı gövenceye bağlanır. #453, #460 ve #461 sırasıyla #447'nin
> merge'ünü beklemektedir.
> PR merge edildi bu kapıların yerine geçmez.
