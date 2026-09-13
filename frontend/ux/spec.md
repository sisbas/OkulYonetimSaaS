# Faz 1 UX teslimatı — 12 Eylül 2026

## 1. Executive UX Decision

Görev ve istisna merkezli Bugün ekranı önceliklidir. Üç seçenek değerlendirildi: mevcut iki panelli runtime'ı genişletmek; ortak sunum kabuğunda ayrı üretim/prototip girişleri; React/Next taşıması. İkinci seçenek seçildi: mevcut Nest API, güvenlik başlıkları ve `/runtime` korunur. `/app` üretim giriş kabuğudur; `/ux` açıkça etiketlenmiş sentetik inceleme alanıdır. Bu teslimat tam üretim entegrasyonu değildir.

## 2. Information Architecture

Bugün → Program → İzinler → Yoklama → Veli Bilgilendirme → Tanımlar → Raporlar → Yönetim. Öğretmende İzinlerim ve kendi dersleri öne çıkar. Bağlantı durumu/İnceleme ayrı ikincil gezinmedir. `/` yeni `/app/today` girişine yönlenir. Gerçek operasyonun mevcut `/runtime` yolu korunur.

## 3. Role / Screen Matrix

Bu tablo yalnız prototip görünürlüğüdür; backend permission catalog yerine geçmez.

| Ekran / eylem    | Yönetici   | Operasyon  | Öğretmen    | Akademik  | Okuyucu   |
| ---------------- | ---------- | ---------- | ----------- | --------- | --------- |
| Bugün            | Tümü       | Tümü       | Kendi       | Görüntüle | Yok       |
| Program          | Düzenle    | Düzenle    | Kendi       | Yok       | Görüntüle |
| İzin talebi      | Oluştur    | Oluştur    | Kendi       | Yok       | Yok       |
| İzin kararı      | Onay/ret   | Görüntüle  | Kendi detay | Yok       | Yok       |
| Görevlendirme    | Düzenle    | Düzenle    | Yok         | Yok       | Yok       |
| Yoklama          | Düzenle    | Düzenle    | Kendi       | Liste     | Yok       |
| Bildirim taslağı | Onay/iptal | Onay/iptal | Yok         | Yok       | Yok       |
| Tanımlar         | Örnek ekle | Örnek ekle | Yok         | Görüntüle | Yok       |
| Rapor            | Görüntüle  | Görüntüle  | Yok         | Görüntüle | Görüntüle |
| Kullanıcı/rol    | Görüntüle  | Yok        | Yok         | Yok       | Yok       |

## 4. Screen Inventory

Aşağıdaki yollar `/ux/` önekiyle çalışan sentetik ekranlardır. `/app/` operasyon ekranları oturum/şube bağlamı hazır olmadığından dürüst bağlantı durumu gösterir.

| Yol                                    | Amaç / ana işlem               | Veri / kapsam / durum                                                     |
| -------------------------------------- | ------------------------------ | ------------------------------------------------------------------------- |
| today                                  | Günün istisnaları, ders detayı | Durum filtreleri, metrikler, görev sırası                                 |
| schedule                               | Haftalık program               | Sınıf, öğretmen, derslik kapsam filtresi                                  |
| schedule/builder                       | Manuel ders ekleme             | Çakışma, branş ve izin kontrolleri; otomatik çözümleyici/yayınlama kapalı |
| schedule/conflicts                     | Açık çakışmanın çözümü         | Ders detayı ve aday seçimi                                                |
| leave, my-leaves                       | Talep listesi                  | Durum filtresi, sahiplik                                                  |
| leave/new                              | Saatlik/tam/çok gün talep      | Tarih aralığı, gerekçe kategorisi; özel sağlık metni yok                  |
| leave/:id                              | Etki ve karar                  | Planlanan/aktif öğretmen, görevlendirme, yönetici onay/ret                |
| attendance                             | Ders oturumları                | Kendi/tümü, eksik ve tamamlanan                                           |
| attendance/session/:id                 | Yoklama                        | Geldi/gelmedi/geç/izinli/işaretlenmedi, toplu geldi, tamamla              |
| attendance/absences                    | Tamamlanan yoklama sonuçları   | İşaretlenmeyenler devamsız sayılmaz                                       |
| parent-notifications                   | Taslak kuyruğu                 | İletişim uygunluğu, inceleme                                              |
| parent-notifications/:id               | Mesaj inceleme                 | Maskeli iletişim, izin kontrolü, onay/iptal; gerçek gönderim yok          |
| definitions/teachers, groups, students | Liste/arama/detay              | İlgili sekmeler, sentetik ad ekleme                                       |
| definitions/courses, rooms, time-slots | Kaynak listeleri               | Temel detay; tam CRUD ve müsaitlik düzenleme bekliyor                     |
| users, roles                           | Erişim matrisi                 | Davet/rol atama kapalı                                                    |
| reports                                | Açık iş ve yük özeti           | Gerçek kapanış/teslimat iddiası yok                                       |
| review                                 | Rol ve hata durumu inceleme    | Yalnız prototipte, oturumu sıfırla                                        |
| login, 403                             | Giriş ve erişim sınırı         | Üretim girişi gerçek mevcut auth endpoint'ini kullanır                    |

