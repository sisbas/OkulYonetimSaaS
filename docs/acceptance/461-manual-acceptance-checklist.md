# #461 — Manual acceptance checklist (observer instrument)

> **Bu belge müdürle paylaşılmaz.** Gözlemci tarafından doldurulur; müdür görevleri yalnız
> arayüzü kullanarak, yardımsız tamamlar. Gözlemci yalnız veri sıfırlama veya oturum açma gibi
> ortam işlerinde yardımcı olabilir; görev adımlarını gösteremez, hatırlatamaz veya yönlendiremez.

## Oturum bilgileri

| Alan | Değer |
|---|---|
| Tarih / saat | |
| Müdür adı-soyadı | |
| Okul / kurum | |
| Gözlemci | |
| Ortam URL'si | |
| Build SHA | |
| Tenant / branch | |
| Tarayıcı + sürüm | |
| Masaüstü viewport | |
| Mobil viewport | |
| Veri seti (sentetik mi?) | |

## Kural

- Beş görev de **yardımsız** tamamlanmalıdır. Müdür takıldığında gözlemci yalnız “devam edin”
  diyebilir; çözümü göstermez.
- Her görev için `PASS` / `FAIL` işaretlenir. `FAIL` ise takıldığı adım ve ekran görüntüsü yazılır.
- Kritik/ciddi erişilebilirlik bulgusu sayısı görev bazında ayrıca kaydedilir.
- Mobil kontrol 390×844 (veya müdürün kullandığı küçük viewport) üzerinde yapılır.
- Görev sırasında hiçbir geliştirici aracı, konsol veya doğrudan API çağrısı kullanılmaz.

## Görev 1 — Oturum aç ve günün kuyruklarını Bugün'de gör

**Kullanıcı hikâyesi:** #441 — “Ana ekran günün operasyonel kuyruklarıyla açılsın; takvim ikincil
olsun.”

**Ön koşul:** Müdür hesabı, aktif tenant/branch, sentetik gün verisi.

**Adımlar (müdüre söylenmez; gözlemci izler):**
1. Uygulama URL'sini açar.
2. Kendi hesabıyla oturum açar.
3. Bugün ekranında günün işlerini görür: yoklama alınacak dersler, karar bekleyen izinler,
   onay bekleyen bildirimler.
4. Takvimin ikincil konumda olduğunu ve boş bir alanın kendi boş durumunu gösterdiğini görür.

**Beklenen sonuç:**
- Giriş sonrası ilk ekran Bugün'dür.
- Kuyruklar takvimden önce/önde gelir.
- Her alan kendi boş durumunu gösterir; `0` değerli boş panel yoktur.
- Stratejik hedefler feature açıksa görünür; kapalıysa hiç görünmez.

**Sonuç:** `PASS` / `FAIL` · Not:

## Görev 2 — Operasyon'da ders yoklamasını yerinde al

**Kullanıcı hikâyesi:** #441 — “Günün dersleri solda, yoklama dersin göründüğü yerde; sınıfın
tamamı tek eylemle present.”

**Ön koşul:** Yayınlanmış programda o güne ait en az bir ders ve sunucu-türetimli sınıf listesi.

**Adımlar (müdüre söylenmez; gözlemci izler):**
1. Operasyon ekranına geçer.
2. Günün derslerini saat sırasıyla görür.
3. Bir dersin üzerinde yoklamayı açar; öğrenci listesini görür.
4. Bir öğrenciyi `present`, bir öğrenciyi `absent`, bir öğrenciyi `late`, bir öğrenciyi `excused`
   işaretler.
5. “Tüm sınıf present” eylemini kullanır.
6. Oturumu tamamlar; dersin kuyruktan çıktığını görür.
7. Alt şeritte devamsızlık istatistiklerinin işaretlemeyle değiştiğini görür.
8. Öğretmensiz bir ders varsa, coverage atamasını o dersin üzerinde görür ve sunucunun listelediği
   adaylardan birini seçer.
9. Kilitli bir oturum varsa yalnız kontrollü düzeltme yolunun sunulduğunu görür.

**Beklenen sonuç:**
- Yoklama için ayrı ekrana gitmek gerekmez; işlem dersin yanında/üzerinde tamamlanır.
- Dört durum da işaretlenebilir; toplu present tek eylemdedir.
- Tamamlanan oturum kuyruktan çıkar.
- İstatistikler salt-okunur etiketiyle canlı güncellenir.
- Coverage adayları yalnız sunucudan gelir; istemci uygunluk hesaplamaz.
- Kilitli oturumda serbest düzenleme yoktur.
- “Günü kapat” diye bir eylem hiçbir yerde yoktur.

**Sonuç:** `PASS` / `FAIL` · Not:

## Görev 3 — İzin kararını etkisiyle ver ve yedek kapısını kullan

**Kullanıcı hikâyesi:** #441 — “Karar öncesi etki; açık ders varsa yedek seçilmeden onay yok.”

**Ön koşul:** Karar bekleyen en az bir izin; en az birinde açık ders (yedeksiz) senaryosu.

