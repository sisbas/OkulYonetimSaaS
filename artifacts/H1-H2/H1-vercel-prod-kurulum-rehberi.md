# H1 Operatör Rehberi — Vercel Prod Ortam Değişkenleri + `/api/v1/health` = 200

**DURUM: paket hazır (uygulama insan)** · **Sahip:** İnsan operatör (A6 yalnız hazırlar) · **Refs:** #332, #393

**Amaç:** Bu rehber, insan operatörün H1 kapısını (prod secret'ları + sağlık 200) kendi başına
tamamlası içindir. Rehber yalnız **değişken ADLARI** ve doğrulama komutları içerir; hiçbir secret
**değeri** buraya, PR'a, issue'ya, CI loguna veya ekran görüntüsüne yazılmaz (Refs #332, #393).

**H1 bir insan kapısıdır:** ajan bu paketi hazırlar; "tamamlandı" işaretini ve kanıtı yalnız insan
verir. Bu rehber pilot-hazır demek değildir — H1 yalnız kritik yolun ilk halkasıdır
(H1 → R10 journey → H4 Go/No-Go).

**Prod host:** `https://okulyonetimsaas.vercel.app`

---

## 0. Kim ne yapar

| Adım | İnsan operatör | Ajan |
|---|---|---|
| Secret üretimi ve Vercel'e girişi | ✔ | — |
| Prod DB erişimi, migration/seed çalıştırma | ✔ | — |
| `curl` health 200 + kanıt şablonu doldurma | ✔ | — |
| H1'i "tamamlandı (insan)" yapma | ✔ | — |
| Bu rehberin/HLT paketinin hazırlanması | — | ✔ |
| H1 sonrası WP-07F production observation tetikleme | ✔ (dispatch) | ✔ (hazırlık) |

## 1. Ön hazırlık

1. **Vercel erişimi:** projeye (**sisbas-projects-d3c081cb/okulyonetimsaas**) Owner veya Admin
   rolünde erişimin olsun (Settings → Environment Variables yazabilmek için).
2. **Yönetici anahtarları:** Vercel hesabında 2FA aktif olsun; proje erişimi kişisel hesaba bağlıysa
   paylaşım yapma — secret'ları yalnız kendi oturumunda üret/yapıştır.
3. **Üretim veritabanı:** Vercel'den erişilebilir bir PostgreSQL (Vercel Postgres / Neon / Supabase
   vb.) hazırla veya mevcut prod DB'nin bağlantı bilgisini elinde bulundur. Connection string'i
   **hiçbir yere (repo, chat, ekran görüntüsü) yapıştırma**; yalnız ortam değişkeni olarak kullan.
4. **Yerel araçlar:** Node 22.x + repo clone + `npm ci` (migration/seed komutları yerel makinden,
   prod DB'ye karşı çalıştırılır).

## 2. Secret üretimi (her değişken için AYRI değer)

Bir değeri birden fazla değişken **asla** paylaşma. Üretim komutları (değerleri terminalde
göster; kopyala → Vercel'e yapıştır → shell history'yi temizle):

**bash / macOS / Linux:**

```bash
openssl rand -base64 48   # ≥32 karakter; her değişken için yeniden çalıştır
```

**PowerShell 5.1:**

```powershell
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 48
$rng.GetBytes($bytes)
[Convert]::ToBase64String($bytes)
```

Her üretilen değeri geçici bir yerde (parola yöneticisi) sakla; düz metin dosyaya kaydetme.

## 3. Zorunlu ve opsiyonel ortam değişkenleri

### 3.1 Zorunlu (production'da eksik/zayıf ise uygulama **boot olmaz** — fail-closed)

| Değişken (AD) | Kural |
|---|---|
| `JWT_ACCESS_SECRET` | ≥32 karakter, rastgele |
| `JWT_REFRESH_SECRET` | ≥32 karakter, rastgele; access secret'tan **farklı** |
| `AUDIT_HMAC_KEY` | ≥32 karakter, rastgele |
| `AUDIT_HMAC_KEY_ID` | Sabit sürüm etiketi; ilk kurulum için `key-1` |
| `DATABASE_URL` | Prod PostgreSQL connection string (bkz. §5) |
| `KVKK_PSEUDONYM_KEY` | ≥32 byte, rastgele |
| `KVKK_CONTACT_KEY` | **Tam 32 tek-byte ASCII karakter** (N1a/#380). `raw.length === 32` VE `Buffer.from(raw,'utf8').length === 32` — base64 (44 karakter) DEĞİL; hex (64 karakter) DEĞİL. 32 Türkçe/çok-byte karakter `raw.length` kontrolünden geçer ama AES-256'da FATAL olur. Byte-güvenli üretici: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url').slice(0,32))"` (yalnız ASCII çıktı) |

### 3.2 Önerilen / opsiyonel

| Değişken (AD) | Not |
|---|---|
| `KVKK_PSEUDONYM_KEY_VERSION` | Örn. `p1`; anahtar rotasyonunda sürüm izi |
| `KVKK_CONTACT_KEY_ID` | Varsayılan `contact-p1`; ilk kurulumda boş bırakılabilir |
| `JWT_ISSUER` | Varsayılanlar mevcut; değiştirme zorunlu değil |
| `JWT_ACCESS_AUDIENCE` / `JWT_REFRESH_AUDIENCE` | Varsayılanlar mevcut |

### 3.3 Şimdilik BOŞ BIRAK (rotasyon only / desteklenmiyor)

| Değişken (AD) | Neden boş |
|---|---|
| `AUDIT_HMAC_PREVIOUS_KEYS` | Yalnız audit anahtar **rotasyonunda** (Ek B); ilk kurulumda tanımlanmaz |
| `JWT_KEY_ID` | **Desteklenmiyor:** runtime bu değişkeni okumuyor; token izlenebilirliği yok (dokümante edilen boşluk, #332). Yapılandırma masrafı yok |

## 4. Vercel'e kurulum

1. Vercel → proje → **Settings → Environment Variables**.
2. Her değişkeni **tek tek** ekle; scope olarak **yalnız `Production`** işaretle.
   - `Preview`/`Development` scope'ları bu kapının konusu değil (H2 waiver kayıtlı; preview
     ayrı bir arıza — #329).
3. `AUDIT_HMAC_PREVIOUS_KEYS` gibi JSON değerleri ilk kurulumda **hiç ekleme**; eklenirse tek
   satır JSON olarak, çift tırnak kaçışlarına dikkat ederek gir.
4. Vercel CLI alternatifi (aynı scope disipliniyle):

   ```bash
   vercel env add JWT_ACCESS_SECRET production
   # ...her zorunlu değişken için tekrarla
   ```

5. **Yeniden deploy tetikle:** env değişiklikleri çalışan serverless fonksiyona anında yansımaz.
   Deployments → en son deployment → **Redeploy** (veya main'e boş olmayan bir push). Deploy
   başarılı olmadan health yeniden test edilmez.

## 5. DATABASE_URL notları

- Şema: `postgres://<user>:<password>@<host>:5432/<db>` (yöneticinin verdiği string; parametre
  adları sağlayıcıya göre değişebilir).
- Sunucusuz runtime'dan erişim için sağlayıcının **TLS zorunluluğuna** uygun string kullan
  (çoğu yönetilen servis `sslmode=require` ister; sağlayıcının "external connection" /
  "pooled connection" yönergesine bak — pooler adresi tercih edilir).
- Bu string'i Vercel'e yalnız §4'teki gibi ortam değişkeni olarak gir; yerel `.env` dosyasına
  prod string yazma.

## 6. Migration ve seed (operatör komutları — deploy'da OTOMATİK ÇALIŞMAZ)

Yerel makinden, **prod DB'yi hedefleyerek** (komutu çalıştırmadan önce `DATABASE_URL`'in prod
olduğunu bir kez daha doğrula):

```bash
npm run db:migrate
npm run db:verify
npm run db:seed:permissions
```

İlk girilebilir yönetici için (boş `users` tablosu; bkz. README "İlk yöneticiyi oluşturma"):

```bash
SEED_ADMIN_EMAIL=<prod-admin-eposta> \
SEED_ADMIN_PASSWORD=<en-az-12-karakter-guclu> \
npm run db:seed:admin
```

Seed fail-closed'dur: mevcut kullanıcı varsa reddeder; aynı e-posta ile tekrar idempotent'tir.
İlk-admin yolu ayrı bir pilot-enabler iş kalemidir (#388) — bu rehber onu kapatmaz, yalnız
mevcut komutları bağlama oturtur.

## 7. Doğrulama

### 7.1 Sağlık (H1 kabul sözleşmesi)

```bash
# 1) Durum kodu: beklenen 200
curl -sS -o /dev/null -w '%{http_code}\n' https://okulyonetimsaas.vercel.app/api/v1/health

# 2) Gövde: PII/secret sızıntısı olmamalı (H1 paketindeki kanıt komutuyla aynı)
curl -sS https://okulyonetimsaas.vercel.app/api/v1/health | tee /tmp/health.json
```

### 7.2 Mini smoke (tek endpoint ötesi güven)

| İstek | Beklenen |
|---|---|
| `GET /` | Landing HTML (200) |
| `GET /api/v1/health` | `200`, gövde yalnız sağlık bilgisi |
| Korumalı bir API route'u (ör. auth gerektiren herhangi biri) kimliksiz | `401` (fail-closed koruma) |
| Yetkisiz rol ile izinsiz kaynak erişimi (varsa test hesabıyla) | `403` (RBAC/BOLA koruması) |
| `GET /app/` | Uygulama HTML kabuğu (200) |

401/403'ler hata değil, **beklenen** sonuçtur: kimlik/otorizasyon akışı gerçek kimlik bilgileriyle
ayrıca test edilir.

## 8. Teşhis tablosu

| Gözlenen | Sınıf | Olası neden | Aksiyon |
|---|---|---|---|
| Health **500** | Ortam/config (anayasal VI) | Zorunlu env eksik veya DB erişilemiyor | Vercel Function loglarında fail-closed hata adını kontrol et (loglar yalnız **değişken adını** ve uzunluk ihlalini gösterir — değer asla); §3.1 listesinden tek tek doğrula; `DATABASE_URL` host/TLS kontrolü |
| Boot reddi: JWT hatası | Config | `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` eksik veya <32 karakter | Her ikisini de ≥32 karakter ayrı rastgele değerle yenile; Redeploy |
| Boot reddi: KVKK hatası | Config | `KVKK_PSEUDONYM_KEY` eksik veya <32 byte | Yeni ≥32 byte değer üret; `KVKK_PSEUDONYM_KEY_VERSION`'ı koru; Redeploy |
| Boot FATAL: `KVKK_CONTACT_KEY ... missing` | Config | N1a (#380) parent-contact anahtarı eksik | `KVKK_CONTACT_KEY` ekle (§3.1 — tam 32 tek-byte ASCII); Redeploy |
| Boot FATAL: `KVKK_CONTACT_KEY must be exactly 32 bytes (got 44)` | Config | Değer base64 (44 karakter) üretilmiş | Yeni **32 tek-byte ASCII** değere çevir (hex/base64 DEĞİL); byte-güvenli üretici: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url').slice(0,32))"`; mevcut değeri sil → yeniden ekle; Redeploy |
| Health **500**, log yok / cold start hatası | Deploy | Env sonrası redeploy tetiklenmedi veya build başarısız | Deployments sekmesinde son deploy durumu; Redeploy |
| **404** | Routing | Yanlış path | Doğru path `/api/v1/health`; rewrite'lar repo `vercel.json`'da tanımlı |
| **401/403** korumalı route'larda | Beklenen | Kimliksiz istek | §7.2 — hata değil |
| Health **200** ama JWT ile giriş reddi | Config/uygulama | Audience/issuer veya clock; secret rotasyonu | `JWT_*` değerlerinin prod'da tutarlılığını kontrol et; token'ları yeniden üret |
| Boot FATAL: audit key ring | Config | `AUDIT_HMAC_KEY` zayıf/kısa veya key-id çakışması | İlk kurulumda `AUDIT_HMAC_KEY_ID=key-1` tekil; Ek B'yi **çalıştırma**, yapılandırmayı temizle |

**Kural:** 500/bağlantı = ortam/config hatası olarak raporlanır; "frontend/Vercel arızası" ile
karıştırılmaz. Kod hatası şüphesi varsa (#329 sınıfı) H2 kapsamında ayrıca izole edilir.

## 9. H1 kanıt şablonu (insan doldurur)

```text
H1 KANIT
- Tarih/saat (UTC):
- Prod host:                     https://okulyonetimsaas.vercel.app
- curl -w '%{http_code}' çıktısı: 200
- Kanıt URL / ekran görüntüsü:    (health 200; secret DEĞERLERİ görünmez/oker)
- Doğrulayan (insan):             <ad / rol>
- Ortam:                          prod
- Deployment SHA:                 <main HEAD anlık görüntüsü>
```

Ekran görüntüsünde Vercel Environment Variables sayfası **değil**, yalnız health yanıtı ve/veya
kısmi log olsun; secret değerleri opaklaştırılır. Kanıtı H1 paket dosyasındaki şablona işleyip
`tamamlandı (insan)` satırını sen güncellersin.

## 10. Hata durumunda geri alma

1. Doğru değer henüz yoksa sorunlu secret'ı Vercel'den **sil veya boşalt → Redeploy**: fail-closed
   sayesinde sistem önceki (boot-red / 500) durumuna döner — kontrollü geri alma budur.
2. Doğru değer üretilmişse **overwrite** et ve Redeploy tetikle (değer zayıfsa uygulama zaten
   boot olmaz; silmek yerine değiştirmek daha hızlıdır).
3. DB erişimi bozulduysa connection string'i eski çalışan değere döndür (varsa sağlayıcı
   dashboard geçmişinden) ve Redeploy.
4. Migration geri alma son çaredir: `npm run db:migrate:revert` (tek migration adımı; prod'da
   yalnız veri kaybı analizi sonrası).

## 11. H1 neyi AÇMAZ (sınırlar)

- Truth matrix 13/13 `runtime|pilot-ready` **değil**; matrix son reconcile `15c5ab8`'de donmuş.
- Full fresh-DB journey + negatif matris + axe=0 (K-1 barı) ayrı işlerdir (R10/R11).
- Bildirimler **simülatörde** (gerçek SMS/e-posta/WhatsApp yok); e-Okul/raporlar quarantine'de
  (env ile OFF). Pilot okulla imzalanan metinde bu açıkça belirtilir.
- H4 (pilot okullar + MSA/DPA + Go/No-Go), H5 (DPO), H7 (yedek/rollback/SLO) ayrıca bekler.
- Audit `verify` uç noktası platform yetki kararı (#373) gelene kadar tenant için kullanılamaz.

---

## Ek A — KVKK_PSEUDONYM_KEY rotasyonu (geri döndürülemez; H5/DPO kapılı)

Rotasyon, eski anahtarla üretilmiş pseudonym referanslarını **kalıcı** olarak eşleştirilemez
kılar. Bu ek yalnız bilgi amaçlıdır; **ilk kurulumda uygulanmaz.**

1. Rotasyon DPO onayı + saklama/silme prosedürüyle planlanır (H5).
2. Rotasyon öncesi: pseudonym taşıyan tablolar ve saklama süreleri belgelenir; silinecek
   kayıtlar önce işlenir.
3. Yeni anahtar üret → `KVKK_PSEUDONYM_KEY` güncelle → `KVKK_PSEUDONYM_KEY_VERSION` bump et →
   Redeploy → health 200 kanıtı.

## Ek B — AUDIT_HMAC_KEY rotasyonu taslağı (UYGULAMA YASAK: H1 + #373 sonrası)

> Bu adımlar **şu an uygulanmaz.** H1 kabul edilmeden ve platform audit-verify yetki kararı
> (#373) kapanmadan operatör rotasyon yapmamalıdır.

1. Yeni anahtar üret (≥32 karakter); `AUDIT_HMAC_KEY`'e koy; `AUDIT_HMAC_KEY_ID`'yi **yeni**
   kimliğe çevir (ör. `key-2`).
2. Emekli anahtarı `AUDIT_HMAC_PREVIOUS_KEYS`'e ekle: `{"key-1":"<eski anahtar>"}`.
3. Bozuk/zayıf yapılandırma veya aktif kimliğin tekrarının bootstrap'ta FATAL olduğunu
   fail-closed sözleşmesine göre doğrula; production kanıtını ayrı kaydet.
4. Eski kimliği saklama politikası izin verdiği sürece ringde tut; ringden çıkarılan anahtarın
   satırları doğrulanamaz hâle gelir.

---

**İlişkili:** `artifacts/H1-H2/H1-prod-env-and-health.md` (kanıt paketi ve governance kuralları) ·
`artifacts/H1-H2/H2-vercel-waiver.md` · `docs/phase2/progress-v2.md` §3 (H1) · `CONTEXT.md`
(kapsam kilidi K-8…K-15 ve DoD barı K-1) · README "İlk yöneticiyi oluşturma (bootstrap)"
**Sahiplik:** paket A6 (docs/governance); **uygulama ve imza:** insan operatör (+ DPO için Ek A/H5).
