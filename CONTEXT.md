# CONTEXT.md — OkulYonetimSaaS

Bu dosya, `/grill-with-docs` oturumlarının çıktı yeridir: kararlar, DoD, açık sorular ve
alan dili. Kod/plan dokümanlarıyla çelişirse kazanan sırası:

1. `.specify/memory/constitution.md`
2. `docs/phase1-truth-matrix.md`
3. `CONTEXT.md` (bu dosya — karar geçmişi)
4. `docs/agents/*` konvansiyonları

Not: `docs/phase2/remaining-plan-v2.md` (baz `15c5ab8`) **bayatlamıştır**; kalan işin
güncel kaynağı buradaki kararlardır. Plan dokümanlarına bu aşamada dokunulmaz.

---

## Faz 1b kapanışı — kararlar (2026-10-07, main `a7bff5b`)

| # | Karar | Gerekçe |
|---|---|---|
| K-1 | **DoD barı değişmez.** Tam fresh-DB journey (publish → leave → approval → impact → assign/clear → attendance lock → notification draft), negatif matris + canary, axe kritik/ciddi = 0, truth matrix 13/13 `runtime\|pilot-ready`, 2–3 pilot okul + Go/No-Go. Yalnız *sıra* esnek, bar değil. | Kabul sözleşmesi (exact SHA + test yolu + CI URL) bu bara kurulu; yumuşatmak v1'in yanlış-yeşil sorununu geri getirir. |
| K-2 | **3 izlek.** A: R10 journey → R11 negatif/canary (hemen başlar; backend adımları main'de, artık yalnız harness'a bağlı). B: R3 bakiye → R8 UX durumları → R9 a11y (A ve C'den sonra). C: p0 AC kapanışları → R13/R15 (bağımsız, hemen başlar). | Kritik yol koddan doğrulandı: journey adımlarının backend'i merge; R3 journey'i bloklamıyor. |
| K-3 | **H1 + H3 bu hafta.** H1 = prod `JWT_*` secret + `/api/v1/health` 200 (#332, insan). H3 = her PR'da ikinci aktör review/merge (günlük ~15 dk tur). H2 (Vercel waiver #363) düşük öncelik; H4–H7 F3'te. | İnsan kapıları kritik yolda; sona bırakılırsa journey yeşil olsa bile pilot başlamaz. |
| K-4 | **Yürütme: 2 izlek, tek motor** (A + C sırayla; B sonraki oturum). Çok-ajanlı orkestratör modeli (`master-prompt-v2` §6) yalnız CI ve review kapasitesi artarsa açılır. | CI turu 5–10 dk, >4 ajan CI'ı tıkar; gerçek darboğaz tek review eden kişi (H3). |
| K-5 | **C sırası:** #367 → #358 → #339 → #263 → #259. Her biri `fixed:<sha>` + CI run URL + AC madde eşlemesi yorumu ile kapanır. #373 ayrı mimari karar; #269 journey'e (izlek A) bağlı; #332 = H1. | Bunların kodu merge; kalan eksik kanıt eşlemesi — izlek A'yı bloklamayan hızlı kazanım. |
| K-6 | **Çıkış biçimi:** yalnız `CONTEXT.md` + serbest akış. `docs/phase2/**`'ye dokunulmaz, issue tracker'a bilet açılmaz (şimdilik). | Sahibi kararı. |
| K-7 | **Sabit takvim yok.** Pilot tarihi = H1 (prod health 200) + R10 journey yeşil olduktan sonra sabitlenir (H4 o zaman çağrılır). Haftalık gözden geçirme; bir izlek 3 gün merge beklerse öncelik ona döner. | Gerçek darboğazlar insanda (H1/H3); tarih baskısı kanıt kalitesini düşürür. |

---

## Faz 1 kapsam kilidi — kararlar (2026-10-11 grilling, #382)

Numaralandırma K-1…K-7'den devam eder.

| # | Karar | Gerekçe |
|---|---|---|
| K-8 | **#373 kapsam kilidinin önkoşulu değil.** Kapsam bağımsız kilitlenir; #373 kilidin içinde açık kalem (H-kapısı prerequisite) olarak taşınır — Faz 1 pilot öncesi çözülecek. | Kilidin konusu *kapsam* (ne), #373'ün konusu *otorite* (kim); kilidi #373'e bağlamak kilidi belirsiz süre erteler (K-7). Kapsam değişikliği riski, kilidi bekletmek yerine kilidin revizyon prosedürüyle (#384) yönetilir. |
| K-9 | **Erken kilit: kapsam, H1 (prod health 200) + R10 (journey yeşil) tamamlanmadan önce kilitlenir.** Kilit = içerik dondurması, takvim taahhüdü değildir (K-7 ile uyumlu). Kanıt olgunluğu K-1 barıyla ayrı izlenir. | Kilit kapsamı (ne), DoD barı olgunluğu (kanıt) ayrı boyutlar; erken kilit barı zayıflatmaz, tanımlı kapsama uygular. Geç kilit, kanıt döneminin en yoğun alanında kapsamı belirsiz bırakır; truth matrix reconcile'u (hâlâ `15c5ab8` bazlı) sabit hedefe kavuşur. Geç keşfedilecek boşluklar (#388 gibi) kilidi bekletmek yerine revizyon prosedürüyle eklenir (#384). |
| K-10 | **#268 export güvenlik testleri (formül enjeksiyonu / cross-tenant) Faz 2'ye defer; reporting/eokul quarantine yolu Faz 1'in nihai kararıdır.** Faz 1'de #268 yalnız iki eylemle kapanır: (1) truth matrix'te satırın `quarantine / out-of-release-scope` sınıflandırması, (2) mevcut 503 quarantine kanıtı (kodda zaten var, ek iş yok). | ReportsModule + EokulSyncModule zaten `QUARANTINED_MODULES`'de env-gated 503 (`app.module.spec.ts` pinliyor); `src/`'te aktif export yüzeyi yok → formül enjeksiyonu testi vacuous. #345 rollup quarantine'ı out-of-release-scope ilan etti. Export güvenlik gerekliliği modülle Faz 2'ye seyahat eder; "quarantine'ı kaldır, complete et" kararı verilirse AC maddesi bağlayıcı olarak geri gelir. |
| K-11 | **#388 (boş DB'de ilk kullanıcı bootstrap'i) Faz 1'e girer — P0 pilot-enabler; #345 rollup'a eklenir.** | K-1 barı "2–3 pilot okul + Go/No-Go" içerir; ilk kullanıcısını oluşturamayan sistem pilotlanamaz. #332 (H1 prod auth env) ile aynı sınıf: pilotlanabilirlik önkoşulu. E2E harness'ın fixture üretimi journey'i kurtarır ama gerçek pilot okul onboard edilemez — rollup'ta (2026-10-02) #388'den önce açıldığı için yoktu. |
| K-12 | **Firefox/WebKit smoke Faz 2'ye taşınır; Faz 1 E2E kanıtı Chromium ile verilir (`puppeteer-core` + `jest-e2e`, R7 stack kararı korunur).** P1B-FINAL release-gate listesindeki "Firefox/WebKit smoke" HOLD'u Faz 1 merge gate'i olmaktan çıkar, Faz 2 olgunluk takibine yazılır. | İkinci tarayıcı yığını (playwright/driver) R7'nin bilinçli stack kararının ihlali; kapanış döneminde stack genişletmek K-1 kanıt kalitesi ruhuna aykırı. Firefox TR kamu/okul ortamında yaygın ama bugün kanıtlanmış bir pilot gerekliliği değil — somut gereklilik çıkarsa K-9/#384 revizyon prosedürüyle Faz 1'e alınır. |
| K-13 | **Frontend Faz 1 boyunca bu repoda kalır; ayrı frontend repo kararı Faz 2'ye yazılır.** | K-1 fresh-DB UI journey barı in-repo frontend'e (`frontend/runtime/` → `test/e2e`) bağlı; kapanış döneminde taşımak kabul altyapısını parçalar. Bayat `next-phase-plan.md` K3'ünün "sınır testleri tek yerde kalır" gerekçesi hâlâ geçerli; bu karar lock ile taze teyit edilir. |
| K-14 | **Faz 1/Faz 2 kapsam ayrımı onaylandı (#383 kapandı).** Tam tablo aşağıdaki alt bölümde. | K-8…K-13 + #345 rollup + truth matrix non-goal'ları sentezlendi; kullanıcı "aynen yansısın" ile onayladı (2026-10-11). |
| K-15 | **Kilidin yeri ve "kilitli" tanımı (#384 kapandı):** Yer = CONTEXT.md; "Onaylı kapsam ayrımı (K-14)" bölümü kendisi lock artefaktıdır (ayrı dosya yok — ikinci doğruluk kaynağı riski, K-6 prensibi). **Kilitli olan:** yalnız kapsam listesi (ne Faz 1'de, ne Faz 2'de). **Kilitli olmayan:** kanıt olgunluğu (K-1 barı ayrı, değişmez), zamanlama (K-7), iş detayları (AC/PR/C sırası serbest), Q-2 pilot sayısı/tarihi (kapsam dışı). **İhlal:** revizyonsuz yapılan herhangi bir kapsam değişikliği; yakalama noktası H3 review kapısı (her PR kilitle uyum açısından review'da kontrol edilir). **Revizyon:** owner (insan) yetkisiyle — CONTEXT.md tablosunda değişiklik + gerekçe + yeni K-numarası + #382 kapanış notu; ajan tek başına revize edemez; büyük revizyonlar ADR adayı. | Ayrı lock dosyası ikinci bayat adayı yaratır (v2 plan + truth matrix bayatlaması precedansı); CONTEXT.md zaten kanonik karar kaynağı. Kilit yalnız kapsamı dondurur — kanıt barını (K-1) ve takvimi (K-7) kilide bağlamak işi bloklar, K-9'un kapsam≠olgunluk ayrımıyla tutarlı. |

### Onaylı kapsam ayrımı (K-14)

**Faz 1'de KALAN**

| Kalem | Dayanak |
|---|---|
| #345 rollup leaf issue'ları + #388 (ilk kullanıcı bootstrap) = 20 leaf | Phase 1b Closure milestone; #388 = K-11 |
| K-5 C sırası: #367→#358→#339→#263→#259 | K-5 |
| PR #381 (N3, #266 parçası) merge | 4× yeşil E2E; #266 rollup'ta |
| #268 yalnız K-10 eylemleri (truth matrix `quarantine/out-of-release-scope` sınıflandırması) | K-10 |
| #373 H-kapısı olarak (açık kalem, önkoşul değil) | K-8 |
| H-kapıları: H1 (#332 prod health 200), H3 (her PR'da ikinci aktör review/merge) | K-3, K-7 |
| Frontend in-repo | K-13 |
| E2E kanıtı Chromium-only (`puppeteer-core`) | K-12, R7 |
| DoD barı (K-1, değişmez): fresh-DB journey + negatif matris + canary + axe kritik/ciddi=0 + truth matrix 13/13 `runtime\|pilot-ready` + 2–3 pilot okul + Go/No-Go | K-1 |

**Faz 2'ye TAŞINAN**

| Kalem | Dayanak |
|---|---|
| Gerçek SMS/e-posta/WhatsApp provider entegrasyonu (Faz 1 = sahte provider + dispatch audit) | Bayat K2 tazelemesi |
| Reporting/eokul complete + export güvenlik testleri | K-10 |
| Firefox/WebKit smoke | K-12 |
| Ayrı frontend repo kararı | K-13 |
| Recommendation engine, Notion sync, production auto-merge activation | Truth matrix non-goal'ları |
| H4–H7 insan kapıları (lock'un ötesinde) | K-3 ("Faz 3'te") |

**Kilidin dışında (açık izlenir)**

- Q-2 pilot okul sayısı/tarihi — H1+R10 sonrası sabitlenir (K-9); kapsamın parçası değil, zamanlama
- Sabit takvim yok | K-7

### Kabul kuralı (bağlayıcı, devralınan)

Bir dilim yalnız `runtime|pilot-ready` + exact head SHA + test yolu + CI run URL ile
kapanır. "PR merge edildi" kapanış kanıtı değildir. Zorunlu check
`skipped/queued/cancelled` ise PASS değildir. main'e doğrudan push yok.

---

## PR #414 review kararları — grilling (2026-10-14, #266/#269)

Numaralandırma K-1…K-15'ten devam eder. Bu kararlar PR #414'ün yorum
sınırlarıdır; sonraki oturumlar bunları yeniden açmaz (kanıt: bu tablo).

| # | Karar | Gerekçe |
|---|---|---|
| K-16 | **#414 tam teslim taahhüdü: #266/#269 AC'leri kod tarafında gerçekten kapatılır; "kısmi teslim" çerçevesi reddedildi.** Review'da bulunan 7 kod boşluğu bu PR'da düzeltilir; süreç kalemleri (#266 AC9 verdict'leri, #269 video/canary/axe) PR body'de "Kapsam dışı" olarak deklare edilir ve post-merge takip eder. | Yanlış-yeşil riski (K-1 ruhu): AC kapatıldı iddiası kodla desteklenmiyorsa merge edilmez. |
| K-17 | **`kvkk_consents` hukuki zemin modeli (Q3-C):** `legal_basis` + `retention_days` kolonları eklenir; consent-time'da `CONSENT_TYPE_METADATA` map'inden (`src/kvkk/consent-authority.ts`, tek kaynak) yazılır. `purpose` = mevcut `consent_type` kolonudur — ayrı `purpose` kolonu YOK. Snapshot/API/UI bu alanları taşır. Değerler: `legalBasis: 'consent'`, `retentionDays: 3650` (audit retention ile hizalı). | KVKK şeffaflık: consent satırının hukuki dayanağı ve saklama süresi denetlenebilir olmalı; amaç zaten consent_type. |
| K-18 | **`delivered` durumu (Q6-A):** outbox'a `delivered` status + receipt'e `provider_delivered` outcome eklenir; simulator accept modunda (ve `fail_first` başarı denemesinde) `provider_delivered` üretir → satır `delivered` olur. `provider_accepted → dispatched` eşlemesi korunur. `simulated = true` CHECK'i DEĞİŞMEZ (gerçek dış teslimat yine imkânsız, fail-closed). | "Gönderildi" (accepted) ile "Teslim edildi" (delivered) ayrımı; UI/DB/testler bu ayrımı yansıtır. |
| K-19 | **Revoke audit dürüstlüğü (Q5-A):** `dataprotection.consent.revoked` için `changedFields` = gerçek değişen kolonlar (`status`, `revokedAt`, `version` — allowlist'e eklendi); `redactionReceipt` payload'dan ölçülür (`noneRedactionReceipt`: evaluated = metadata anahtar sayısı, redacted 0, skipped = evaluated). Uydurma `purpose`/`legalBasis` iddiası ve sabit `evaluatedFieldCount: 6` kaldırıldı. | CLAUDE.md Verification Protocol: audit kanıtı uydurulamaz; denetçi `redacted+skipped=evaluated` muhasebesini doğrulayabilmeli. |
| K-20 | **Hassas okuma audit'i yalnız consent yüzeyi (Q7-B):** `GET /consents` listesi aynı transaction'da `dataprotection.consent.read` (yeni event; `DATA_PROTECTION_POLICY` — receipt zorunlu, actor zorunlu) yazar; `entityId` = tenant. Notification listeleri PII taşımaz ve audit yazmaz (mevcut davranış korunur). | KVKK madde 12: hassas yüzeye erişim kayda geçmeli; her PII'sız notification okumasını audit'e sokmak audit zincirini boğar. |
| K-21 | **Scope creep korunur, iddia düzeltilir (Q8-A):** landing page, `/` rewrite, login UI, `admin-user.seed.ts` bu PR'da kalır; PR body'deki "Varsayılan davranış değişikliği yok" cümlesi yanlıştır — `/` route değişikliği + bu kalemler Kapsam'a açıkça yazılır. | Değişiklikler küçük ve geri alınabilir; gizlemek review riskini büyütür. |
| K-22 | **S10b revoke gerçek UI yolundan (Q9-C):** consent kartı "Onayı geri çek" butonu (`data-subject-ref-id` + `data-consent-type`) ile UI revoke; re-grant (SQL `seedConsentPreconditions`) yalnız **önkoşul geri yükleme** (precondition restore) olarak sınıflandırılır ve `acceptance-tables.ts` yorumu ile PR body'de belgelenir. Consent API'sinde grant endpoint'i/UI'ı YOK (dokümante önkoşul). | Kabul kanıtı gerçek kullanıcı yolundan üretilmeli (K-1); re-grant bir iş sonucu değil, bozulan journey önkoşulunun yeniden kurulması. |
| K-23 | **R10 AC(b) dürüst sıralama (Q10-A):** `test:e2e` ikiye bölünür — stage5 JOURNEY ilk koşar (tek jest çağrısı), sonra diğer spec'ler; stage5 `beforeAll` job-outcome tablolarının (outbox + receipts) tenant için boş olduğunu assert eder (`JOB_OUTCOME_PRECONDITION_FAILED`). `waitForCountAtLeast` "alt sınır" telafisi yorumu kaldırılır. | Kirletilmiş paylaşımlı DB'de journey kanıtı güvensizdi; sıralama + assert ile boşluk kanıtlanır. |
| K-24 | **fillField kalır, sınır deklare edilir (Q11-B):** `fillField` (page.evaluate set value + input event) E2E'de kalır; yasak olan R3 (fetch/XHR enjeksiyonu) ve R4 (DOM'a iş sonucu yazma) kapsam dışıdır — kanıt: `acceptance-evidence.guard.spec.ts` R3/R4 kuralları. PR body'de bu sınır yazılır; bulgu `rejected:<counter-evidence>` ile kapatılır. | Guard zaten AC2'nin yasakladığı iki ihlali kodlar; 20 çağrı sitesi + headless datetime-local typing gerçekçiliği. |
| K-25 | **Consent kartı hukuki zemin gösterir (Q12-A):** kart-meta'ya `Hukuki sebep: <legal_basis> · Saklama: <retention_days> gün` span'ları eklenir (backend snapshot alanlarından). | Operatör/DPO, onayın dayanağını ve saklama süresini UI'da görebilmeli (K-17'nin yüzey karşılığı). |
| K-26 | **Standards smell'leri follow-up issue'ya (Q4-B):** bu PR yalnız review'un hard violation'ını (K-19 sahte audit) düzeltir; `extractRows` 4 kopyası, `REQUEST_FAILURE_CATEGORIES` (main.ts vs audit.interceptor) drift'i, outbox scope-check 5 inline sitesi, app.js divergent change, `{tenantId,branchId,id}` data clump'ı tek follow-up issue'da toplanır. | Boyut/odak: smell temizliği review kanıtını geciktirmemeli; hepsi davranış-değiştirmeyen refactor. |
| K-27 | **HCO evidence contract (#266):** review bulguları issue #266'ya `fixed:<commit>` / `rejected:<counter-evidence>` formatında comment olarak yazılır; terminal verdict'ler PR head_sha'ya bağlanır. | HCO sözleşmesi: bulgu yaşam döngüsü izlenebilir olmalı. |
| K-28 | **Bu kararlar bu dosyada yaşar (Q13-A):** grilling çıktısı CONTEXT.md'nin tarihli karar bölümüdür; ADR altyapısı yok, ayrı dosya ikinci doğruluk kaynağı yaratır (K-6 prensibi). | Gelecek agent aynı review'u yeniden açmaz; CONTEXT.md kanonik karar evidir. |

---

## #443 kararları — kanonik UI-state haritası (2026-10-17)

Numaralandırma K-1'den K-28'e devam eder. Bu kararlar #443'ün (`/grill-with-docs`
çıktısı değil, ticket + #441 spec'i) uygulamasında alınan tasarım kararlarıdır.

| # | Karar | Gerekçe |
|---|---|---|
| K-29 | **Öncelik sırası: çağrının bildirdiği kapsam → sunucunun kodu → HTTP durumu → bilinmeyen.** `canonicalUiState` önce `options.notFoundUiState`'i uygular, sonra `SERVER_REASON_UI[serverAuthoredCode(body)]`, sonra `HTTP_STATUS_UI_STATE`. Sunucunun gönderdiği kod haritada yoksa çökme değil, kapsamın kendi varsayılan durumu kullanılır. | #443'ün temel şikâyeti "409 her şeyde yedek öğretmen çakışması" idi. Kod → durum eşlemesi tek ve toplu olduğunda dört publish/sürüm sonucu birbirine karışamaz. `notFoundUiState` önce gelir çünkü 404'ün anlamı çağıranın ekranına aittir: şube seçiminde reddedilen şube ile var olmayan şube **ayırt edilemez** (`deny-response.ts`), dolayısıyla 404 orada `forbidden_non_enumerating`'dir, `empty_or_not_found_same_scope` değil. |
| K-30 | **Sürüm beklentisi taşıyan bir isteğin kodsuz 409'u `stale_version`'dur.** Bu, istemcide *sebep kodu* üretmek değildir (`serverCode` yine boştur, AC7 sağlanır); sunucunun "sürümün artık geçerli değil" gerçeğini, sunucunun kodu göndermemesine rağmen sınıflandırmaktır. Kural dar tutulmuştur: yalnız istek `If-Match`/`expectedVersion` taşıyorsa ve yanıt hiçbir kod içermiyorsa geçerlidir. | Bildirim taslağı onayı (`expectedVersion`) sunucu tarafında 409 + sadece İngilizce `Conflict` zarfı döndürüyor; eski kod bu boşluğu yedek öğretmen mesajıyla dolduruyordu. #443 AC3 bu yolun kanonik `stale_version` kopyasını istiyor. Kural genişletilirse (kodsuz her 409 → stale) yarış durumu çakışma olarak da görünür ve iki durum birbirine karışır. |
| K-31 | **`mutationDisabled()` her değiştirici düğmede render anında değerlendirilir; runtime'ta zamanlayıcı yoktur.** Bekleme penceresi `state.rateLimitedUntil` + `Retry-After` başlığından gelir. Bu, runtime'un "zamanlayıcı/fake-time yok" sınırının bilinçli sonucudur (`runtime-boundary.spec.ts` `setTimeout(() =>`'ı yasaklar). | #443 AC5 "tekrar eylemi kısa süreliğine devre dışı" diyor. Kalan boşluk dürüstçe: bekleme bitmeden düğmeler ancak bir sonraki render'da geri gelir. Bu bir kusur değil, kabul edilen bir sınırdır; `data-state="rate_limited"` bölgesi bekleme süresini kendi kopyasıyla bildirir. Zamanlayıcı eklenirse sınır `runtime-boundary.spec.ts` içinde gerekçesiyle birlikte değişmelidir — sadece bir `setTimeout` kaçırmak için değil. |
| K-32 | **Her render bölgeye kanonik `data-state` damgalar.** Hata durumu `data-state="<canonical>"` yazar; başarılı kayıt render'ı `data-state="record_ready"` yazar. Böylece önceki hatanın durumu sonraki başarılı çizimde sızamaz. | #443 kabulünde bulunan gerçek sızıntı: `renderNotificationDetail` bölgenin `data-state`'ini temizlemediği için detay yeniden yüklendikten sonra bile `stale_version` görünüyordu. Kanıt/erişilebilirlik paketleri bölge özniteliğini okuduğu için tek kaynak (bölge) zorunlu. |

## #446 kararları — kopya hijyeni (2026-10-17)

Numaralandırma K-1'den K-32'ye devam eder.

| # | Karar | Gerekçe |
|---|---|---|
| K-33 | **Görünen metne yalnız `displayTerm`/`displayStatus` eşleyicileri üzerinden ulaşılır.** Ham tanımlayıcı, kullanıcıya gösterilmeyen tanılama kanalında (`data-*` özniteliği) kalır. `termKey` tek normalizasyon noktasıdır; `displayStatus`/`statusTone`/`displayTerm` hepsi onu kullanır. | Ticket'ın statik denetimi bir alan *adı* listesiyle çalışır; alan adını değiştirip aynı ihlali yapmak onu atlatırdı. Bunun yerine kural alan adına değil **akışa** bağlı: yönetilen bir tanımlayıcı kopyaya yalnız bir görünüm eşleyicisinden geçebilir. `displayTerm` önce sunucunun gönderdiği değeri, sonra normalize biçimi arar — M3 bulgu kodları `UPPER_SNAKE`, KVKK/izin sözlükleri `snake_case` geldiği için tek normalizasyon yetmiyordu. |
| K-34 | **Çizelge doğrulama bulguları #446 kapsamındadır; bulgunun *durum kimliği* #451'in.** #446 bulgunun okunabilir metnini verir (16 kanonik kodun tamamı, kod metin olarak hiç gösterilmez); #451 her kodun ayrı UI durumu, güne göre gruplama, çakışmanın karşı dersi adlandırması ve kısmi doğrulama ayrımı üzerine çalışır. Bulgu listesi artık `slice(0, 10)` ile kırpılmaz: on altısı da çizilir. | #446 "Problem" bölümü doğrulama bulgularını açıkça sayar. Kırpma, dokuz farklı sorunu tek listede kaybetme riskiydi ve #451'in "hiçbir bulgu diğerine birleşmez" kuralıyla çelişiyordu. |
| K-35 | **Yoklama roster'ındaki 8 karakterlik öğrenci kimliği kaldırıldı; ticket'ın madde listesinde yoktu, ama "bir yönetici asla iç tanımlayıcı görmemelidir" gerekçesiyle zorunluydu.** Düğme zaten `data-student-id` taşıyor, yani davranış değişmedi. | Ticket'ın AC1'i izin/onay/bildirim kartlarıyla sınırlıydı; görünür metinde duran bir UUID parçası bırakmak, ticket'ın başlığındaki iddiayı yanlış yapardı. Kapsul dışı olduğu burada, bilerek kaydedilmiştir (K-26). Çizelge satırındaki UUID'ler ise *doldurulması gereken form alanıdır* (metin değil); o ekran #450/#452'nin konusu, kapsam dışı bırakıldı. |

---

---

## #414 code-review düzeltmeleri — kararlar (2026-10-19)

Bu tur, `main...HEAD` üzerinde çalışan `/code-review` (Standards + Spec eksenleri)
bulgularını kapatır. Numaralandırma K-35'ten devam eder (#446 kararları bu
HEAD'de mevcuttur).

| # | Karar | Gerekçe |
|---|---|---|
| K-36 | **K-19 düzeltmesi: `changedFields` gerçek KOLON adlarını taşır** — `['status', 'revoked_at', 'updated_at', 'version']`. K-19'daki `revokedAt` bir kolon değil, takma addı (kolon `revoked_at`); ayrıca revoke `UPDATE`'i `updated_at = now()` da değiştirdiği için `updated_at` beyan edilmeliydi. Allowlist (`DATA_PROTECTION_CHANGED_FIELDS`) ve `DataProtectionAuditChangedField` tipi birlikte güncellendi. | K-19'in amcı "gerçek değişen kolonlar"dı; camelCase takma ad denetçi tarafından tabloya karşı doğrulanamıyor, `updated_at` ise sessizce eksik kalıyordu (dürüstlük ihlali). K-19'un K-28 gereği bağlayıcı olduğu için bu satır değişikliği de burada, gerekçesiyle kayıt altındadır. |
| K-37 | **Bildirim yüzeyinde tek "kaynak yok" sinyali: non-enumerating 404.** `?status=` filtresi geçersizse 400 (giriş doğrulama hatası; 403 yalnız yetki reddi). Kapsam dışı bildirim/draft için 404 — hem okuma (`detail`) hem mutasyon (`execute`/`retry`/`cancel`) ucunda; 403'e düşen "satır bulunamadı" yolları kaldırıldı. | Constitution III/VI (yetki reddi ile kaynak-yok ayrımı; kararlı ve açık hata yanıtları) + CONTEXT.md "Branch scope" glossary'si (görünmeyen branch izninde non-enumerating 404) + ADR production-frontend-runtime kural 4. Aynı kayıt sınıfının iki farklı sinyali, başka şubede satırın varlığını ele veriyordu. Runtime tarafında bu, `GET /notifications/:id` ile aynı `empty_or_not_found_same_scope` yüzeyini gösterir; frontend değişikliği gerekmedi. |
| K-38 | **K-17 tek kaynak migration backfill'i ile uygulanır.** Grant endpoint'i/UI'ı K-22 gereği yoktur; dolayısıyla `legal_basis`/`retention_days` kaynağı `CONSENT_TYPE_METADATA` olmak üzere `1880000000000` migration'ı mevcut satırlara **geri yazar** (`COALESCE`: yalnız NULL kolonlar dolar). Migration değerleri gömülüdür (uygulama kodunu import etmez — uygulanmış migration'ın anlamı kaynak kodla birlikte değişmemelidir); map ile eşitliği `test/database/consent-legal-basis.migration.spec.ts` CI'da sabitler. Map'te olmayan consent_type için değer uydurulmaz (satır NULL kalır; `chk_kvkk_consents_consent_type` izin verdiği hâlde `general_processing`/`attendance_tracking` bu kapsamın DIŞINDADIR — hukuki zemin dayanağı kararı henüz verilmedi, ayrı karar konusu). | K-25'in UI yüzeyi boş kalmasın diye kolonların gerçekten dolu olması gerekiyor; ama K-22 bir grant yolu yazmayı yasaklıyor. Migration, uygulanmış-artefakt-donması ilkesiyle (migration uygulama koduna bağımlı olmaz) birlikte tek kaynağı uygular. |
| K-39 | **K-26 follow-up #416'ya ek iki kalem:** (a) `frontend/runtime/screens/*` içindeki tekrar eden load→fetch→render iskeleti (5 kopya), (b) `test/jest-acceptance-guard.json`'ın `.scratch/` keşfi (K-23 AC 11/11 sayımı bozuluyordu — bu turda ayrıca düzeltildi). | Bu turda düzeltilenler: guard keşfi (yanlış-yeşil riski, doğrudan AC ihlali). Kalan tekrar, K-26 gerekçesiyle (odak: davranış-değiştirmeyen refactor) #416'da. |

## #444 kararları — paylaşılan bölge durumları (2026-10-17)

Numaralandırma K-1'den K-35'e devam eder.

| # | Karar | Gerekçe |
|---|---|---|
| K-36 | **Tek paylaşılan yol: `renderRegionState(target, uiState, message, title)`.** Boş, engelli ve çevrimdışı durumlar hepsi bu fonksiyondan geçer; `target.dataset.state`'i damgalar, `canonicalStateBlock`'la çizer ve `announce()` ile canlı bölgeye bildirir. `renderError` ve (eski) `renderBlockingState` artık başka çizim yolu açmaz. | #444 AC1/AC6: "Empty, blocked and offline states render through one shared path that stamps the canonical state attribute on the region." Önceki kodda `empty()` ayrı bir string üretiyordu, `renderError` ve `renderBlockingState` kendi `data-state`'lerini kendileri damgalıyordu. Tek yol olmadan kanıt/erişilebilirlik paketleri okumak için üç farklı özellik aramak zorunda kalırdı. |
| K-37 | **Her alan kendi boş durum kopyasını taşır (`EMPTY_COPY`).** Altı alan (kuyruk, aday, izin, onay, bildirim, yoklama) + etki ve çizelge için ayrı başlık/mesaj. Boş durum içinde `<button>` veya `data-action` yok; `same_scope_empty` için `recovery-hint` bastırılır — boş bölgenin tek işi alanı tanımlamak ve yönlendirmek. | #444 AC2/AC3. `displayTerm` kullanımı: ticket'ın "What to build" bölümü doğrulama bulgularını açıkça sayıyor. |
| K-38 | **Sayaç sıfırlama tek noktada: `resetCountsExcept(...keep)`.** Her yükleme fonksiyonu diğer iki sayacı sıfırlar; `resetCountsExcept('queueCount')` vb. Böylece `loadCandidates` sonrası `loadQueue` "0 açık ders · 0 etki · 3 aday" göstermez. | #444 AC4. Ticket'ın AC4'ü tazeleme sonrasıki bir sonraki yüklemede de geçerli olmalı — yoksa sayaçlar bir önceki alanın eski değerini taşır. |

---

## Açık sorular

| # | Soru | Durum |
|---|---|---|
| Q-1 | **#373 — global audit doğrulama platform otoritesi kim?** (Refs #367 #358; trust-anchor #369 main'de) Mimari karar, sahibi insan. | Kilidin önkoşulu DEĞİL (K-8, 2026-10-11): kapsam bağımsız kilitlenir, #373 H-kapısı olarak içinde taşınır. Karar kendisi hâlâ bekliyor — izlek C #259'dan sonra. |
| Q-2 | Pilot okul sayısı/tarihi (eski K4/K5) — K-7 gereği H1+R10 sonrası | Bekliyor |
| Q-3 | #268 export güvenlik testleri (formula injection / cross-tenant) — quarantine #371 merge, test kapsamı netleşmedi | KAPANDI (K-10, 2026-10-11): Faz 2'ye defer. Faz 1'de kalan yalnız truth matrix sınıflandırması + mevcut 503 kanıtı. |

## Bilinen boşluklar (düzeltme bekleyen)

- `AUDIT_HMAC_PREVIOUS_KEYS` runtime tarafından okunmuyor → rotasyon uçtan uca desteklenmiyor (`artifacts/H1-H2/H1-prod-env-and-health.md`, #364/#370 kayıtlı).
- Truth matrix satırları hâlâ `15c5ab8` bazlı; sonraki reconcile R14 yerine yeni bir dilimde (matrix bayat = R6 riski).

---

## Alan dili (domain glossary)

| Terim | Anlam |
|---|---|
| **Leave request** | Öğretmen izin talebi; durum makinesi `draft → pending → approved/rejected`. Onay kararı (`decide()`) gerçek impact analiziyle tek transaction'da üretilir (audit + outbox atomik). |
| **Impact (etki analizi)** | İznin ders/oturumlarına etkisi; `LeaveImpactAnalysisNotReadyException` yalnız gerçek veri yoksa atılır. |
| **Coverage** | İzinli oturumların karşılık durumu (`coverageStatus`: not_required/unresolved/covered); karar türetilir (`leave-policy.ts`), sunucu hesaplar. |
| **Substitution assignment** | Aday öğretmenin bir oturuma atanması (`leave_substitution_assignments`, state: assigned/cleared); If-Match/version ile, aday uygunluğu sunucuda doğrulanır. Audit: `leave.substitution_assigned/cleared.v1`. |
| **Journey (#269)** | Fresh-DB, gerçek UI ile uçtan uca kabul senaryosu (`test/e2e/`); iş sonucu SQL seed ve `page.evaluate(fetch)` yasak (fail-closed guard). |
| **Acceptance guard** | `test/acceptance-guard/` — yanlış-yeşil kanıtı statik olarak reddeden fail-closed kontroller. |
| **Truth matrix** | `docs/phase1-truth-matrix.md` — 13 satırın `planning-only/internal/runtime/pilot-ready` sınıflandırması; merge-ready = P0/P1 satırlar tamamı runtime/pilot-ready + kanıt. |
| **Outbox / dispatch** | Kilitli oturumdan atomik + idempotent bildirim kuyruğu; `queued ≠ sent`. Manuel dispatch (claim/fencing + durable receipts) main'de; gerçek provider Faz 2. |
| **Consent (rıza)** | Versioned + geri çekilebilir KVKK onayı (`kvkk_consents`); onay yoksa gönderim `blocked_consent` (fail-closed). |
| **Audit zinciri** | Tamper-evident: seq + prev_hash + entry_hash + HMAC; checkpoint trust-anchor #369 ile main'de; retention prune quarantine'lı (#366). |
| **DoD (bar)** | Faz 1b kapanış tanımı — K-1. |
| **İnsan kapısı (H#)** | Ajanın yapamadığı iş (secret kurulumu, review/merge, pilot imzası, DPO onayı); `progress-v2.md` §3'te izlenir, ajan "yapıldı" diyemez. |
| **Kapsam kilidi** | Faz 1 kapsamının dondurulması (K-14 tablosu); yalnız owner revizyon prosedürüyle (K-15) değiştirilebilir. Yeri CONTEXT.md. Kilitli olan yalnız kapsam listesi — kanıt olgunluğu (K-1) ve zamanlama (K-7) kapsam kilidine bağlı değildir. |
| **Published schedule occurrence** | Yalnız aktif yayınlanmış schedule version ve effective tarih aralığı içindeki, izinle pozitif süre kesişen somut ders oturumu; taslak, arşiv veya historical published version occurrence üretmez. |
| **Leave impact occurrence key** | `leave + schedule version + schedule event + occurrence date`; aynı gün iki ders veya replay'de tekrar işlenen satır için occurrence kimliğidir. |
| **Zero impact** | Etkilenen ders sıfır ve publication/DB/lookup hatası olmadığı açık sonuç (`NO_PUBLISHED_SCHEDULE_EVENT` veya `NO_OVERLAPPING_OCCURRENCE`); “hiç bakılmamış” durumundan ayırt edilir. |
| **Lookup failure** | Publication, eligibility veya veritabanı kaynağı okunamadığında ortaya çıkan açık hata; boş/yetersiz aday ya da sıfır etki sonucu gibi başarılı gibi lanse edilemez. |
| **Eligibility finalization** | Aday sorgusu yalnız eligibility authority hazır ve başarılı olduğunda `finalized=true` olur; boş aday listesi gerçek “uygun öğretmen yok” sonucudur. |
| **Leave requester identity** | Leave talebini açan kullanıcı hesabı; öğretmen subject (`teacherId`) ile birleştirilemez ve self-decision guard ikisini de ayrı karşılaştırır. |
| **Branch scope** | Tenant içinde aktörün şube görünürlüğü; görünmeyen branch izninde kaynak non-enumerating `not found` (404) döner ve mutasyon transaction'ında yeniden doğrulanır. |
| **Daily Operations projection** | Aynı occurrence key ile idempotent yazılan açık/rezerve operasyon satırı kümeleri; coverage bu satırlar ve assignment sayılarından türetilir, ikinci karar API oluşturmaz. |
| **Assignment replay** | Aktif assignment set korunarak aynı occurrence key için projection upsert; clear transition (`assigned → cleared`) aynı transaction'da coverage'ı recompute eder. |

---

## Oturum geçmişi

| Tarih | Olay |
|---|---|
| 2026-10-07 | İlk `/grill-with-docs`: Faz 1b kapanışı grilling (7 karar K-1…K-7); v2 plan bayat tespiti (R1, R2, R4–R7, R12, R14 merge); dosya kuruldu. |
| 2026-10-11 | `/grill-with-docs` #382 kapsam kilidi grilling: **8 karar (K-8…K-15), 5 wayfinder biletinin tamamı kapatıldı** (#383→K-14, #384→K-15, #385→K-8, #386→K-9, #387→K-10). Q-3 kapandı; Q-1 kısmen (kilide önkoşul değil, kararı hâlâ açık). Glossary'ye "Kapsam kilidi" + "Pilot-enabler" eklendi. ADR: değerlendirdim, barajı geçmedi (plan artefaktı, mimari kilit değil) — atlandı. |
| 2026-10-14 | PR #414 review grilling: **13 karar (K-16…K-28)** — #414 tam teslim (K-16), consent hukuki zemin (K-17/K-25), delivered durumu (K-18), revoke audit dürüstlüğü (K-19), consent.read audit'i (K-20), scope creep deklarasyonu (K-21), S10b UI revoke (K-22), stage5-first + job-outcome assert (K-23), fillField sınırı (K-24), smell follow-up (K-26), HCO evidence (K-27). Kod tarafı bu PR'da uygulandı. |
| 2026-10-15 | `/grilling` + `/domain-modeling`: Leave vertical slice terimleri netleştirildi — published occurrence/impact key, zero impact vs lookup failure, eligibility finalization, requester/teacher identity, branch scope, projection idempotency, timezone, substitution clear/recompute. ADR 0001 eklendi (decision ve coverage ayrılığı). |