**Adımlar (müdüre söylenmez; gözlemci izler):**
1. Operasyon ekranındaki karar rayında bekleyen izinleri görür.
2. Bir izni açar; karar düğmelerinden **önce** etkiyi görür: kaç ders, kaçı bugün.
3. Açık ders varsa onay denemesinde yedek seçimi istenir; eksik olan açıkça yazılır.
4. Sunucunun listelediği adaylardan birini seçer.
5. Onayı tamamlar; izin karar rayından çıkar.
6. Açık dersi olmayan bir izni doğrudan onaylar.

**Beklenen sonuç:**
- Etki, karar kontrollerinden önce ve sunucudan gelir.
- Açık ders varken yedeksiz onay engellenir; engel nedeni açıktır.
- Aday listesi sunucunundur; istemci uygunluk hesaplamaz.
- Karar verilen izin rayından çıkar.
- Reddetme yolu da çalışır ve karar kaydı görünür.

**Sonuç:** `PASS` / `FAIL` · Not:

## Görev 4 — Veli bildirimini mesaj metni ve consent kapısıyla onayla

**Kullanıcı hikâyesi:** #441 — “Bildirim onayı, mesaj metni ve veli iletişim onayı kapısıyla.”

**Ön koşul:** Onay bekleyen en az bir bildirim taslağı; en az birinde consent yok (blocked) senaryosu.

**Adımlar (müdüre söylenmez; gözlemci izler):**
1. Bugün veya Operasyon ekranında onay bekleyen bildirimi görür.
2. Taslağı açar; gönderilecek mesaj metnini okur.
3. Mesajda öğrenci/veli adı, telefonu veya e-postası gibi ham PII olmadığını görür.
4. Consent durumunu görür; consent yoksa onay eyleminin kapalı olduğunu ve nedenini görür.
5. Consent olan taslağı onaylar; teslim/kuyruk sonucunu görür.

**Beklenen sonuç:**
- Mesaj metni onaydan önce görünür.
- Consent yoksa onay engellenir; engel nedeni açıktır.
- Consent varsa onay tamamlanır; sonuç kullanıcıya yansır.
- Ham PII hiçbir ekranda görünmez.

**Sonuç:** `PASS` / `FAIL` · Not:

## Görev 5 — Haftalık programı gün takvimiyle yayınla

**Kullanıcı hikâyesi:** #441 — “Program gün takvimi + publish gate; dört engel durumu ayrı ekran.”

**Ön koşul:** Taslak program; doğrulama için gerekli referanslar; yayın izni.

**Adımlar (müdüre söylenmez; gözlemci izler):**
1. Program ekranına geçer; beş günlük şerit ve seçili günün ajandasını görür.
2. Bir güne ders ekler/düzenler; saat ve ders bilgilerini UUID yazmadan seçer.
3. Doğrulamayı çalıştırır; bulguları gün gün, her bulgu kendi mesajıyla görür.
4. Çakışma varsa çakıştığı diğer dersi adıyla görür.
5. Dört engel durumundan en az birini tetikler; her birinin ayrı ekran olduğunu doğrular.
6. Eksik/süresi geçmiş sürümde tüm değiştirici kontrollerin kapalı olduğunu görür.
7. Doğrulama temizse yayınlar; yayınlanan haftanın salt-okunur olduğunu görür.
8. Öğretmen rolüyle giriş yapıldığında taslak yüzeyinin görünmediğini doğrular (gözlemci
   tarafından ayrı oturumda kontrol edilir).

**Beklenen sonuç:**
- Program gün takvimi olarak çalışır; ham UUID formu yoktur.
- Doğrulama bulguları gün gün gruplanır; hiçbir bulgu diğerine birleşmez.
- Dört publish-blocked durumu birbirinden ayrı ekranlardır.
- 412 ve 428 birbirine veya genel hataya çökmez.
- Yayın gate'i olmadan yayın yoktur; yayınlanan hafta salt-okunurdur.
- Öğretmen taslak görmez.

**Sonuç:** `PASS` / `FAIL` · Not:

## Erişilebilirlik ve mobil kontrol

Her görev için ayrı satır doldurulur.

| Görev | axe critical | axe serious | Klavye ile tamamlandı mı? | 390×844 yatay taşma | Not |
|---|---:|---:|---|---|---|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |
| 4 | | | | | |
| 5 | | | | | |

**Kabul eşiği:** critical = 0 ve serious = 0. Mobil viewport'ta yatay taşma yok; tüm birincil
kontroller tek elle erişilebilir.

## Genel sonuç

| Alan | Değer |
|---|---|
| Tamamlanan görev | / 5 |
| Kritik bulgu | |
| Ciddi bulgu | |
| Mobil onay | `PASS` / `FAIL` |
| Genel sonuç | `PASS` / `FAIL` |
| Takıldığı yerler | |
| Gözlemci imzası | |
| Tarih | |

> **Kayıt kuralı:** Sonuç #461'e yorum olarak yazılır; müdürün adı, tarihi, ortam URL'si, build SHA'sı
> ve gözlemci adı belirtilir. Checklist'in doldurulmuş hâli `artifacts/` altında PII'siz olarak
> saklanır. Gerçek kişi verisi, ekran görüntüsünde dahi maskelenir.
