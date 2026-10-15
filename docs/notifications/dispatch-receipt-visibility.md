# Gönderim Receipt Görünürlüğü — Yetki Kaynağı Sözleşmesi (#462)

## Kapsam

`GET /api/v1/notifications/:id` (operasyon detayı) yanıtında teslimat
**receipt**'lerinin koşullu dahil edilmesi. Receipt'ler gönderimin gerçekleşip
gerçekleşmediğini ve kanal durumunu gösterir; operasyonun hassas kısmıdır.

## İki ayrı karar — karıştırılmaz

Detay rotasında **iki farklı yetki kararı** vardır ve ikisi de
`parent_notification:*` ailesine aittir:

| Karar | Nerede | Kaynak |
|---|---|---|
| Rotaya giriş | `@Permissions('notification:draft:read')` | `PermissionGuard` — route kapısı |
| Receipt alanının dahil edilmesi | `detail()` içinde | `context.permissions` — sunucu-çözülmüş |

İkincisi route kapısı **değildir**: rota `notification:draft:read` ile açılır,
receipt'ler ise yanıt alanı bazında eklenir. Bu yüzden `@Permissions(...)`
ifadesiyle temsil edilemez ve ayrı çözülür — ama **aynı** yetki kaynağından.

## Tek kaynak kuralı (#462)

Receipt görünürlüğü **yalnızca** sunucudan çözülmüş yetkiden karar verir:

```ts
context.permissions ?? []
```

Bu, `PermissionGuard`'ın route kapısı için okuduğu alanın **birebir kendisi**
(`permission.guard.ts` → `request.context.permissions`). `buildAuthorizedContext`
`permissions` ve `authorization.permissions` alanlarını aynı diziden doldurur;
bu yüzden `authorization` okumak da eşdeğerdi ama **ayni alanı okumak**, tek
kaynak sözleşmesini zorlanabilir hâle getirir: `PermissionGuard` değişirse
controller kırılır.

### `req.user.permissions` neden kaynak değildir

`req.user`, JWT doğrulamasından gelen `RequestUser`'dır ve `permissions` alanı
token gövdesindeki **beyandır**. `PermissionGuard` bu alanı yeniden sorgulamaz;
oturum boyunca sabit kalır. Dolayısıyla:

- Kullanıcının rolünden yetki kaldırıldığında, o anda geçerli olan token bu
  yetkiyi hâlâ taşır ve **kaldırılmış yetkiyi geri kazandırırdı**.

Yenileme mekanizması `AuthorityResolverService`'in her istekte yetkiyi
veritabanı/cache'ten yeniden çözümlemesidir; yalnız bu çözümleme
kaldırmayı geçerli kılar. `buildAuthorizedContext` ise token'ın
`authorizationVersion` değerini sunucu `token_version` ile karşılaştırıp
bayat token'ı `AuthorizationContextError('stale_authorization_version')` ile
reddeder — **izin dizilerini karşılaştırmaz**. Bu yüzden "bayat yetki
yakalandı" garantisi token sürüm doğruluğuna ve rol değişiminde token_version
güncellenmesine bağlıdır; claim'i doğrudan okumak bu güvenlik adımını bayat
token için tamamen atlar.

Constitution III: *"Protected routes MUST enforce permissions through the
established RBAC guard and permission decorators."* Controller'ın ikinci bir
yetki kaynağı tanımlaması bunun ihlalidir.

## KVKK etkisi

Receipt görünürlüğü daralır, genişlemez — düzeltme **fail-closed** yöndedir.
Yanıt şeması değişmez; `receipts` alanı yalnızca yetkili çağrıda dolu gelir.
Receipt kayıtları zaten maskeli/pseudonymize metadır ve ham veli iletişim
bilgisi taşımaz; bu düzeltmede yeni kişisel veri alanı açılmaz.

## Audit etkisi

Yan etkisi **koruyucudur**: `parent_notification:failure:read` yetkisi olmadan
receipt görüntülemek mümkün olduğu için, yetki kaldırma olayı artık receipt
erişimini de keser. Denetim kaydının *kapsamı* değişmez — bu bir görünürlük
kararı, yaşam döngüsü mutasyonu değildir; mevcut audit kanalları ve allowlist'ler
aynı kalır.

## Kanıt

- `src/notifications/notification-operations.controller.spec.ts`: bağlam gerçek
  `buildAuthorizedContext` ile kurulur (elle yazılmış sahte bağlam yoktur).
  Kapsanan dört vaka:
  1. sunucu çözümlemesi yetkiyi taşıyor → receipt döner,
  2. sunucu çözümlemesi yetkiyi taşımıyor → receipt dönmez,
  3. **çekirdek regresyon** — token bayat yetkiyi taşıyor, sunucu çözümlemesi
     taşımıyor → receipt dönmez (her iki önkoşul testte ayrıca doğrulanır),
  4. beş rotanın `@Permissions(...)` eşlemesi değişmemiştir.

Eksik bilinçli kapsam: "rol yetkiyi kaybetti → bir sonraki istekte geçerli" —
`AuthorityResolverService`'in yeniden sorgulamasını gerektiren uçtan uca bir
kapsamdır; bu dilim birim testiyle kanıtlar. Token claim'inin karara girdiği
yol ise doğrudan test edilir ve kapatılmıştır.

## Kapsam dışı

- `parent_notification:failure:read` izin kodunun kendisi ve seed içindeki rol
  ataması.
- Rotaların `@Permissions(...)` kapıları — zaten `PermissionGuard` üzerinden
  zorlanıyor ve bu düzeltmede değişmiyor.
- Aynı bayat-claim riskini taşıyan diğer okuma yolları (varsa ayrı başlıkta
  ele alınır).