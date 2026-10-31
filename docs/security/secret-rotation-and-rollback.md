# Secret Rotation and Rollback (#259 P1B-02)

Bu belge, gizli anahtar sözleşmesinin **rotasyon** ve **geri alma (rollback)**
prosedürünü ve fail-closed davranışını tanımlar. Kod tarafı:

- `src/common/security/environment-profile.ts` — `NODE_ENV` profili (fallback kapısı)
- `src/common/security/security-bootstrap.ts` — boot-time fail-closed doğrulama
- `src/auth/jwt-keyring.ts` — JWT secret + `kid` sözleşmesi
- `src/common/audit/audit-chain.ts` — audit HMAC anahtar halkası
- `src/kvkk/pseudonym.ts`, `src/kvkk/contact-crypto.ts` — KVKK anahtarları

## 1. Ortam profili: `NODE_ENV` açık olmalı

| Değer | Profil | Local fallback |
| --- | --- | --- |
| `production`, `prod` | production | **Yok** — eksik/zayıf anahtar süreci boot ettirmez |
| `development`, `dev`, `test`, `local` | local | Var (izole, sabit test anahtarları) |
| *(unset)* veya tanınmayan değer | — | **Yok** — FATAL: `NODE_ENV must be explicitly set` |

Gerekçe: eskiden `NODE_ENV !== 'production'` kontrolü, `NODE_ENV` set edilmemiş
bir konteyner/PaaS dağıtımında tahmin edilebilir local anahtarların gerçek
trafikte kullanılmasına izin veriyordu. Artık belirsiz ortam fail-closed'dır.

## 2. Boot-time doğrulama (fail-closed)

`src/main.ts` → `bootstrap()` ilk adımda `assertSecurityPostureAtStartup()`
çağırır; Nest uygulaması oluşturulmadan önce şunlar doğrulanır:

