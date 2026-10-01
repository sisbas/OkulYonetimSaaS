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

## 1.1 Audit HMAC rotasyonu — **kod wiring'i main'de; operasyonel kabul BLOKLU** (#366 / #369 / #367 / #373)

**Kaynak anlık görüntüsü:** main `b3e1a359c6f5b7dbf27d88daac5fd5395c5ebf48`, 2026-10-01.
#366 main'e merge edilmiş; `AuditModule` main runtime'ında kayıtlıdır ve
`src/app.module.ts` içindeki `@Module.imports` dizisinde yer alır.
`AuditQueryService` modülde sağlanır; constructor'daki
`resolveAuditHmacKeyRing()` Nest provider oluşturulurken çalışır. Geçersiz, zayıf veya
yinelenen key-id halkasının bootstrap'ta reddedilmesi kaynak/test düzeyinde bağlanmıştır
(`src/app.module.spec.ts`, `test/runtime-integration/api-routing-authority.spec.ts`).
Bu, main kodundaki wiring ve fail-closed boot davranışıdır; production host'ta H1
kabul kanıtı değildir.

**Güncel HTTP güven sınırı:** `GET /api/v1/audit/verify` artık kayıtlıdır, ancak tenant
yetkisi global audit zincirini tarama yetkisi olmadığından kontrollü **403** döndürür;
legacy `audit_log:operations:read` izni de tarama başlatmaz veya başka tenant
metaverisini açığa çıkarmaz. Global verification için platform yetki modeli #373'te
owner kararı beklemektedir. #366 ile `retention/plan` ve `retention/run` HTTP route'ları
kaldırılmıştır; retention servisi dahili kalır. Bu paket retention endpoint'lerini
açmayı/çalıştırmayı önermez ve retention HTTP erişilebilirliği iddia etmez.

**Checkpoint ve satır doğrulaması:** #369 main'e merge edilmiştir. `verify()` satırın
kendi `signature_key_id`'siyle anahtar seçer; `lastCheckpoint()` checkpoint imzasını
doğrular ve başarısızlıkta checkpoint'i kullanmaz. Bu, bounded segment doğrulaması ve
mevcut checkpoint formatı sınırları içindedir; bağımsız dış trust anchor, bütün-zincir
veya production kabulü iddiası değildir
(`docs/security/checkpoint-trust-anchor-358-evidence.md`).

**Operasyonel kabul (henüz tamamlanmadı):** `/api/v1/health` için production 200 kanıtı
ve secret'lar maskelenmiş exact-head operatör kaydı bu pakette yoktur. Ayrıca verify
endpoint'i owner authority kararı gelene kadar tenant için kullanılabilir değildir
(#373 OPEN). Unit/integration/CI kanıtı bu iki kapının yerine geçmez. **Operatör şu an
bu pakete dayanarak `AUDIT_HMAC_KEY` rotasyonu yapmamalıdır.**

**Yalnız H1 ve #373 kapıları kabul edildikten sonra uygulanabilecek taslak:**

1. Yeni anahtarı üret (>= 32 karakter) ve `AUDIT_HMAC_KEY`'e koy; `AUDIT_HMAC_KEY_ID`'yi **yeni** kimliğe çevir (ör. `key-2`).
2. Emekliye ayrılan anahtarı `AUDIT_HMAC_PREVIOUS_KEYS`'e ekle: `{"key-1":"<eski anahtar>"}`.
   (Kayıtlı ve doğrulanmış verifier'da eski satırların anahtar seçimi korunmalıdır.)
3. Bozuk/zayıf yapılandırma veya aktif kimliğin tekrarıyla bootstrap'ın **FATAL**
   olduğunu test edilmiş fail-closed sözleşmesine göre doğrula; production kanıtını
   ayrı kaydet.
4. Eski kimliği, saklama politikası izin verdiği sürece **ringde tut**; ringden çıkarılan anahtarın
   satırları doğrulanamaz hâle gelir.

> **Sınır (#358):** Checkpoint imza doğrulaması main'de uygulanmıştır, ancak bu
> checkpoint'i bağımsız dış trust anchor yapmaz ve sınırsız whole-chain/truncation
> kabulü sağlamaz. Bu sınırlar için `docs/security/checkpoint-trust-anchor-358-evidence.md`'ye bakın.

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
