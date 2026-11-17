# Student roster and pre-approval surfaces for the human acceptance gate

## Durum

Kabul edildi (owner onayı, 2026-11-02, #461 kapanış oturumu). İlgili: #441, #454, #455, #456, #460, #461.

## Bağlam

#441 spec'i “mevcut API yüzeyi kapsamdır; tek sözleşme değişikliği schedule alignment'tır” ve
“akademik kurulum ve kayıt yönetimi kapsam dışıdır” diyor. Ancak #454, #455 ve #456'nın kabul
kriterleri mevcut `origin/main` (`e0ff64e`) üzerinde karşılanamıyor:

- **#454 — yerinde yoklama.** `POST /attendance/sessions` `studentIds` dizisini istemciden istiyor;
  `students` tablosu var ama öğrenci–grup üyeliği ve roster okuma yüzeyi yok. `GET
  /daily-operations/today` yalnız izin etkilenen dersleri döndürüyor; günün tüm dersleri okunamıyor.
- **#455 — karar öncesi etki ve yedek kapısı.** `impact` ve `candidates` yalnız
  `decision_status = 'approved'` izinde çalışıyor; onay akışı açık dersleri hesaplıyor ama onayı
  engellemiyor. “Önce etki, sonra karar” ve “yedeksiz onay yok” mevcut sözleşmeyle imkânsız.
- **#456 — bildirim mesajı.** `notification_outbox.snapshot` yalnız `template.templateRef`
  taşıyor; onay ekranında gösterilecek PII'siz mesaj gövdesi yok.

Bu boşluklar istemci tarafında doldurulursa sunucu otoritesi kırılır: roster istemciden gelir,
uygunluk istemcide hesaplanır, etki onaydan sonra görünür. Bu, #461'in “gerçek arayüzde,
yardımsız” barıyla ve repo'nun sunucu-otoriter kabul kuralıyla çelişir.

## Karar

#441 kapsamına **F1–F5 foundation slice'ları** için açık istisna verilir. İstisna yalnız bu beş
okuma/akış yüzeyini kapsar; akademik kurulum CRUD'u, toplu içe aktarma veya yeni bir yönetim
ekranı kapsam dışıdır.

| ID | Kapsam | Sınır |
|---|---|---|
| F1 | Öğrenci–grup üyeliği (`student_group_members`) + salt-okunur roster API'si + sentetik seed | Öğrenci/grup CRUD yok; yalnız aktif üyelik okuma |
| F2 | `GET /daily-operations/day?branchId&date` — yayınlanmış günün dersleri, etiketler, yoklama ve coverage durumu | Yalnız yayınlanmış schedule; taslak sızmaz |
| F3 | `POST /attendance/sessions` — `scheduleEventId + sessionDate` ile sunucu-türetimli roster; toplu “hepsi present” | Mevcut açık `studentIds` yolu geriye uyumlu kalır; yeni yol sunucu otoritesidir |
| F4 | Pending izin için impact/candidates önizlemesi; onayda `substitutions` zorunluluğu ve `LEAVE_COVERAGE_REQUIRED` | Aday uygunluğu yalnız sunucuda; istemci hesaplamaz |
| F5 | Snapshot'a PII'siz mesaj gövdesi; taslak onayında consent yeniden kontrolü | Mesajda ad/telefon/e-posta yok; yalnız şablon metni |

Schedule read/publish yüzeyi bu ADR'nin dışındadır; #447/#449 sözleşme hizalamasına bağlı kalır.

## Sonuçlar

- Yeni migration, entity, salt-okunur controller/service/repository, sentetik seed ve testler gelir.
- Mevcut izin anahtarları yeniden kullanılır: `student:read`, `student:group_students:read`,
  `daily_operations:read`, `leave:impact:read`, `attendance:*`, `notification:draft:read`.
  Yeni izin anahtarı açılmaz; `student_group:*` contract-only anahtarları kullanılmaz.
- #441'in kapsam notu güncellenir; #461 yine de #447/#448 insan sign-off'ları, #460 journey'i ve
  gerçek müdür kapısı olmadan kapanmaz.
- Seed yalnız sentetik veridir; gerçek PII kullanılmaz.
- Geri alma: yeni migration ve modül kaydı geri alınır; mevcut tablolara yıkıcı değişiklik yapılmaz
  (yalnız ek index/FK).

## Reddedilen alternatifler

- **Roster'ı istemciden almak:** yoklama oturumunun otoritesi istemciye geçer; #454 AC'si yerine
  getirilemez.
- **Uygunluğu/coverage'ı istemcide hesaplamak:** #455'in “sunucunun kendi aday listesi” kuralıyla
  çelişir.
- **Etkiyi yalnız onaydan sonra göstermek:** #455'in “karar öncesi etki” AC'sini karşılamaz.
- **Mesaj metnini tarayıcıda üretmek:** denetlenemez ve PII sızıntısı riski taşır.
- **İnsan kapısını atlamak veya ajanla doldurmak:** #461'in açık kuralına aykırıdır.

## Uygulama notu

F1 uygulandı: `1890000000000-CreateStudentGroupMembers` migration'ı,
`src/students/*` salt-okunur modülü, `db:seed:students` sentetik seed'i ve
birim/PostgreSQL testleri. Ayrıntı: `docs/acceptance/461-f1-roster-surface.md`.
F2–F5 henüz uygulanmadı.

## Açık sorular

- `student_group_members` akademik dönem/efektif tarih taşımalı mı? Bu dilimde yalnız aktif üyelik
  modellenir; dönem modellemesi ayrı ADR'ye bırakılır.
- #447/#448 sign-off'ları için gereken reviewer seti ve takvim owner tarafından netleştirilecek.
