# H1 — Prod environment secrets + `/api/v1/health` = 200 (İNSAN KAPISI)

**DURUM: bekliyor (insan)** · **Sahip:** İnsan operatör (A6 yalnız hazırlar) · **Refs:** #332, plan §10/H1
**Kural:** İnsan kapıları ajan tarafından "yapıldı" işaretlenemez. Bu dosya yalnız **paket**tir; kanıt
geldiğinde bu satır `tamamlandı (insan)` yapılır ve kanıt URL'i işlenir.

> **UYARI — SECRET DEĞERİ YAZILMAZ.** Bu belgeye, PR'a, issue'ya, commit'e, CI loguna veya ekran
> görüntüsüne hiçbir secret **değeri** yazılmaz. Yalnız değişken **ADLARI** ve doğrulama komutu
> paylaşılır. Kanıt = `/api/v1/health` yanıtının **200** olduğunu gösteren çıktı/görüntü (değerler maske/opak).

---

## 1. Zorunlu prod ortam değişkenleri (yalnız ADLAR)

| Değişken (AD) | Zorunlu | Not |
|---|---|---|
| `JWT_ACCESS_SECRET` | ✔ | Erişim token imzası |
| `JWT_REFRESH_SECRET` | ✔ | Refresh token imzası (refresh yalnız hash saklanır) |
| `JWT_KEY_ID` | opsiyonel | **Desteklenmiyor (dokümante edilen boşluk):** `src/` altında hiçbir kod bu değişkeni OKUMUYOR ve `AuthService.issueTokenPair()` `signAsync`'e `keyid`/`kid` vermiyor → izlenebilirlik SAĞLAMAZ. Rotasyon izlenebilirliği ayrı bir kod dilimi gerektirir (Refs #332) |
| `AUDIT_HMAC_KEY` | ✔ | Audit zinciri HMAC anahtarı (#259/#352) |
| `AUDIT_HMAC_KEY_ID` | ✔ | İmzalı satırların `signature_key_id` değeri (ör. `key-1`); doğrulama bu kimlikle anahtar seçer |
| `AUDIT_HMAC_PREVIOUS_KEYS` | yalnız rotasyonda | Emekliye ayrılmış anahtarlar: `{"key-1":"<>=32 karakter>"}` — **rotasyon sırasında** eski satırların doğrulanabilmesi için |
| `DATABASE_URL` | ✔ | PostgreSQL bağlantısı (prod runtime için zorunlu) |
| `KVKK_PSEUDONYM_KEY` | ✔ | **>= 32 byte** · pseudonym/redaction anahtarı (A3 dilimi; #266) |
| `KVKK_PSEUDONYM_KEY_VERSION` | opsiyonel | Pseudonym anahtar sürümü (key-id tabanlı doğrulama/rotasyon) |

- `KVKK_PSEUDONYM_KEY` **zorunlu ve yeni**dir (A3 R5/redaction dilimiyle gelir); >= 32 byte entropi.
- Anahtar değerleri yalnız ortamın secret store'unda tutulur; repoda `.env.example` **dahi** gerçek değer içermez.

## 1.1 Audit HMAC rotasyonu — **runtime desteği BLOKLU** (#367 / PR #366)

**Kaynak anlık görüntüsü:** main `9bd8d5dc333cdfe575e2500ff6e2828673edcc84`, 2026-09-29.
`src/app.module.ts:6` `AuditModule` sembolünü import eder, fakat `@Module.imports`
(`src/app.module.ts:44–63`) içinde kaydetmez. `AuditQueryService` yalnız bu bağlantısız
modülde sağlanır (`src/common/audit/audit.module.ts:24`). Bu nedenle main runtime'da
`/api/v1/audit/verify` kayıtlı değildir ve servis constructor'ındaki
`resolveAuditHmacKeyRing()` (`audit-query.service.ts:89`) bootstrap sırasında çalışmaz.
Bozuk/zayıf/aktif kimlikle çakışan `AUDIT_HMAC_PREVIOUS_KEYS` için **boot'ta FATAL
garantisi yoktur**. Aktif anahtarın writer tarafından doğrulanması bütün ring'in
doğrulanması değildir; `/api/v1/health` 200 de bu boşluğu kapatmaz.

**Kod düzeyindeki yetenek:** #361 ile gelen `AuditQueryService.verify()` satırın
**kendi `signature_key_id`'siyle** anahtar seçer
(`resolveAuditHmacKeyRing()` + `auditHmacKeyResolver(ring)`); bilinmeyen/eksik key-id →
`unknown-signature-key` ile **fail-closed** reddeder. Bu servis/yardımcı davranışı main'dedir
(kanıt: `src/common/audit/audit-chain.spec.ts` — rotasyon + key-id NULL testleri; `.env.example`
`AUDIT_HMAC_KEY_ID` / `AUDIT_HMAC_PREVIOUS_KEYS` sözleşmesi); birim kanıtı çalışan
uygulama kaydı veya production rotasyon kabulü yerine geçmez.

**Önkoşul (henüz sağlanmadı):** #367 / PR #366 güvenli wiring düzeltmesi main'e merge
edilmeli; kayıtlı verify route'u ve bozuk ring ile gerçek bootstrap fail-closed kanıtı
exact head'e bağlanmalıdır. Wiring, #367'deki cross-tenant retention sınırını da korumalıdır.
Bu paket retention endpoint'lerini açmayı/çalıştırmayı önermez ve retention erişilebilirliği
veya güvenliği iddia etmez. PR #366'nın açık olması düzeltmenin main'de olduğu anlamına gelmez.
**Operatör şu an bu pakete dayanarak `AUDIT_HMAC_KEY` rotasyonu yapmamalıdır.**

**Önkoşullar kabul edildikten sonra uygulanabilecek taslak (şu an yürürlükte değil):**

1. Yeni anahtarı üret (>= 32 karakter) ve `AUDIT_HMAC_KEY`'e koy; `AUDIT_HMAC_KEY_ID`'yi **yeni** kimliğe çevir (ör. `key-2`).
2. Emekliye ayrılan anahtarı `AUDIT_HMAC_PREVIOUS_KEYS`'e ekle: `{"key-1":"<eski anahtar>"}`.
   (Kayıtlı ve doğrulanmış verifier'da eski satırların anahtar seçimi korunmalıdır.)
3. Bozuk/zayıf yapılandırma veya aktif kimliğin tekrarı ile bootstrap'ın **FATAL** olduğunu
   prerequisite kanıtında doğrula; mevcut main için bunu olmuş sayma.
4. Eski kimliği, saklama politikası izin verdiği sürece **ringde tut**; ringden çıkarılan anahtarın
   satırları doğrulanamaz hâle gelir.

> **KALAN GERÇEK BOŞLUK — checkpoint imzası (issue #358):** `AuditQueryService.lastCheckpoint()`
> `audit_chain_checkpoints.signature` kolonunu SELECT etmiyor; yani checkpoint'in **kendi** HMAC imzası
> doğrulanmıyor (kırpma senaryosunda trust-anchor kurcalanabilir kalır). Bu, rotasyon desteğinden
> **bağımsız** ve hâlâ **açık** bir bulgudur (#358) — bir dilim kapsamında kapatılmalıdır.

**Governance engeli:** `POLICY_DEADLOCK #368` **OPEN**. Mevcut main'deki
`docs/phase2/progress-v2.md:46–47` fix main'e merge edildikten sonra resolve ister;
aktif [ruleset 19052349](https://github.com/sisbas/OkulYonetimSaaS/rules/19052349)
ise merge öncesi thread resolution ister. Owner kararı olmadan bu paket policy'yi
değiştirmez veya thread resolve yetkisi vermez. Test PASS bu engeli kaldırmaz.

## 2. Doğrulama komutu (insan, prod'a karşı)

```bash
# 1) Health endpoint'i 200 dönmeli
curl -sS -o /dev/null -w '%{http_code}\n' https://<prod-host>/api/v1/health
# beklenen: 200

# 2) Yanıt gövdesi PII/secret içermemeli (constitution V/VI)
curl -sS https://<prod-host>/api/v1/health | tee /tmp/health.json
```

- DB bağlı, migration uygulanmış ve tüm zorunlu env değişkenleri yüklü olduğunda beklenen kod **`200`**'dür.
- `500` / bağlantı hatası → eksik env veya DB erişimi; constitution VI gereği **ortam/config** hatası olarak raporlanır,
  frontend/Vercel hatasıyla karıştırılmaz.

## 3. Beklenen 200 kanıt şablonu (insan doldurur)

```text
H1 KANIT
- Tarih/saat (UTC):
- Prod host:                     (ör. https://<prod-host>)
- curl -w '%{http_code}' çıktısı: 200
- Kanıt URL / ekran görüntüsü:    (health 200; secret DEĞERLERİ görünmez)
- Doğrulayan (insan):             <ad / rol>
- Ortam:                          prod
```

## 4. H5 / DPO notu — pseudonym anahtar rotasyonu (geri döndürülemez)

`KVKK_PSEUDONYM_KEY` **rotasyonu**, o anahtarla üretilmiş eski pseudonym referanslarını **geri
döndürülemez** biçimde eşleştirilemez kılar (pseudonym tersine çevrilemez; yalnız doğrulama/eşleşme
anahtar içindedir). Bu nedenle:

- Rotasyon **DPO onayı** ve KVKK veri saklama/silme prosedürüyle birlikte planlanır (H5).
- Rotasyon öncesi: hangi tabloların pseudonym taşıdığı ve saklama süresi belgelenir; silinmesi gereken
  kayıtlar rotasyondan **önce** işlenir.
- `KVKK_PSEUDONYM_KEY_VERSION` ile sürüm izlenir; eski sürüme bağlı kayıtlar yalnız saklama politikası
  elverdiğince tutulur.
- Bu not **A3 (R5/redaction) + DPO (H5)** sahipliğindedir; A6 yalnız kaydı tutar.

---

**İlişkili:** `artifacts/H1-H2/H2-vercel-waiver.md` · `docs/phase2/progress-v2.md` §3 (H1)
**Sahiplik:** paket A6 (docs/governance); **uygulama** insan operatör + DPO (H5).
