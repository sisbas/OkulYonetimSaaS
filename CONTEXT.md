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

## Thread politikası — karar (2026-10-13, #368)

| # | Karar | Gerekçe |
|---|---|---|
| K-16 | **Review thread resolve'u pre-merge standarttır; kanıt disiplini değişmez.** Bir thread yalnız `fixed:<sha>` ile kapatılır; o commit resolve anında PR'ın mevcut head'inde bulunmalı, testler gerçekten koşmuş, verification failure olmamalıdır; resolve sonrası `isResolved` API teyidi alınır. `deferred`/kanıtsız kapatma yasağı (§11-8) aynen sürer. Force-push ile fix'in head'den çekilmesi kural ihlalidir. Eski metindeki "yalnız merge sonrası resolve" hükmü (progress-v2.md eski §2) ruleset 19052349 ile deadlock üretiyordu (#368); fiili pratik zaten pre-merge'di (PR365 scoped yetkisi, #392, #394). | Ruleset merge kapısını GitHub-native zorlar: pre-merge resolve + head'de fix, squash anında main'de garanti demektir; "merge sonrası resolve" ise merge sonrasında kimseyi resolve'a zorlayamaz — garanti kağıt üstünde kalır. Eski iki şart birbirini kilitliyordu (resolve için merge'i, merge için resolve'u şart koşmak); K-16 ikisini tek doğrulukta birleştirir: main'e girecek commit head'de kanıtlanır, sonra resolve edilir. |

## Oturum geçmişi

| Tarih | Olay |
|---|---|
| 2026-10-07 | İlk `/grill-with-docs`: Faz 1b kapanışı grilling (7 karar K-1…K-7); v2 plan bayat tespiti (R1, R2, R4–R7, R12, R14 merge); dosya kuruldu. |
| 2026-10-11 | `/grill-with-docs` #382 kapsam kilidi grilling: **8 karar (K-8…K-15), 5 wayfinder biletinin tamamı kapatıldı** (#383→K-14, #384→K-15, #385→K-8, #386→K-9, #387→K-10). Q-3 kapandı; Q-1 kısmen (kilide önkoşul değil, kararı hâlâ açık). Glossary'ye "Kapsam kilidi" + "Pilot-enabler" eklendi. ADR: değerlendirdim, barajı geçmedi (plan artefaktı, mimari kilit değil) — atlandı. |
| 2026-10-13 | Triage oturumu: #393 spec → PR #394 shipped (H1 operatör rehberi + codex P2 test hijyeni fix); #336 governance incident kapatıldı (kök neden #335, fix #343 main'de); #344/#345 `enhancement`, #368 `ready-for-human`. Aynı gün #368 owner kararı: **K-16** thread politikası (pre-merge resolve + kanıt disiplini) — progress-v2.md hizalandı, deadlock bitti. `ready-for-human` triage etiketi oluşturuldu. |
