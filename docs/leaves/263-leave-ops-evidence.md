# #263 P1B-07 — Manager approval, impact & coverage: kanıt

Bu belge, `[P1B-07][LEAVE-OPS] Complete manager approval, impact, and coverage
workflow` (#263) kabul kriterlerinin hangi kod ve testle karşılandığını kaydeder.

## 0. Main'de zaten karşılanmış olanlar (doğrulandı)

Issue açıldığında `LeaveService.decide()` her onayda
`LeaveImpactAnalysisNotReadyException` atıyordu. Bu karantina main'de R1 dilimiyle
kaldırılmış durumda ve aşağıdakiler gerçekten çalışıyor:

- Onay + etki + projeksiyon + audit + outbox **tek transaction**
  (`src/leaves/leave.repository.ts`), `If-Match` sürümü ve terminal durum
  kontrolü pessimistic lock altında.
- Etki motoru kendi transaction'ını açmaz; `manager` çağırandan gelir.
- Sıfır etki sessiz geçilmez: `zeroImpact` + `zeroImpactReason` +
  `zeroImpactDetail` (`NO_PUBLISHED_SCHEDULE_EVENT` / `NO_OVERLAPPING_OCCURRENCE`).
- Aday öğretmen listesi `finalized` bayrağıyla döner; uygunluk kaynağı
  (`teacher_courses`) yokken boş liste "aday yok" sayılmaz (`CANDIDATE_GAP_DETAIL`).
- Substitute ata/temizle (`POST`/`DELETE .../substitution`): stale `If-Match` →
  412, mükerrer aktif atama → 409, projeksiyon replay idempotent
  (`daily_operation_lessons.projection_key` unique); temizlenen atamalar
  `state='cleared'` + `cleared_by_user_id`/`cleared_at` ile **tarihsel kayıt**
  olarak durur.
- Karar yanıtı ham UUID taşımaz: öğretmen/şube/ders/sınıf/derslik/zaman
  etiketleri çözülür (`leave-decision-labels.ts`).
- DB kanıtı: `test/database/leave-decision-transaction.spec.ts` (etki + rollback
  + sıfır etki + self-approval + stale sürüm + çakışan talep),
  `test/database/leave-safety-queries.spec.ts` (tenant izolasyonu, şube).

## 1. Bu dilimde kapatılan boşluklar (delta)

| # | Boşluk | Değişiklik | AC |
|---|---|---|---|
| A | Öğretmen yalnız tek kaydı okuyabiliyordu; **geçmiş listesi** yoktu | `GET /api/v1/leaves/me` (`leave:own:read`) + `LeaveRepository.listOwn` + `ListOwnLeaveRequestsQueryDto` | AC-1 |
| B | `durationType` ile tarih aralığı **hiç karşılaştırılmıyordu** (3 günlük "hourly" kabul ediliyordu), aralık sınırsızdı, takvim hizalaması UTC varsayımına açıktı | `src/leaves/leave-window.ts`: tenant saat diliminde `hourly/full_day/multi_day` hizalaması + 366 gün üst sınırı; geçersiz/eksik TZ fail-closed | AC-3 |
| C | Çakışma kontrolü SELECT-then-INSERT idi → eşzamanlı iki talep **çift rezervasyon** yapabilirdi | `pg_advisory_xact_lock(tenant, branch:teacher)` kontrolünden önce | AC-3 |
| D | "On-behalf" politikası yazılı değildi | Sözleşme dokümanı + test: istemciden `teacherId`/`requesterUserId` kabul edilmez, kimlik JWT'den çözülür, whitelist dışı alan 400 | AC-2 |
| E | P0 browser kanıt script'i onaylı izni **doğrudan SQL** ile yazıyordu (kullanıcı yolculuğu atlanıyordu) | `scripts/qa-p0-browser-e2e.js` artık: öğretmen `POST /leaves/me` → yönetici `PATCH /leaves/{id}/approve` (If-Match) → etki doğrulaması | AC-9 |
| F | Bu kuralların regresyon kapısı yoktu | `test/contracts/leave-ops.contract.spec.ts` (6 test) + `leave-window.spec.ts` (14) + servis/repository testleri | AC-8 |

Dosyalar:

- `src/leaves/leave-window.ts` (yeni), `src/leaves/leave-window.spec.ts` (yeni)
- `src/leaves/dto/list-own-leave-requests-query.dto.ts` (yeni)
- `src/leaves/leave.controller.ts`, `leave.service.ts`, `leave.repository.ts`
- `src/leaves/leave.service.spec.ts`, `leave.repository.spec.ts`
- `test/contracts/leave-ops.contract.spec.ts` (yeni)
- `test/runtime-integration/api-routing-authority.spec.ts` (yeni uç sözleşmesi)
- `scripts/qa-p0-browser-e2e.js`
- `docs/leaves/leave-runtime-contract.md`

## 2. AC eşlemesi

- **AC-1 — Teacher request/history ve manager pending/approve/reject UI + public API**
  Backend tamam: `POST /leaves/me`, `GET /leaves/me` (yeni), `GET /leaves/me/:id`,
  `GET /leaves` (`?decisionStatus=pending`), `GET /leaves/:id`,
  `PATCH :id/approve`, `PATCH :id/reject`. UI yüzeyi ayrı issue'da
  (`#491 [UI-code] 6 - İzinler seti`) izleniyor.
- **AC-2 — Self-approval ve kimlik hatası fail-closed; on-behalf politikası açık**
  `leave.service.ts` deny-safe kapı (kendi talebi + çözülemeyen kimlik → 409,
  hiçbir mutasyon yok); on-behalf yok, sözleşmede ve contract testinde pinlendi.
- **AC-3 — Geçerli takvim tarihleri, sınırlı aralık, tenant/şube saat dilimi**
  `leave-window.ts` + advisory lock + `leave-safety-queries` (şube çakışması).
- **AC-4 — Onay + etki + projeksiyon + audit + outbox atomik**
  Mevcut `leave.repository.decide` transaction'ı; testte audit hatası tüm yazımı
  geri alıyor.
- **AC-5 — Sıfır etki açık; DB/aday hataları "aday yok" gibi görünmez**
  `zeroImpact*` alanları ve `finalized`/`gapDetail` sözleşmesi; hata fırlarsa
  transaction rollback (sessiz boş liste yok).
- **AC-6 — Aday gerekçeleri, ata/temizle, stale/conflict, kalıcı geçmiş**
  `decisionSupportDetail`/`gapDetail`/`availabilityLabel`; 412/409 yolları;
  `state='cleared'` tarihsel satırlar; `projection_key` ile idempotent replay.
- **AC-7 — Adlar (öğretmen/şube/ders/sınıf/derslik/zaman), ham ID yok**
  `LEAVE_DECISION_RESPONSE_FIELDS` + `LEAVE_APPROVAL_*_FIELDS` sözleşme testi.
- **AC-8 — Unit/property, PostgreSQL transaction/concurrency/tenant/RBAC, UI-driven**
  Unit + contract yerelde yeşil; PG suite'leri CI `DB Smoke`; UI-driven journey
  `WP-07F P0 Browser E2E`.
- **AC-9 — Kanıt testi doğrudan SQL/API setup ile onaylı izin üretemez**
  Evidence script'i artık API yolculuğu kullanıyor; `acceptance-evidence` guard'ın
  `job-outcome-write` kuralı ve yeni contract testi bunu pinliyor.

## 3. Test kanıtı (yerel, head commit)

```text
$ npx tsc -p tsconfig.json --noEmit                    -> 0 hata
$ npx jest --runInBand src/leaves                      -> 56 test PASS
$ npx jest --runInBand test/contracts                  -> 93 test PASS
$ npx jest --runInBand (src + test, DB/E2E hariç)       -> 145 suite / 1390 test PASS
$ node --check scripts/qa-p0-browser-e2e.js            -> syntax OK
```

DB ve tarayıcı gerektiren suite'ler bu ortamda PostgreSQL olmadığı için
çalıştırılmadı: CI'da `DB Smoke` (`test/database`) ve `WP-07F P0 Browser E2E`
(gerçek login + onay yolculuğu) ile koşar.

## 4. Bilinçli sınırlar

1. **On-behalf talep açma yoktur** — politika açıkça "desteklenmiyor"; ileride
   istenirse ayrı bir yetki anahtarı ve denetim alanı gerekir.
2. **DB seviyesinde exclusion constraint yok**: çakışma uygulama tarafındaki
   advisory lock ile serileştirilir. `btree_gist` tabanlı `EXCLUDE` kısıtı ayrı
   bir migration dilimidir.
3. **Aralık üst sınırı 366 gün** sabit kodlanmıştır (`LEAVE_MAX_RANGE_DAYS`);
   ürün farklı bir sınır isterse tek yerden değiştirilir.
4. **UI yüzeyi** bu PR'ın kapsamı dışında (#491).
5. **Bağımsız verdict'ler** (Backend/Data/KVKK/Security) henüz alınmadı; AC-8
   bunların exact head SHA'ya bağlanmasını ister.

