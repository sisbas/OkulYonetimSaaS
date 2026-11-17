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
| Product / PO | sisbas | APPROVE | 2026-11-17 | Sözleşme zaten PO sahipliğinde dondurulmuştu (#107); 2.0.0 yalnız descriptor/ID/sürüm notudur, anlam değişmedi. Read surface #449 dahil edilmesi reload durumunda editör oturumunu korur | `docs/m3/schedule-contract-v2.md`; `docs/acceptance/447-review-package.md`; PR #528 |
| Technical Architecture | sisbas | APPROVE | 2026-11-17 | Guard default-deny korunur; `@PermissionsAny` yalnız OR semantiği ekler, başka route'u etkilemez; 412/428 alan başına ayrık; saveDraft tek transaction; ETag content-addressed | `0969d93`, `18602f4`; PR #528 |
| Data Model | sisbas | APPROVE | 2026-11-17 | Migration yok; şema değişmedi; snapshot tek kaynak; read yalnız SELECT; ownership/indeks korunur | `0969d93`; PR #528 |
| Frontend | sisbas | APPROVE | 2026-11-17 | İstemci revision aritmetiği söküldü; sunucudan `ETag` yankılanır; route tablosu fail-closed güncel; teacher/viewer draft keşfedemez kalıcı pin | `0969d93`, `18602f4`; PR #528 |
| QA / KVKK / Security | sisbas | APPROVE | 2026-11-17 | Cross-tenant/branch/unknown-id aynı 404; read yüzeyi PII taşımaz; audit çizgisi değişmez; parity testleri yeşil; DB suitleri CI `postgres:16` PASS | `447-review-package.md`; PR #528 CI koşuları |


### Onaylanan sözleşme maddeleri

- [x] Draft creation plural canonical path'te (`POST /schedules/drafts`); koşullu revision header kabul etmiyor; revision 1'de oluşturuyor.
- [x] Mevcut-kaynak mutasyonları kaynağa bağlı, tam eşleşen koşullu revision header'ı (`If-Match`) istiyor.
- [x] Eksik header 428 `SCHEDULE_VERSION_REQUIRED`, uyuşmayan header 412 `SCHEDULE_VERSION_MISMATCH`; ikisi birbirine ve genel hataya çökmüyor.
- [x] Read surface var; yayınlanmış/taslak ayrımı izinle korunuyor (`management_draft` / `published_branch` / `published_own`).
- [x] Validation `schedule:validate` + `schedule:conflict:read` ile korunuyor; genel read ile değil.
- [x] Cross-scope erişim non-enumerating 404 (`Kayıt bulunamadı`, tenant/branch/unknown-id ayırt edilemez).
- [x] Sözleşme descriptor `M3_CONTRACT_V2` / `2.0.0`'dır; `m3-schedule-contract.spec.ts` bunu pinler.
- [x] Yetkilendirme guard'ı yalnız `every`'yi yönlendirir; OR semantiği `@PermissionsAny` ile açıktır.
- [x] Mutasyonlar `ETag` yayımlar; istemci revision'ı kendi hesaplamaz.
- [x] Frontend reason/state eşlemesi on altı kanonik kodun tamamını kapsıyor (`test/frontend-runtime/runtime-state-map-consistency.spec.ts` pinler). Dört publish-blocked state'in ekranları ve #453 kapı rayı bu PR değildir.


### Karar notu

```text
#447 sign-off:
- Product/PO: APPROVE — 2026-11-17, sisbas
- Technical Architecture: APPROVE — 2026-11-17, sisbas
- Data Model: APPROVE — 2026-11-17, sisbas
- Frontend: APPROVE — 2026-11-17, sisbas
- QA/KVKK/Security: APPROVE — 2026-11-17, sisbas
Sonuç: APPROVE
Koşullar:
- #449 kapsam B olarak bu PR'a dahildir; ayrıca imza turu yoktur.
- Kapsam dışı: per-event CRUD (#452), conflicts/validate yol yeniden adlandırması (#453).
Tarih: 2026-11-17
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
| #447 | `closed` | 2026-11-17 | Owner beş rolü imzaladı (sisbas) | `docs/acceptance/447-review-package.md`; sözleşme `M3_CONTRACT_V2` 2.0.0; merge kanıtı issue #447 yorumunda |
| #448 | `closed` | 2026-11-17 | PR #527 (`0b75a011`), tüm required check'ler yeşil |
| #449 | `closed` | 2026-11-17 | Kapsam B; aynı PR'da kapandı; kapanış kanıtı PR #528 |

> **Kapanış kuralı:** #449 ayrı bir imza turu gerektirmez; kanıtları #447'nin
> imzasıyla aynı gövenceye bağlanır. #453, #460 ve #461 sırasıyla #447'nin
> merge'ünü beklemektedir.
> PR merge edildi bu kapıların yerine geçmez.
