# Faz 1b Kapanışı ve Canlıya Geçiş Planı (Next Phase Plan)

**Tarih:** 2026-09-22
**Baz alınan main HEAD:** `43b616363a5d1d1d4cab5057e666f4e7ae3a2c1e` (#351 merge)
**Kanıt kaynakları:** `docs/phase1-truth-matrix.md`, GitHub issue/milestone/PR API (`sisbas/OkulYonetimSaaS`), `.github/workflows/*`, `scripts/ci-quality-gate.sh`, `test/jest-e2e.json`, `.specify/memory/constitution.md`
**Sahiplik:** CTO (HCO loop) · Backend/API (primary) · Security/KVKK · Data/DB · QA/Acceptance · UX (downstream consumer)
**İlişkili:** epic #257 (kapalı, Faz 1b) · #344/#345 (Phase 2 epic + WS1 takibi) · master prompt: `docs/phase2/master-prompt.md`

---

## 1. Bugünkü durum — tek bakışta

| Alan | Durum (kanıt) |
|---|---|
| main CI | 6/6 zorunlu workflow `success` (`43b6163`, 22.09.2026 19:14 UTC) |
| Truth matrix | 7 `runtime` / 2 `internal` / 3 `planning-only` → **NOT merge-ready**; matrix `0b1586c`'de yazılı, gerçek main `43b6163` → **2 kod merge bayat** (#349, #351) |
| Açık issue | 15 (9'u Faz 1 kapsamı), bunların **5'i `p0`** |
| Kod hacmi | `src/` 246 dosya / ~22.340 satır; 32 migration; `test/` 41 dosya |
| Test örtüsü | 97 spec / ~9.551 satır; **`test/e2e` = 0 spec** |
| Frontend testleri | `test/frontend-runtime/*.spec.ts` **statik string assertion** (browser çalıştırmıyor) |
| Kabul (acceptance) | Yeşil `P0 browser E2E and artifact evidence` check'i `scripts/qa-p0-browser-e2e.js`'e dayanıyor: `INSERT INTO schedule_events` (satır 430), `INSERT INTO leave_requests` (442, 447) + 6 `page.evaluate` → **#269 AC-1/AC-2 ihlali = yanlış-yeşil** |
| Production/pilot | `/api/v1` prod'da `500 FUNCTION_INVOCATION_FAILED` (#332, `JWT_ACCESS_SECRET` eksik); Vercel Git-source preview ölü (#329) |
| Governance | PR #352 (+4.786/47 dosya) CI'da tam yeşil ama `mergeStateStatus = BLOCKED` (#346'da da aynı darboğaz yaşandı) |
| Milestone | M1 `closed`; M2/M3 açık ama **0 açık issue**; **hiçbir milestone'da `due_on` yok** |

### Kritik yorum
Kod üretimi artık ana darboğaz değil. Sıralı darboğazlar:
1. **Kabul katmanının sahteliği** (`test/e2e = 0` + yanlış-yeşil P0 E2E check'i) → tüm "PASS" kanıtlarını güvenilmez kılar.
2. **Governance/inceleme kuyruğu** (#352 blocked; #346 geçmişi).
3. **Kritik yol bağımlılığı**: #263 → #266 → #269 (kök #263).
4. **Ortam/konfig** (#332, #329) — pilot deneyimi bugün canlıda çalışmıyor.

---

## 2. Faz 1b kapanış tanımı (Definition of Done)

Bir iş, aşağıdakilerin **tamamı** sağlanmadan "kapanmış" sayılmaz:

1. Truth matrix'te ilgili P0/P1 satırı **`runtime` veya `pilot-ready`** ve kanıtı **immutable**: exact `head_sha` + test yolu + CI run URL.
2. Faz 1b kapsamında **sıfır `planning-only` / sıfır `internal`** satır.
3. **Gerçek browser E2E**: `test/e2e/` altında en az bir uçtan uca journey spec'i; referans fixture dışında **iş sonucu SQL seed yok**; journey adımları **görünür UI kontrolleri** ile; `page.evaluate(fetch)` yok.
4. `npm run ci:sprint1` main'de yeşil; 6 zorunlu check + P0 E2E check'i **fail-closed**.
5. Prod: `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` tanımlı, `/api/v1/health` 200, login + P0 journey canlıda çalışır; audit yazımı doğrulanır.
6. Her P0 için **terminal rol verdict'i** (Architecture, Security, KVKK, Data, QA, Product, UX) exact head SHA'ya bağlı.
7. Rollback planı + post-merge observation kaydı (canary + hata oranı + geri dönüş provası).
8. Issue kapanışı, kabul kriterlerinin **tek tek** `fixed:<commit>` / `rejected:<counter-evidence>` ile eşlenmesiyle yapılır; "PR merge edildi" kapanış gerekçesi değildir.

---

## 3. Sprint takvimi (5 sprint + pilot observation)

Model: 2 haftalık sprintler, Pazartesi 10:00 TRT sync, HCO loop merge'i yönetir (varsayılan OFF).
Her sprint sonunda **exit gate**: DoD maddelerinden ilgili olanlar sağlanmadan sonraki sprint başlamaz.

| Sprint | Tarih | Paralel izlekler (track) | Exit gate |
|---|---|---|---|
| **S0 — Doğruluk ve karar haftası** | 22–25 Eyl 2026 | A: E2E altyapısı + yanlış-yeşil onarımı · B: matrix reconcile · C: governance kuyruğu (#352) · D: ortam (#332/#329) | Yanlış-yeşil check fail-closed; `test/e2e` harness main'de; matrix `43b6163`'e reconcile; #352 merge/rollback kararı yazılı; prod `/api/v1/health` 200 |
| **S1 — Güvenlik bağlamı + leave çekirdeği** | 28 Eyl – 9 Eki | A: #339 default-deny/context · B: #263-A (decision + impact kapısı) | #339 AC ≥ %80 + mimari enforcement testi; `LeaveImpactAnalysisNotReadyException` yolunda gerçek impact dönüyor |
| **S2 — Leave kapanışı + attendance kalanı** | 12–23 Eki | A: #263-B (coverage projection assign/clear + bakiye) · B: #265 kalan (locked-absence idempotent event + correction AC) | Leave journey tek senaryo yeşil; locked absence event idempotent; #265 AC-2/5/6/8 kanıtlı |
| **S3 — Notification + audit kapanışı** | 26 Eki – 6 Kas | A: #266-A (ParentContact/ContactPoint/Consent + maskeleme) · B: #259 kalan (retention + query API + redaction registry) | Consent/KVKK negatifleri yeşil; audit append-only zincir + sorgu API'si kanıtlı; PII sızıntı taraması temiz |
| **S4 — Notification outbox + UX durumları** | 9–20 Kas | A: #266-B (outbox + relay + locked-absence draft) · B: #264-A (loading/empty/error/conflict/offline durumları) | Outbox idempotency + dead-letter testleri yeşil; UI çekirdek akışlarda durum ekranlarına sahip |
| **S5 — Erişilebilirlik + Acceptance kapanışı** | 23 Kas – 4 Ara | A: #264-B (WCAG 2.2 AA, klavye/focus, responsive) · B: #269 (journey + negatifler + canary) · C: #268 quarantine + #258 final reconcile | `test/e2e` journey + negatif matris yeşil; axe kritik/ciddi = 0; truth matrix %100 `runtime`/`pilot-ready`; canary + rollback provası kayıtlı |
| **Pilot observation** | 7–18 Ara | Gerçek okul pilotu (2–3 okul), haftalık metrik, Go/No-Go | Pilot raporu + sign-off; Phase 2 epic #344 WS1 kapanışı |

**Toplam:** ~11 hafta (kod üretimi eşdeğeri ~4–6 hafta, kalanı governance/inceleme/ortam/observation).

---

## 4. PR dilim kuyruğu (slice queue)

Kurallar: **Tek PR = tek amaç**; her dilim ≤ ~1.500 satır net değişiklik hedefler (review kuyruğunu kısaltır).
Her dilim için branch adı, kapsam, bağımlılık, tahmini üretim ve rollback zorunludur.

| ID | Issue | Branch | Kapsam (tek cümle) | Bağımlılık | Tahmini satır | Rollback |
|---|---|---|---|---|---|---|
| **S0-A1** | yeni (#269 kapsamı) | `p0/e2e-harness-and-falsegreen-repair` | `test/e2e` jest+puppeteer harness + referans-fixture seeder + P0 E2E check'ini fail-closed yap (iş sonucu SQL seed ve `page.evaluate(fetch)` yasak taraması) | — | 1.200–1.800 | Workflow'u eski check adına döndür; harness `describe.skip` |
| **S0-A2** | yeni | `p0/legacy-e2e-script-quarantine` | `scripts/qa-p0-browser-e2e.js`'i "acceptance kanıtı değildir" olarak işaretle; SQL iş-sonucu seed bloğunu kaldır veya `E2E_LEGACY_SYNTHETIC=1` arkasına al | S0-A1 | 300–600 | Script revert |
| **S0-B1** | #258 | `p1b/truth-matrix-reconcile-43b6163` | Matrix'i `43b6163`'e reconcile et (#349 published-occurrence + #351 notes/Permissions kanıtları) | — | 200–400 | Docs revert |
| **S0-B2** | #258 | `p1b/issue-milestone-linkage-test` | Issue/PR/milestone bağlantısı otomatik doğrulama testi (`test/contracts/`) + milestone due-date zorunluluğu | S0-B1 | 200–400 | Testi devre dışı bırak |
| **S0-C1** | #259 | `p1b/352-merge-unblock` | PR #352 merge engelini çöz (review thread + approval); CI zaten yeşil | — | 0–200 | PR kapat, branch korunur |
| **S0-D1** | #332 | `ops/prod-auth-env-restore` | Prod `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` set + `/api/v1/health` 200 + login kanıtı (secret değeri loglanmaz) | — | 0 (konfig) | Env değişkenlerini kaldır |
| **S0-D2** | #329 | `ops/vercel-app-preview-repair` | Vercel GitHub App Git-source preview onarımı veya kayıtlı tek seferlik waiver | — | 0 (konfig) | Waiver kaydı |
| **S1-A1** | #339 | `p1b/security-context-default-deny` | Server-authoritative kurum/şube/rol/permission context + protected endpoint default-deny sözleşmesi | — | 1.500–2.200 | Guard'ı opt-in'e döndür |
| **S1-A2** | #339 | `p1b/controller-enforcement-arch-test` | Controller bazlı enforcement mimari testini zorunlu hale getir (`@Permissions`'sız protected controller fail) | S1-A1 | 300–600 | Test devre dışı |
| **S1-B1** | #263 | `p1b/leave-decision-impact-gate` | `decide()` impact kapısı: gerçek impact döner, `IMPACT_ANALYSIS_NOT_READY` yalnız gerçek durumda; durable audit + outbox atomik | — | 1.200–1.800 | Kararı eski exception yoluna döndür |
| **S2-A1** | #263 | `p1b/leave-coverage-projections` | Aday listesi + substitute assign/clear + stale/conflict (If-Match) + projection geçmişi | S1-B1 | 1.000–1.500 | Feature flag ile kapat |
| **S2-A2** | #263 | `p1b/leave-balance-accrual` | Bakiye tahakkuk/devir + bounded range/overlap + tenant/branch timezone | S2-A1 | 600–1.000 | Migration revert |
| **S2-B1** | #265 | `p1b/attendance-locked-absence-event` | Locked absence → idempotent domain event (outbox kaydı); draft/unlocked → event yok | S2-A1 (outbox) | 400–700 | Event emit'i kapat |
| **S2-B2** | #265 | `p1b/attendance-correction-ac8` | Correction reason + versioned record + terminal rol verdict'leri için kanıt paketi | S0-A1 | 300–600 | Correction akışını kilitle |
| **S3-A1** | #266 | `p1b/notification-consent-foundation` | ParentContact / ContactPoint / Consent (versioned, withdrawable) + şifreli ham veri + maskeli okuma | S1-A1 | 1.200–1.800 | Migration revert |
| **S3-A2** | #266 | `p1b/notification-sensitive-read-audit` | Hassas okuma denetimi + teacher'ın ham iletişim verisine erişememesi + redaction | S3-A1, S0-C1 | 400–700 | Audit kancasını kaldır |
| **S3-B1** | #259 | `p1b/audit-retention-query-api` | Retention politikası (varsayılan 7 yıl) + tenant/actor/action/tarih sorgu API'si + HMAC rotasyon | S0-C1 | 800–1.500 | API'yi read-only kapat |
| **S4-A1** | #266 | `p1b/notification-outbox-relay` | Transactional outbox + relay + bounded retry + dead-letter/manual recovery; `queued` ≠ `sent` | S2-B1 | 1.300–1.900 | Relay'i durdur (outbox birikir) |
| **S4-A2** | #266 | `p1b/notification-draft-kvkk` | Locked absence → redakte taslak + consent/template snapshot + idempotency key | S4-A1 | 700–1.200 | Taslak üretimini kapat |
| **S4-B1** | #264 | `p1b/ux-core-flow-states` | Role-aware nav + loading/empty/error/offline/conflict durumları; UUID/jargon sızıntısı yok | S1-A1 | 700–1.200 | Shell'i statik yedeğe döndür |
| **S5-A1** | #264 | `p1b/ux-a11y-wcag22` | Klavye/focus/duyuru + responsive (360–1440) + axe kritik/ciddi = 0 kanıtı | S4-B1 | 500–800 | A11y regresyon yoksa revert |
| **S5-B1** | #269 | `p1b/acceptance-freshdb-journey` | Fresh-DB uçtan uca journey: schedule publish → leave → approval → impact → assign/clear → attendance lock → notification draft | S0-A1, S2–S4 dilimleri | 1.500–2.500 | Journey'i nightly'ye al |
| **S5-B2** | #269 | `p1b/acceptance-negatives-canary` | Negatif matris (yetkisiz/çapraz tenant/stale/offline) + trace/video + synthetic canary + rollback provası | S5-B1 | 600–1.000 | Canary'yi kapat |
| **S5-C1** | #268 | `p1b/reports-eokul-quarantine` | `reports`/`eokul-sync` modüllerini runtime'dan çıkar, `planning-only` etiketle, startup fail yok | — | 200–400 | Module import'unu geri al |
| **S5-C2** | #258 | `p1b/truth-matrix-final` | Final reconcile: %100 `runtime`/`pilot-ready` + terminal verdict'ler + CI URL'leri | tümü | 200–400 | Docs revert |

**Toplam tahmini üretim:** ~11.000–16.000 satır (kod + test + migration + docs).
Üst senaryo: #268 için "tam implement" veya E2E için Playwright geçişi seçilirse **+3.000–5.000 satır** eklenir.

---

## 5. Kabul ve kanıt sözleşmesi (evidence contract)

Her dilim PR'ı aşağıdaki kanıt paketini üretir. Kanıt **exact head SHA**'ya bağlanır; "daha sonra doğrulandı" kabul edilmez.

| Kanıt | Zorunlu içerik |
|---|---|
| Kod | `head_sha`, diff özeti, dokunulan modüller |
| Test | Çalıştırılan komut + PASS/FAIL sayısı + yeni test yolu (ör. `test/e2e/leave-journey.e2e-spec.ts`) |
| CI | Her zorunlu check için run URL + `conclusion` |
| DB | `npm run db:migrate` fresh-DB çıktısı; migration varsa `db:migrate:revert` provası |
| Güvenlik | RBAC/BOLA negatifleri; tenant izolasyonu; redaction (PII yok) |
| KVKK | İşlenen kişisel veri, hukuki dayanak, saklama süresi, maskeleme kanıtı |
| Audit | Yazma yolunda transactional audit kaydı + correlation ID |
| Rollback | Geri alma adımı + provası (migration revert veya flag kapatma) |
| Verdict | Terminal rol verdict'leri (Architecture, Security, KVKK, Data, QA, Product, UX) exact SHA'ya bağlı |

**Yasak kanıtlar (fail-closed):** `env unreachable`, `404`, `skip`, `neutral`, `cancelled`, "synthetic/legacy script yeşil", maskesiz ekran görüntüsü, secret/telefon/e-posta içeren log.

---

## 6. Riskler ve mitigasyon

| # | Risk | Etki | Mitigasyon |
|---|---|---|---|
| R1 | Yanlış-yeşil acceptance (P0 E2E check'i iş sonucu SQL seed + `page.evaluate(fetch)` ile geçiyor) | Tüm "PASS" kanıtları güvenilmez | S0-A1: check'i fail-closed yap; S0-A2: legacy script'i acceptance dışına çıkar; SQL INSERT deseni + `page.evaluate`+`fetch` CI'da statik tarama ile fail |
| R2 | Governance/inceleme kuyruğu (#352 blocked; #346 geçmişi) | Kod hazır olsa da merge gecikir | Sprint başına ≤1 dilim merge'e hazır tut; review thread'leri merge'den önce kapat; "resolved thread ≠ fix" kuralı |
| R3 | Kritik yol #263 → #266 → #269 | Domino gecikme | #263 S1'de başlar; #266 outbox tasarımı S2'de planlanır; #269 harness'ı S0'da kurulur |
| R4 | Ortam/PROD kilidi (#332, #329) | Pilot journey canlıda çalışmaz | Sprint 0 exit gate'ine zorunlu madde |
| R5 | Matrix ve #344/#345 checklist'lerinin gerçekle çelişmesi (#260 "NOT STARTED" ama `runtime`; #263 "blocked by #160" ama #160 kapalı) | Yanlış önceliklendirme | S0-B1/B2: reconcile + otomatik bağlantı testi; issue gövdeleri tek kaynaktan (matrix) türetilir |
| R6 | Aşırı geniş PR'lar (#352: 47 dosya / +4.786) | Review kuyruğu tıkanır | Dilim boyutu sınırı (~1.500 satır) |
| R7 | E2E teknolojisi kararsızlığı (playwright yok; puppeteer-core + sparticuz var) | Altyapıyı yeniden yazma maliyeti | Karar: mevcut `puppeteer-core` + `test/jest-e2e.json`; axe-core yalnız devDependency (gerekçe PR'da) |
| R8 | #268 kapsam kayması (quarantine → tam implement) | Takvim ~%30 şişer | Karar: **quarantine**; "implement" ayrı epic |
| R9 | Faz 1b kapanışının Phase-2 epic altında izlenmesi (#344/#345) | Sahiplik/öncelik belirsizliği | Faz 1b için ayrı milestone + due date; tek doğruluk kaynağı matrix olur |
| R10 | Admin bypass / fake-green cazibesi | Governance erozyonu | Bypass yalnız repo sahibi onaylı ve `docs/devops/emergency-bypass-log-template.md` ile kayıtlı; bypass kanıtı acceptance sayılmaz |

---

## 7. İzleme metrikleri (KPI)

| Metrik | Bugün | Faz 1b kapanış hedefi |
|---|---|---|
| Truth matrix `runtime`+`pilot-ready` oranı | 7/13 (~%54) | 13/13 (%100) |
| `test/e2e` spec sayısı | 0 | ≥ 3 (journey + 2 negatif) |
| Açık `p0` issue | 5 | 0 |
| Zorunlu check sayısı (fail-closed) | 10 kayıtlı + P0 E2E | 11, hepsi gerçek doğrulama yapıyor |
| PR ortalama boyutu | ~1.900 satır (son 10 PR) | ≤ 1.500 satır |
| PR açılış → merge süresi | CI yeşilse ~1–2 gün; governance'ta bekleyen var | ≤ 3 gün |
| Prod `/api/v1/health` | 500 | 200 |
| PII/secret sızıntı bulgusu | 0 | 0 (regresyon dahil) |
| Pilot okul sayısı | 0 | 2–3 (canlı, DPA imzalı) |

---

## 8. Canlıya geçiş (go-live) kontrol listesi

**Teknik (Sprint 0 + S5 sonu)**
- [ ] Prod env: `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `NODE_ENV=production` (secret'lar GitHub/log/PR'a girmez)
- [ ] `/api/v1/health` 200 ve `databaseRequired: true` yanıtı kanıtlı
- [ ] Fresh-DB migration temiz; mevcut veri ile upgrade yolu provası yapıldı
- [ ] Yedek/geri yükleme provası (RPO < 1 saat, RTO < 4 saat hedefi)
- [ ] Rollback provası: son N migration revert + flag kapatma senaryosu
- [ ] Observability: yapılandırılmış log + correlation ID; SLO tabanlı alarm (hata oranı, latency, DB bağlantı)

**KVKK / hukuk**
- [ ] Aydınlatma + açık rıza akışı; consent versioning ve geri çekme çalışıyor
- [ ] Ham kişisel veri şifreli; okuma maskeli ve denetim kaydı üretiyor
- [ ] DSR (erişim/düzeltme/silme/taşınabilirlik) prosedürü tanımlı
- [ ] İhlal bildirimi (72 saat) prosedürü ve sorumluları yazılı
- [ ] DPA/MSA pilot sözleşmesi imzalı

**Kabul**
- [ ] `test/e2e` journey main'de zorunlu ve yeşil; kanıt exact SHA'ya bağlı
- [ ] Truth matrix %100 `runtime`/`pilot-ready`; `planning-only`/`internal` sıfır
- [ ] Tüm P0/P1 için terminal rol verdict'i mevcut
- [ ] Post-merge observation 5 iş günü hatasız; synthetic canary çalışıyor
- [ ] Pilot okullarda haftalık metrik + Go/No-Go toplantı kaydı

---

## 9. Sahip (owner) kararı bekleyen açık sorular

| # | Karar | Öneri | Etki |
|---|---|---|---|
| K1 | #268: quarantine mı, tam implement mı? | **Quarantine** | Takvim ~%30 kısalır |
| K2 | E2E teknolojisi: mevcut `puppeteer-core` mı, Playwright mı? | **puppeteer-core + jest-e2e** | Yeni bağımlılık/CI sürtünmesi yok |
| K3 | Frontend: bu repo içinde mi, ayrı repo mu (WS2)? | Faz 1b boyunca **bu repo**; ayrı repo Faz 2 kararı | Sınır testleri tek yerde kalır |
| K4 | Pilot okul sayısı ve tarihi | 2–3 okul; observation 7–18 Aralık | Kabul kanıtı + KVKK kapsamı |
| K5 | Büyük PR'lar bölünecek mi (#352 tipi)? | **Evet**, dilimler ≤1.500 satır | Review kuyruğu açılır |
| K6 | Auto-merge aktivasyonu | **Kapalı kalır** (varsayılan OFF, fail-closed) | Governance güvenliği korunur |

---

## 10. Sprint 0 için hazır issue komutları

```bash
# S0-A1 (+S0-A2): E2E altyapısı ve yanlış-yeşil onarımı
gh issue create --title "[P1B][ACCEPTANCE] test/e2e harness ve P0 browser E2E check'ini fail-closed yap" \
  --label "p0,qa-kvkk-required,acceptance-evidence" --body-file artifacts/s0a1-body.md

# S0-C1: PR #352 merge engeli kaydı
gh issue comment 259 --body "S0-C1: PR #352 merge engeli (review thread + approval) bu sprintte çözülecek. Kanıt: exact head SHA + required check URL'leri."

# Milestone hijyeni (kapanmış ama open kalanlar)
gh api --method PATCH repos/sisbas/OkulYonetimSaaS/milestones/3 -f state=closed   # M2
gh api --method PATCH repos/sisbas/OkulYonetimSaaS/milestones/4 -f state=closed   # M3
# Açık milestone'lara sprint çıkışı due date:
gh api --method PATCH repos/sisbas/OkulYonetimSaaS/milestones/7 -f due_on=2026-12-04T00:00:00Z  # M7
```

> Not: `--body-file` içerikleri ve milestone numaraları issue açılmadan önce repo sahibi tarafından onaylanır.
> Issue/kapatma akışında `docs/agents/issue-tracker.md` konvansiyonları geçerlidir.

---

## Sürüm

| Alan | Değer |
|---|---|
| Plan sürümü | v1.0 |
| Yayın tarihi | 2026-09-22 |
| Baz main HEAD | `43b616363a5d1d1d4cab5057e666f4e7ae3a2c1e` |
| Sonraki gözden geçirme | Her sprint çıkışında (matrix reconcile ile birlikte) |
| Yürütme aracı | `docs/phase2/master-prompt.md` (HCO loop: PLAN_CONSULTATION → ... → POST_MERGE_OBSERVATION) |
