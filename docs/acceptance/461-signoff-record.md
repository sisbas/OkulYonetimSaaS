# #447 / #448 — Human sign-off record

> Bu kayıt insan kapıları içindir. Ajan kendi başına sign-off veremez; “bekliyor” durumu
> `ready-for-human` olarak izlenir. Program track'i (#449 → #453 → #460 → #461) bu imzalar
> tamamlanmadan kapanmaz.

## Kapsam

| Issue | Konu | Bağlayıcı belge |
|---|---|---|
| #447 | Schedule runtime alignment to the frozen M3 contract | `docs/m3/schedule-contract-v1.md` |
| #448 | Management draft-read permission key | `src/rbac/permission-catalog.ts`, `docs/m3/schedule-contract-v1.md` |

## #447 — Schedule contract sign-off

### İmza vermesi gereken roller

| Rol | İsim | Karar (`APPROVE` / `CONCERN` / `BLOCK`) | Tarih | Gerekçe / koşul | Kanıt |
|---|---|---|---|---|---|
| Product / PO | | | | | |
| Technical Architecture | | | | | |
| Data Model | | | | | |
| Frontend | | | | | |
| QA / KVKK / Security | | | | | |

### Onaylanan sözleşme maddeleri

- [ ] Draft creation plural canonical path'te; koşullu revision header kabul etmiyor; revision 1'de oluşturuyor.
- [ ] Existing-resource mutation'ları kaynağa bağlı, tam eşleşen koşullu revision header'ı istiyor.
- [ ] Eksik header 428, uyuşmayan header 412; ikisi birbirine ve genel hataya çökmüyor.
- [ ] Read surface var; yayınlanmış/taslak ayrımı izinle korunuyor.
- [ ] Validation `schedule:validate` + `schedule:conflict:read` ile korunuyor; genel read ile değil.
- [ ] Cross-scope erişim non-enumerating 404.
- [ ] Frontend reason/state eşlemesi on altı kanonik kodun tamamını kapsıyor.

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

### İmza vermesi gereken roller

| Rol | İsim | Karar (`APPROVE` / `CONCERN` / `BLOCK`) | Tarih | Gerekçe / koşul |
|---|---|---|---|---|
| Product / PO | | | | |
| Security / KVKK | | | | |
| Technical Architecture | | | | |
| Data Model | | | | |

### Onaylanan maddeler

- [ ] Yeni izin anahtarı yalnız yönetim taslağı okumasını açar; yayınlanmış okumayı genişletmez.
- [ ] Anahtar `permission-catalog.ts` ve seed'de tanımlı; rol matrisi fail-closed.
- [ ] Anahtar `/context` capability kanalında makine-okur olarak taşınır; kullanıcı metnine sızmaz.
- [ ] Audit/KVKK gereksinimi net: okuma audit'i gerekli mi, hangi alanlar maskeli?
- [ ] Cross-tenant ve cross-branch negatif testleri var.
- [ ] Geri alma planı var (anahtar kaldırıldığında 403/404 davranışı).

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
| #447 | `ready-for-human` — bekliyor | 2026-11-02 | Owner “önce ajan işleri” dedi; paket Aşama 0'da hazırlanacak. |
| #448 | `ready-for-human` — bekliyor | 2026-11-02 | Aynı. |

> **Kapanış kuralı:** İmzalar tamamlanmadan #449 başlamaz; #453, #460 ve #461 sırasıyla bloke kalır.
> “PR merge edildi” bu kapıların yerine geçmez.
