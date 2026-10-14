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
| **Pilot-enabler** | Pilotu (K-1: 2–3 okul + Go/No-Go) doğrudan bloklayan Faz 1 kalemi (ör. #332 H1 prod health, #388 ilk kullanıcı bootstrap). |

---

## Oturum geçmişi

| Tarih | Olay |
|---|---|
| 2026-10-07 | İlk `/grill-with-docs`: Faz 1b kapanışı grilling (7 karar K-1…K-7); v2 plan bayat tespiti (R1, R2, R4–R7, R12, R14 merge); dosya kuruldu. |
| 2026-10-11 | `/grill-with-docs` #382 kapsam kilidi grilling: **8 karar (K-8…K-15), 5 wayfinder biletinin tamamı kapatıldı** (#383→K-14, #384→K-15, #385→K-8, #386→K-9, #387→K-10). Q-3 kapandı; Q-1 kısmen (kilide önkoşul değil, kararı hâlâ açık). Glossary'ye "Kapsam kilidi" + "Pilot-enabler" eklendi. ADR: değerlendirdim, barajı geçmedi (plan artefaktı, mimari kilit değil) — atlandı. |
| 2026-10-14 | PR #414 review grilling: **13 karar (K-16…K-28)** — #414 tam teslim (K-16), consent hukuki zemin (K-17/K-25), delivered durumu (K-18), revoke audit dürüstlüğü (K-19), consent.read audit'i (K-20), scope creep deklarasyonu (K-21), S10b UI revoke (K-22), stage5-first + job-outcome assert (K-23), fillField sınırı (K-24), smell follow-up (K-26), HCO evidence (K-27). Kod tarafı bu PR'da uygulandı. |
