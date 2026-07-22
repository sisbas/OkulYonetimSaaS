# Faz 1 İzin Yönetimi — GATE 3 Karar Kaydı

## Durum

GATE 3 üretim dikey dilimi **HOLD**; GATE 3A bounded foundation **GO**.

Base: `main@f86c95f1b04186a6cf0b313b598203911366407b`  
Takip: GitHub Issue #129

Hosted Full-Vision demo kabul edilmiştir ancak yalnız UX/iş akışı referansıdır. Sentetik fixture, bellek durumu ve statik ekranlar production veri veya runtime kanıtı değildir.

## Mimari seçenekler

| Seçenek | Karar | Trade-off |
|---|---|---|
| CRUD-first modular monolith | Reddedildi | Hızlı başlangıç; audit, projection ve geçiş kuralları için tekrar işi yaratır |
| Audit/event-first modular monolith + domain state machine | Seçildi | Mevcut NestJS/TypeORM yapısına uyar; başlangıç maliyeti daha yüksek ama atomik ve ayrıştırılabilir |
| Ayrı workflow/leave servisi | Reddedildi | Teacher/Schedule API'leri kararlı değil; dağıtık transaction ve operasyon yükü gereksiz |

İlk runtime diliminde izin kararı, yakalanan ders etkileri, açık Daily Operations işleri ve kalıcı audit aynı PostgreSQL transaction'ında yazılacaktır. Outbox; bildirim veya harici tüketici ihtiyacı kanıtlanana kadar ertelenmiştir. Broker veya yeni mikroservis eklenmeyecektir.

## Ürün sözleşmesi

- Süre: `hourly | full_day | multi_day`
- Neden: `annual_leave | administrative | health | other`
- Karar: `pending | approved | rejected`
- Kapsama: `not_required | unresolved | partially_covered | covered`

Karar ve kapsama birbirinden bağımsızdır. Uygun yedek öğretmen bulunması otomatik izin onayı oluşturmaz. Talep sahibi kendi talebini onaylayamaz.

## Dondurulmuş kapsama politikası

Yönetici, etkilenen derslerin tamamına yedek öğretmen atanmamış olsa da izin talebini onaylayabilir. Onay anında `unresolved` veya `partially_covered` durumda kalan her ders, aynı transaction içinde Daily Operations kuyruğunda açık iş olarak görünmelidir.

- `approved + unresolved|partially_covered` geçerli bir durumdur.
- Uygun yedek öğretmen yalnız karar kanıtıdır; otomatik onay veya otomatik atama üretmez.
- Yayımlanmış program/etki kaynağı erişilemiyorsa bu durum `0 etki` ya da `not_required` sayılamaz; karar `IMPACT_ANALYSIS_NOT_READY` ile durur.
- Reddedilen, tamamen kapsanan veya gerçekten ders etkisi bulunmayan izinler açık Daily Operations işi üretmez.
- Yönetici rolü bu akışta `operations_manager` ve `tenant_admin` rollerini kapsar; her iki rolde de self-approval yasağı geçerlidir.

## GATE 3.0 dependency matrisi

| Bağımlılık | Durum | Repo kanıtı |
|---|---|---|
| Authenticated User ↔ tenant Teacher | MISSING | `src/teachers` runtime modülü ve kullanıcı–öğretmen eşleşmesi yok |
| Published schedule event + version | MISSING | Schedule runtime yok; `docs/frontend/m3-schedule-contract-alignment.md` API bağlantısını bloke ediyor |
| Availability/assignment recheck | MISSING | Permission seed var; entity/repository/runtime kaynak yok |
| Transaction-scope durable audit writer | MISSING | `audit_logs` migration var; `AuditInterceptor` ve feature audit servisleri logger tabanlı |
| Leave Permission Catalog route binding | PROVEN IN GATE 3A | `src/rbac/permission-catalog.ts` ve testleri |
| Runtime frontend/deployment | MISSING | `src/frontend/operations` descriptor; statik demo production frontend değildir |

## Bounded foundation

İlk fark yalnız şu sözleşmeleri üretir:

- İzin süre/neden/durum/kapsama tipleri.
- `pending → approved|rejected` durum makinesi.
- Terminal durum değişmezliği, optimistic version ve self-approval engeli.
- Karar–kapsama ayrımı.
- Teacher ile operations-manager leave route katalog kayıtları.

Bu fark migration, controller, gerçek schedule impact, aday öğretmen, günlük operasyon projection'ı veya frontend içermez.

## HOLD çıkış koşulları

1. User↔Teacher eşleşmesini üreten tenant-scoped kaynak onaylanır.
2. Published schedule event ve version read portu gerçek runtime kaynağına bağlanır.
3. Teacher suitability/availability/assignment recheck portu sağlanır.
4. İzin kararı + ders etkileri + açık Daily Operations işleri + kalıcı audit aynı TypeORM transaction içinde yazılır.
5. Runtime frontend ve deployment ADR onaylanır.
6. Daily Operations açık işlerinin tenant-scope ve idempotency constraint'leri gerçek PostgreSQL testleriyle kanıtlanır.