## 5. User Flow Map

Örnek yönetici Bugün → öğretmen gerekli dersi aç → uygun Bora Demo'yu görevlendir → ders yoklaması → öğrencileri işaretle → tamamla → gelmeyen öğrencinin taslağı → iletişim/izin kontrolü → onaylı sentetik kuyruk. Öğretmen rolü İnceleme araçlarında seçilerek Deniz Demo'nun kendi dersleri ve yoklaması denenir. Bu adımlar gerçek devamsızlığı authoritative yapmaz; üretim zinciri backend bağımlılıkları nedeniyle BLOCKED.

## 6. Component Inventory

App shell, responsive sidebar, context bar, page heading, metric card, status badge (metin+renk), accessible table wrapper, mobile lesson card, task queue, calendar lesson card, form field/select, native dialog drawer, native confirmation, detail tabs with arrow/Home/End navigation, empty state, notice/live region, connection gate. Ortak sunum fonksiyonları `frontend/app/ui.js`; sentetik mutasyonlar `frontend/ux/store.js` içinde tutulur.

## 7. Design Tokens

Cobalt `#3568d4`, teal `#0f766e`, canvas `#f3f6fa`; sınırlar ve metin tonları CSS değişkenlerindedir. Manrope/Inter aileleri tanımlı, font dosyası bulunmadığında sistem fontları kullanılır. Harici font/tracker çağrısı yok. Kartlar düşük gölgeli, iş akışı ve durum metinleri görsel süsten önce gelir. Sabit odak halkası, reduced-motion desteği ve CSS breakpoint'leri `style.css` içindedir.

## 8. State Matrix

| Durum                   | Davranış                    | Kanıt/kapsam                                           |
| ----------------------- | --------------------------- | ------------------------------------------------------ |
| Normal                  | Liste ve izinli eylemler    | Sentetik store                                         |
| Loading                 | Yükleme açıklaması          | İnceleme durum seçicisi; gerçek veri yükleme henüz yok |
| Empty                   | Kayıt yok + kurtarma metni  | Gerçek liste filtreleri ve durum seçicisi              |
| Forbidden               | Yetki yok + geri bağlantısı | Rol/route ve store kontrolleri                         |
| Stale                   | Yeniden yükleme önerisi     | İnceleme örneği; gerçek If-Match entegrasyonu bekliyor |
| Conflict                | Çakışma ve düzeltme         | Sentetik atama/manual program kontrolleri              |
| Offline                 | Bağlantı hatası             | Giriş fetch hata yönetimi ve inceleme örneği           |
| Eligibility unavailable | Uygunluk bekleniyor         | İnceleme örneği; üretim adayları uydurulmaz            |
| Unexpected response     | Başarısız işlem açıklaması  | Auth JSON/token şekli doğrulaması                      |
| Submitted               | Tek durum geçişi            | Yoklama tekrar gönderimi ikinci taslak üretmez         |

## 9. Responsive Matrix

| Genişlik  | Tasarlanan davranış                         | Doğrulama                     |
| --------- | ------------------------------------------- | ----------------------------- |
| 360 / 430 | Açılır menü, ders kartları, yığılan formlar | Tarayıcı doğrulaması bekliyor |
| 768 / 820 | Dar menü, taşan tabloda yatay kaydırma      | Tarayıcı doğrulaması bekliyor |
| 1024      | Sıkıştırılmış çalışma alanı                 | Tarayıcı doğrulaması bekliyor |
| 1440      | Yan menü + ana liste + görev kuyruğu        | Tarayıcı doğrulaması bekliyor |

Yerel adres bulut tarayıcısınca `ERR_BLOCKED_BY_CLIENT` ile açılamadı; bu tablo PASS değildir.

## 10. Accessibility Review

Kodda lang=tr, skip link, tek ana landmark, etiketli form alanları, tablo başlıkları, native dialog odağı/Escape, sekme klavyesi, durum live region, görünür focus ve reduced-motion vardır. Ekran okuyucu, gerçek cihaz, kontrast ve tüm klavye döngüsü sertifikasyonu yapılmadı. Mevcut runtime'ın 28 testi geçti; bu yeni ekranların görsel erişilebilirlik onayı değildir.

