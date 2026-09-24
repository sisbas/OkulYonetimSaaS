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
| `AUDIT_HMAC_KEY` | ✔ | Audit zinciri HMAC anahtarı (#259/#352) |
| `DATABASE_URL` | ✔ | PostgreSQL bağlantısı (prod runtime için zorunlu) |
| `KVKK_PSEUDONYM_KEY` | ✔ | **>= 32 byte** · pseudonym/redaction anahtarı (A3 dilimi; #266) |
| `KVKK_PSEUDONYM_KEY_VERSION` | opsiyonel | Pseudonym anahtar sürümü (key-id tabanlı doğrulama/rotasyon) |
| `AUDIT_HMAC_PREVIOUS_KEYS` | opsiyonel | HMAC rotasyonu — eski checkpoints doğrulaması için geçmiş anahtarlar (key-id eşlemeli) |

- `KVKK_PSEUDONYM_KEY` **zorunlu ve yeni**dir (A3 R5/redaction dilimiyle gelir); >= 32 byte entropi.
- Anahtar değerleri yalnız ortamın secret store'unda tutulur; repoda `.env.example` **dahi** gerçek değer içermez.
- Aynı anda `AUDIT_HMAC_KEY` rotasyonu yapılacaksa `AUDIT_HMAC_PREVIOUS_KEYS` ile eski key-id'ler korunmalı;
  aksi hâlde mevcut audit checkpoint'leri doğrulanamaz hâle gelir.

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