1. `NODE_ENV` profili açık.
2. `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`: var, ≥ 32 karakter, **birbirinden farklı**.
3. `JWT_KEY_ID`: production'da zorunlu, `^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$`.
4. `JWT_ISSUER`, `JWT_ACCESS_AUDIENCE`, `JWT_REFRESH_AUDIENCE`: production'da zorunlu.
5. `AUDIT_HMAC_KEY` (≥ 32), `AUDIT_HMAC_KEY_ID` (production'da zorunlu), varsa
   `AUDIT_HMAC_PREVIOUS_KEYS` JSON halkası (biçim, uzunluk, aktif kimliğin tekrarı).
6. `KVKK_PSEUDONYM_KEY` (≥ 32) + `KVKK_PSEUDONYM_KEY_VERSION` biçimi.
7. Varsa `KVKK_CONTACT_KEY` (tam 32 byte) + `KVKK_CONTACT_KEY[_PREVIOUS]` kimlikleri.

Tüm ihlaller **tek** hata mesajında toplanır ve gizli değer yazılmaz. Başarılı
boot tek satır JSON kanıt üretir:

```json
{"event":"security.posture.validated","profile":"production","jwtKeyId":"key-3",
 "jwtAccessSecretChars":64,"jwtRefreshSecretChars":64,"auditKeyId":"key-2026-10",
 "auditRetiredKeyIds":["key-2026-09"],"pseudonymKeyVersion":"p2",
 "contactKeyId":"contact-p2","localFallbacks":[],"warningCount":0}
```

Yalnız kimlikler ve uzunluklar loglanır; secret/anahtar değeri **asla**.

## 3. JWT rotasyonu (`kid` sözleşmesi)

1. Yeni secret üret (ör. `openssl rand -base64 48`), access ve refresh için **ayrı**.
2. `JWT_KEY_ID`'yi yeni kimliğe taşı (ör. `key-2` → `key-3`).
3. Secret'ları aynı anda güncelle ve süreci yeniden başlat.

Davranış:

- Issue edilen her token `kid` başlığı taşır (`JWT_KEY_ID`).
- Doğrulama (access: `JwtStrategy.secretOrKeyProvider`, refresh:
  `AuthService.verifyRefreshToken`) token'ın `kid`'i aktif kimlikle eşleşmezse
  token'ı **reddeder** (401). Eski anahtarla imzalanmış token sessizce kabul
  edilmez; `kid` taşımayan token da reddedilir.
- Algoritma `HS256`'ya sabitlenmiştir (`algorithms: ['HS256']`).
- Refresh token'lar DB'de hash olarak tutulduğu için rotasyon oturumları da
  geçersiz kılar: kullanıcılar yeniden giriş yapar. Bu bilinçli bir tercihtir —
  çapraz anahtar doğrulaması yoktur.

**Rollback:** `JWT_KEY_ID` ve secret'ları önceki değerlere döndür + restart. Aynı
`kid` + secret ile imzalanmış token'lar yeniden kabul edilir; bu arada issue
edilmiş "yeni" token'lar reddedilir. Kanıt:
`src/auth/jwt-keyring.spec.ts` ("supports rollback …"), `src/auth/jwt.strategy.spec.ts`,
`src/common/security/security-bootstrap-entrypoint.spec.ts`.

## 4. Audit HMAC rotasyonu (anahtar halkası)

`audit_logs` zinciri `prev_hash → entry_hash` + HMAC-SHA256 imzası taşır; her satır
`signature_key_id` ile hangi anahtarla imzalandığını söyler.

1. Yeni anahtar üret (≥ 32 karakter).
2. `AUDIT_HMAC_KEY_ID`'yi yeni kimliğe al, `AUDIT_HMAC_KEY`'i yeni anahtar yap.
3. Emekliye ayrılan anahtarı **doğrulama için** halkada tut:
   `AUDIT_HMAC_PREVIOUS_KEYS='{"key-2026-09":"<eski anahtar, >=32>"}'`.
4. Restart.

Davranış: yeni satırlar yeni anahtarla imzalanır; eski satırlar kendi
`signature_key_id`'siyle doğrulanır. Bilinmeyen/eksik kimlik fail-closed'dır
(`unknown-signature-key`) — sessizce aktif anahtara düşmez. Bu yüzden emekli
anahtarı halkadan **çıkarmadan** önce o anahtarla imzalanmış satırların saklama
süresi dolmalıdır.

**Rollback:** eski anahtarı `AUDIT_HMAC_KEY` + `AUDIT_HMAC_KEY_ID` olarak geri
koy; rotasyon sırasında yazılmış satırları doğrulamak için yeni anahtarı
`AUDIT_HMAC_PREVIOUS_KEYS` içine al. Kanıt: `src/common/audit/audit-chain.spec.ts`,
`src/common/security/security-bootstrap.spec.ts`,
`src/common/security/local-fallback-isolation.spec.ts`.

## 5. KVKK pseudonym rotasyonu

1. Yeni `KVKK_PSEUDONYM_KEY` (≥ 32) üret.
2. `KVKK_PSEUDONYM_KEY_VERSION`'ı birlikte artır (`p1` → `p2`).

Davranış: pseudonym çıktısı `<version>:<scope>:<hmac>` biçimindedir; yeni
sürümle üretilen referanslar eskilerden ayırt edilebilir. Pseudonym
geri döndürülemez olduğu için eski değerlerle korelasyon **kasıtlı olarak**
kırılır; geçmiş kayıtlarla eşleştirme gerekiyorsa rotasyon öncesi bunu planlayın.

**Rollback:** anahtar + sürüm etiketini eski değerlere döndür. Kanıt:
`src/kvkk/pseudonym.spec.ts`, `src/common/security/local-fallback-isolation.spec.ts`.

## 6. Parent-contact (AES-256-GCM) rotasyonu

1. Yeni 32-byte anahtar üret (`KVKK_CONTACT_KEY`), kimliğini `KVKK_CONTACT_KEY_ID` yap.
2. Eski anahtarı `KVKK_CONTACT_PREVIOUS_KEY` + `KVKK_CONTACT_PREVIOUS_KEY_ID` olarak tut.
3. Restart. Yeni envelope'lar yeni kimlikle yazılır; eski envelope'lar
   `key_id` alanıyla eski anahtarla açılır (AAD: tenant + kayıt + purpose).

**Rollback:** yeni anahtarı current'tan çıkar, eskisini current yap; bu arada
yazılmış envelope'ları açabilmek için yeni anahtarı previous olarak koru.
Bilinmeyen `key_id` fail-closed'dır.

## 7. Doğrulama komutları

```bash
npm run lint                      # tsc --noEmit
npx jest --runInBand src/auth src/common/security src/common/audit src/kvkk
npx jest --runInBand test/kvkk test/rbac
npx jest --runInBand test/runtime-integration
```

CI'da ayrıca: `Sensitive Pattern Scanner`, `db-smoke` (audit chain + retention
DB suite'leri), `backend-ci` (unit + e2e).

## 8. Bilinen sınırlar

- JWT'de çapraz anahtar doğrulaması yoktur; rotasyon tüm oturumları geçersiz kılar.
- Anahtar üretimi/saklanması bu kod tabanının değil, secret manager'ın sorumluluğudur.
- `KVKK_CONTACT_KEY` production'da yoksa boot **durmaz**; yalnız uyarı loglanır ve
  parent-contact yüzeyi ilk kullanımda fail-closed olur (yüzey açılmadan önce
  anahtarın devreye alınması beklenir).
- `NODE_ENV` artık zorunludur: yerel çalıştırmada da `NODE_ENV=development`
  (veya `test`) set edilmelidir; aksi hâlde süreç bilinçli olarak başlamaz.