## 11. KVKK Review

Tüm örnek adlar Demo, iletişimler `example.invalid`; dış gönderim, analytics veya kalıcı browser depolama yok. Üretim token'ı yalnız oturum belleğinde; JWT içinden rol veya yetki türetilmez. `/ux` CSP `connect-src 'none'`; üretim giriş dosyası store import etmez. İletişim maskelidir; izin formu özel sağlık açıklaması istemez. İletişim uygunluğu eksikse onay engellenir. Hukuki uygunluk onayı verilmemiştir.

## 12. Frontend Backlog

| Öncelik | İş                                               | Kabul / bağımlılık                                                |
| ------- | ------------------------------------------------ | ----------------------------------------------------------------- |
| P0      | Sunucu oturum/şube/permission context sözleşmesi | Kullanıcı teknik ID girmeden yetkili kurum kapsamı; backend onayı |
| P0      | Today/izin/substitution gerçek adapter           | İnsan etiketleri, If-Match, stale/409 ve idempotency              |
| P0      | İzin onay servisi                                | Mevcut NotReady engelinin authoritative etki hesabıyla çözülmesi  |
| P0      | Attendance authoritative endpoint'leri           | Sahiplik, tamamla, değişmez olay, tekrarlı istek güvenliği        |
| P0      | Bildirim taslak/onay/teslimat sözleşmesi         | İletişim izni, şube scope, gerçek teslimat durumu                 |
| P1      | Program read model / solver job contract         | Taslak, teşhis, gerçek ilerleme, sunucu doğrulamalı yayınlama     |
| P1      | Tanımlar tam CRUD ve müsaitlik                   | Etiketli referanslar, aktif/pasif, ilişki doğrulaması             |
| P1      | Kullanıcı davet/rol işlemleri                    | Server permission catalog ve tenant guard                         |
| P1      | Tarayıcı/a11y kabul                              | Altı viewport, focus, kontrast, hata ve reload kontrolleri        |
| P2      | Yerel lisanslı marka fontları                    | CSP uyumlu font paketi ve ölçüm                                   |

## 13. Open Dependencies

Auth login mevcut ama response yalnız token sağlar; `/me` veya UI context yok. Leave approve servisinde `LeaveImpactAnalysisNotReadyException` bulunur. Daily operations response'ları teknik referanslar içerir. Branch/teacher/group/student/attendance/notification API controller sözleşmeleri bulunmadı. Schedule read modeli/solver iş durumları onaylanmadı. Bu sınırlar client hesabıyla kapatılmadı.

## 14. Scope Guard

Ücret/ödeme, muhasebe, CRM, sınav, veli/öğrenci uygulaması, Faz 2–3 kapsam dışıdır. Mevcut API ve `/runtime` korunur. Yeni UI veri migrasyonu yapmaz. Tam CRUD, drag/drop solver, gerçek bildirim teslimatı ve üretim gün sonu kapanışı tamamlandı denmez.

## 15. Final Readiness

- Mevcut Nest derlemesi ve 28 runtime testi: PASS (12 Eylül 2026).
- Sentetik durum geçişi testleri: 6/6 PASS, `node --test test/frontend-app/demo-state.test.mjs`.
- Vercel önizleme 1348px: görsel inceleme, izin etkisi → atama → yoklama → bildirim onayı, eksik yoklama engeli, öğretmen sahipliği ve program filtresi PASS. Native dialog ilk odağı gözlendi. Altı viewport ve kapsamlı ekran okuyucu kabulü PENDING.
- Production operational integration: BLOCKED (yukarıdaki onaylı backend sözleşmeleri eksik).
- Commercial/full Phase 1 readiness: HOLD; bu sunum teslimatı eski ticari kararı değiştirmez.

Geri alma: bu değişiklik commit'ini PR üzerinden revert ederek `/` yönlendirmesini `/runtime`'a ve build kopyalama adımını önceki haline döndürün. Veritabanı değişikliği yok.

### Dağıtım kanıtı

İlk Vercel önizleme: `dpl_8UvWBy5HKg2ZyAg7EejtgMeeQ6Mj`, READY. GitHub push otomatik onay denetimince açık gönderim yetkisi doğrulanamadığından reddedildi; remote commit veya PR oluşturulmadı. Yerel commit ve Vercel dosya dağıtımı ayrı kayıtlardır. Yeni onay olmadan GitHub gönderimi başka yoldan tekrarlanmayacak.
