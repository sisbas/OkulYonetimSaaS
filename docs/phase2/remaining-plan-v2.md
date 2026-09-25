# Faz 1b — Kalan İş Planı (v2)

**Tarih:** 2026-09-23 · **Baz main HEAD:** `15c5ab8d44f21b3165cf50658fadbc42b4bd68ae` (main son merge 2026-09-23 12:29 +03)
**Yerel worktree (bu belge):** `cline/f6dc1` @ `961b83c` — üretim yapılacaksa `origin/main` bazlı **yeni** worktree/branch açılır.
**Kanıt kaynakları:** `docs/phase1-truth-matrix.md` (main), `docs/acceptance/265-terminal-verdicts.md`, `docs/notifications/absence-outbox.md`, `docs/security/audit-retention-and-checkpoints.md`, `docs/agents/repo-operations.md`, GitHub issue/PR/milestone API, CI run listesi.
**Yürütme aracı:** `docs/phase2/master-prompt-v2.md` (orkestratör + ajan brifleri).

---

## 1. Aşama tespiti (2026-09-23, main `15c5ab8`)

### 1.1 v1 planından bu yana kapanan işler (4 merge)

| Merge | PR | Ne teslim edildi | v1'deki dilim |
|---|---|---|---|
| `e823ebd` | #353 | `test/e2e/` gerçek harness (fresh DB + gerçek backend + gerçek tarayıcı, 8/8 senaryo PASS) + `test/acceptance-guard/` fail-closed statik guard (R1 SQL iş-sonucu yazımı, R3 `page.evaluate` ağ isteği, R4 DOM yazımı, P1 legacy susturma) + workflow'un bu yola bağlanması | **S0-A1, S0-A2 ✓** |
| `c64d0a1` | #352 | Tamper-evident audit zinciri (seq/prev_hash/entry_hash/HMAC + checkpoints), retention politikası/servisi, audit query servisi + controller, attendance audit adapter'ı, **locked absence → notification outbox** (transactional, idempotent, consent kapılı), KVKK eligibility/redaction guard'ları, `1827*`–`1829*` migration'lar | **S0-C1 ✓, S2-B1 ✓**, #259 büyük ölçüde, #266 ilk yarısı |
| `3b75acc` | #355 | Attendance correction concurrency spec'i non-acceptance yüzeyi olarak guard'a kaydetme | (guard hijyeni) |
| `15c5ab8` | #354 | Truth matrix reconcile (`e823ebd`) + `artifacts/s0b1/pr-body.md` | **S0-B1 ✓** |

Ek olarak main'de zaten mevcut: `app.module.ts` içinde `ENABLE_EOKUL_SYNC` / `ENABLE_REPORTS` env kapılarıyla **quarantine** (varsayılan OFF) → #268'in teknik yarısı büyük ölçüde yapıldı.

### 1.2 Ölçümler

| Metrik | Değer |
|---|---|
| Açık PR | **0** (governance kuyruğu boş — en iyi durum) |
| Açık issue | 15 (9'u Faz 1b), 5'i `p0` |
| Migration | **36** |
| `test/e2e` | 1 journey spec + 8 support modülü (yalnız auth/shell/fixture sözleşmesi) |
| `test/acceptance-guard` | 1 spec, 11 fail-closed test |
| main CI | 6/6 zorunlu workflow `success` (`15c5ab8`) |
| Truth matrix | Attendance `internal`; notification/reporting `planning-only`; UX/E2E kısmi |
| Yerel ortam | Node 22.23.1 · npm 10.9.8 · Python 3.13.14 · **PostgreSQL 5432 KAPALI** · **node_modules YOK** · disk 58 GB boş |

**Aşama:** Faz 1b'nin **son üçte biri**. Kod üretiminin en büyük parçası (audit + attendance + kabul altyapısı) bitti; kalan iş **iki P0 iş kolu (#263 leave onay/coverage, #339 server-authoritative context) + notification'ın ikinci yarısı + UX/erişilebilirlik + journey'in tamamı**.

---

## 2. Kalan iş envanteri (issue → kalan AC)

| Issue | Sınıf | Kalan iş (koda dönük) | Kanıt eksikliği |
|---|---|---|---|
| **#263** LEAVE-OPS (M4, P0) | `runtime` (kısmi) | `LeaveService.decide()` hâlâ **koşulsuz** `LeaveImpactAnalysisNotReadyException` atıyor (`src/leaves/leave.service.ts:121`) → gerçek impact analizi, onay/red state machine, açık projeksiyon + durable audit + outbox aynı transaction'da, aday listesi + substitute assign/clear (If-Match), bakiye tahakkuk/devir, timezone/overlap | UI-driven test yok; impact/coverage E2E yok |
| **#339** SECURITY-CONTEXT (M0, P0) | `internal` | Server-authoritative request context (kurum/şube/rol/permission), **protected endpoint default-deny sözleşmesi**, versioned context/catalog endpoint'i (okunabilir kurum/şube adları), role/permission resolution + cache invalidation, non-enumerating hata sözleşmesi | Config/tenant guard testleri var; catalog/default-deny negatifleri yok |
| **#266** NOTIFICATION (M6, P0) | karma: enqueue **var**, consent/relay **yok** | (a) granüler + versioned + withdrawable consent modeli, (b) **relay/dispatch worker** (`pending` → gönderim, `sent`/`failed` audit, bounded retry + dead-letter), (c) düzeltme/iptalde kuyruk iptali, (d) journey için bildirim **taslak** yüzeyi, (e) retention/arşiv | Consent yaşam döngüsü testleri, relay/concurrency, UI kanıtı yok |
| **#269** ACCEPTANCE (M7, P0) | `internal` (harness var) | Journey'in **tamamı**: schedule publish → leave request → approval → impact → candidate assign/clear → attendance lock → notification draft; negatif matris (yetkisiz/cross-tenant/stale/offline/expired); trace+video artefaktları; synthetic canary + rollback provası | Yalnız auth/shell/fixture sözleşmesi kanıtlı (8 senaryo) |
| **#264** UX (M7) | `internal` | Çekirdek akışlar için loading/empty/error/offline/conflict durumları; klavye/focus/duyuru; responsive 360–1440; **WCAG 2.1/2.2 AA** kanıtı; ham ID/jargon sızıntısı denetimi | Erişilebilirlik taraması + E2E kanıtı yok |
| **#265** ATTENDANCE (M5, P0) | `internal` | Kod tarafı büyük ölçüde bitti (#346/#348/#349/#351/#352). Kalan: **terminal verdict'lerin yeniden bağlanması** + AC-8 kapanışı (#266 ve #269'a bağlı) | Verdict dokümanı `c30a5a8`'e bağlı; yeni head'de yeniden bağlanmalı |
| **#259** SECURITY/AUDIT (M0, P0) | `runtime` (kısmi) | #352 ile zincir/retention/query/controller geldi. Kalan: AC kanıt eşlemesi (rotasyon/key-id sözleşmesi, tüm hassas kararlarda durable audit), kalan business path'lerinin audit kapsamı, issue AC kapanışı | AC-bazlı kanıt yorumu |
| **#268** REPORTING (M7, P1) | `planning-only` | Quarantine env kapıları mevcut; kalan: modüllerin `planning-only` **etiketlenmesi**, boş-tablo fallback'inin kapatılması kanıtı, export güvenliği (formula injection/cross-tenant/hassas alan), matrix + docs | Export/DB testi yok |
| **#258** TRUTH (M0, P1) | `runtime` (docs) | Matrix **`15c5ab8`'e** reconcile (şu an `e823ebd`; ayrıca "PR #352 açık" ifadesi artık yanlış), issue/PR/milestone otomatik bağlantı testi, milestone due-date + M2/M3 kapatma | Otomatik linkage testi yok |
| **#260** HCO (M0, P1) | `runtime` | Kanıt: PR #326 + `hco/` + `tests/hco`; kalan: issue'nun AC-bazlı kapanış yorumu (v1'deki "NOT STARTED" ifadesi bayat) | Issue kapanış kanıtı |
| **#329 / #332** (devops, P0/bug) | — | **İnsan işi** (Vercel dashboard/env) | — |

Doküman/izleme boşlukları: M2 ve M3 milestone'ları 0 açık issue'ya rağmen `open`; hiçbir milestone'da `due_on` yok; Faz 1b kapanışı Phase-2 epic'i (#344/#345) altında izleniyor ve o checklist'ler yer yer bayat (#260 "NOT STARTED" iddiası gibi).

---

## 3. Fizibilite analizi

### 3.1 Ajanların yapabildikleri (yüksek güven)

| Yetenek | Durum |
|---|---|
| Kod + migration + test üretimi (TypeORM/Nest/Jest) | ✔ (kanıt: #346–#355) |
| Gerçek backend + gerçek tarayıcı harness'ı genişletme | ✔ (`test/e2e/support/*` mevcut) |
| Fail-closed statik guard'a yeni kural ekleme | ✔ (`test/acceptance-guard/`) |
| PR açma, CI run izleme, kanıt dosyası üretme | ✔ (`gh` token: `repo`, `workflow`) |
| Mutasyon kontrolü + red-team doğrulaması | ✔ (ayrı doğrulayıcı ajan) |

### 3.2 Yerel ortam kısıtları (planlamayı doğrudan etkiler)

1. **PostgreSQL yok** (`localhost:5432` kapalı, servis yok) → DB'ye bağlı suite'ler yerelde **skip** olur. Gerçek PostgreSQL kanıtı **yalnız CI'da** alınır (`DB Smoke`, `test:database:required`, P0 E2E workflow'unun `postgres:16` servisi).
2. **node_modules yok** → her ajan kendi worktree'sinde `npm ci` çalıştırır (arka planda; komut zaman aşımı ~30 sn olduğu için `Start-Process` + çıktı dosyası — bkz. `docs/agents/repo-operations.md` §3, §5).
3. **CI turu kritik yolun parçası**: yerel doğrulama (tsc + unit/rbac/kvkk/contracts + build) yeterli değil; DB ve tarayıcı kanıtı PR üzerinde CI'da üretilir (~5–10 dk). Bu yüzden **paralel ajan sayısı > 4** olduğunda CI kuyruğu darboğaz olur.
4. **Windows mojibake tuzağı**: dosya yazımı editör aracıyla veya Node `fs.writeFileSync(...,'utf8')` ile; PowerShell `Set-Content` kullanılmaz (repo-operations §2).
5. **`docs/*` ve `src/database/migrations` `.gitignore` kapsamında** → yeni dosyalar `git add -f` (repo-operations §4). `docs/agents/**` ve (bu çalışma için eklenen) `docs/phase2/**` muaf.

### 3.3 İnsan gerektiren işler (ajan yapamaz)

| # | İş | Neden insan |
|---|---|---|
| H1 | Prod `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` + `AUDIT_HMAC_KEY` kurulumu ve `/api/v1/health` 200 doğrulaması (#332) | Secret değeri PR/log/artefakta yazılamaz; ajan yalnız değişken ADLARINI dokümante edebilir |
| H2 | Vercel GitHub App Git-source preview onarımı / kayıtlı waiver (#329) | Repo dışı dashboard işlemi |
| H3 | PR **review onayı** ve merge butonu | GitHub kendi kendine approval'a izin vermez; branch protection gereği ikinci aktör gerekir |
| H4 | Pilot okullarla MSA/DPA imzası, gerçek veriyle pilot gözlemi, Go/No-Go | Hukuki/operasyonel; ajan simüle edemez |
| H5 | DPO/KVKK sign-off, DPIA, ihlal prosedürü onayı | Hukuki sorumluluk |
| H6 | Auto-merge / ruleset / bypass kararları | Governance; varsayılan OFF kalır |

### 3.4 Fizibilite yargısı

- **Teknik olarak bitirilebilir:** kalan kod işinin ~%90'ı ajan tarafından üretilebilir; kalan %10 ortam/governance/hukuk.
- **Tahmini üretim:** **~10.000–15.000 satır** (kod + test + migration + docs) — v1 tahmininden düşük, çünkü #352+#353 ~7.000 satırlık işi tüketti.
- **Süre:** 5–7 paralel ajan ile **~6–8 hafta** (feedback: CI + review kuyrukları). Sıralı tek ajanla **~9–12 hafta**.
- **En büyük takvim riski kod değil:** H3 (review/merge) ve CI tur süresi. Bu yüzden plan, ajanları **küçük ve bağımsız PR dilimlerine** böler ve her dilimi "CI yeşil + kanıt" ile kapatır.

---

## 4. Kalan plan — 3 faz

| Faz | Süre | İçerik | Çıkış kapısı |
|---|---|---|---|
| **F1 — Çekirdek backend** | Hafta 1–3 | R1–R3 (#263 leave zinciri), R4 (#339 context/default-deny), R5–R6 (#266 consent + relay) | `LeaveImpactAnalysisNotReadyException` yolu gerçek impact döndürüyor; default-deny negatifleri yeşil; consent/relay concurrency testleri yeşil; DB Smoke yeşil |
| **F2 — Yüzey ve kabul** | Hafta 3–6 | R7 (#266 taslak yüzeyi), R8–R9 (#264 UX/a11y), R10–R11 (#269 journey + negatifler) | Journey'in tamamı fresh DB'de gerçek UI ile PASS; axe kritik/ciddi = 0; negatif matris yeşil |
| **F3 — Kapanış ve canlı** | Hafta 6–8 | R12–R15 (#268, #259, #258, #265 verdict), H1–H5 (insan), pilot gözlemi | Truth matrix %100 `runtime`/`pilot-ready`; prod `/api/v1/health` 200; pilot raporu + Go/No-Go |

Paralel izlekler: **A1 (leave)** ile **A2 (security-context)** bağımsızdır → F1'de eşzamanlı yürür. **A3 (notification)** R5–R7 zincirinde sıralıdır. **A4 (acceptance)** F1 boyunca harness'ı genişletir (R10'un ön işi), F2'de journey'i bağlar. **A5 (UX)** R7 biter bitmez a11y/durum işine girer.

---

## 5. Dilim kuyruğu v2 (R1–R15)

Kurallar: tek PR = tek amaç · dilim ≤ ~1.500 satır · her dilimde migration sırası korunur · üretim alanı sahipliği §7'deki matrise uyar.

| ID | Issue | Sahip ajan | Branch | İş | Tahmini satır | Bağımlılık |
|---|---|---|---|---|---|---|
| **R1** | #263 | A1 | `p1b/leave-decision-impact-gate` | `decide()` gerçek impact döndürür; onay/red + impact + audit + outbox **tek transaction**; If-Match/version (`LEAVE_VERSION_REQUIRED/MISMATCH`); okunabilir adlar | 1.200–1.800 | — |
| **R2** | #263 | A1 | `p1b/leave-coverage-projections` | Aday listesi (sunucu hesaplı) + substitute assign/clear + stale/conflict recovery + projeksiyon geçmişi | 1.000–1.500 | R1 |
| **R3** | #263 | A1 | `p1b/leave-balance-timezone` | Bakiye tahakkuk/devir + bounded range/overlap + tenant/branch timezone | 600–1.000 | R2 |
| **R4** | #339 | A2 | `p1b/security-context-default-deny` | `RequestContext` genişletme (kurum/şube/rol/permission) + default-deny sözleşmesi + versioned context/catalog endpoint'i + non-enumerating hatalar + negatif testler | 1.500–2.200 | — |
| **R5** | #266 | A3 | `p1b/notification-consent-versioned` | Granüler + versioned + withdrawable consent modeli (migration) + hassas okuma audit'i + teacher'ın ham iletişime erişememesi | 900–1.400 | — |
| **R6** | #266 | A3 | `p1b/notification-outbox-relay` | Relay/dispatch worker (`pending`→gönderim, `sent`/`failed` audit, bounded retry, dead-letter, `queued≠sent`) + düzeltmede kuyruk iptali + retention/arşiv | 900–1.500 | R5 |
| **R7** | #266 | A3+A5 | `p1b/notification-draft-surface` | Locked absence → redakte **taslak** API + UI yüzeyi (journey'in 7. adımı) + consent/template snapshot | 500–900 | R6 |
| **R8** | #264 | A5 | `p1b/ux-core-flow-states` | Role-aware nav + loading/empty/error/offline/conflict durumları; UUID/jargon sızıntı denetimi | 700–1.200 | R4 |
| **R9** | #264 | A5 | `p1b/ux-a11y-wcag22` | Klavye/focus/duyuru + responsive (360–1440) + axe kritik/ciddi = 0 kanıtı | 500–900 | R8 |
| **R10** | #269 | A4 | `p1b/acceptance-freshdb-journey` | Journey'in tamamı (publish → leave → approval → impact → assign/clear → attendance lock → notification draft), yalnız referans fixture, gerçek UI | 900–1.500 | R1–R3, R6–R7 |
| **R11** | #269 | A4 | `p1b/acceptance-negatives-canary` | Negatif matris + trace/video + synthetic canary + rollback provası | 600–1.000 | R10 |
| **R12** | #268 | A6 | `p1b/reports-eokul-quarantine-final` | `planning-only` etiketleme, boş-tablo fallback'inin kapalı olduğunun kanıtı, export güvenliği testleri, matrix satırı | 200–400 | — |
| **R13** | #259 | A6 | `p1b/audit-ac-evidence` | Audit AC kanıt eşlemesi (rotasyon/key-id, tüm hassas kararlar), kalan path'lerin audit kapsamı | 200–500 | — |
| **R14** | #258 | A6 | `p1b/truth-matrix-15c5ab8` | Matrix reconcile (`15c5ab8`) + "#352 açık" ifadesinin düzeltilmesi + issue/PR/milestone linkage testi + milestone hijyeni | 200–400 | — |
| **R15** | #265 | A6 | `p1b/attendance-verdicts-rebind` | Terminal verdict'lerin yeni head'e yeniden bağlanması + AC-8 kapanışı + #260 HCO kanıt yorumu | 200–400 | R10, R12 |

**Toplam:** ~10.000–15.100 satır.

---

## 6. Kritik yol

```text
R4 (context/default-deny) ──┐
R1 → R2 → R3 (leave) ───────┼─→ R10 (journey) → R11 (negatif/canary) ─→ R15 (verdict) ─→ F3 kapı
R5 → R6 → R7 (notification) ┘
R12, R13, R14 (docs/quarantine/audit) — paralel, kapıyı besler
R8 → R9 (UX/a11y) — R7 ile birleşip R10'un UI kanıtına girer
H1/H2 (ortam) — F1 başında, kod beklemeden
H3 (review/merge) — her PR'da seri; H4/H5 — F3'te
```

**Darboğazlar:** (1) H3 review/merge; (2) CI turu (DB Smoke + P0 E2E); (3) R10'un R1–R3 + R6–R7'ye bağımlılığı. Bu yüzden R10 altyapısı (fixture/journey iskeleti) erken başlar, senaryo adımları ilgili dilim merge edildikçe açılır.

---

## 7. Dosya sahipliği matrisi (çakışma önleme)

| Alan | Sahip | Kural |
|---|---|---|
| `src/leaves/**`, `src/daily-operations/**` (coverage/impact) | A1 | A1 tek yazar; A2/A3 bu dizinlere dokunmaz |
| `src/common/context/**`, `src/common/guards/**`, `src/common/tenant/**`, `src/rbac/**` | A2 | A2 tek yazar |
| `src/notifications/**`, `src/kvkk/**`, `src/common/audit/**` | A3 | A3 tek yazar |
| `src/attendance/**` | A3 (outbox/relay temasları) + A4 (yalnız test) | Yeni üretim kodu A3; A4 yalnız `test/**` |
| `test/e2e/**`, `test/acceptance-guard/**`, `.github/workflows/wp07f-*.yml` | A4 | A4 tek yazar |
| `frontend/**`, `test/frontend-runtime/**` | A5 | A5 tek yazar (build artefaktı `frontend/runtime/` dahil) |
| `docs/**`, `artifacts/**`, `.gitignore`, `README.md` | A6 | A6 tek yazar; üreten ajan yalnız `artifacts/<kendi-slice>/**` yazar |
| `src/app.module.ts`, `package.json`, `src/database/data-source.ts` | **Orkestratör** | Değişiklik talebi PR yorumuyla; orkestratör tek yazar (merge çakışmasını önler) |
| `src/database/migrations/**` | Dilim sahibi | Timestamp sırası + idempotentlik; aynı anda iki ajan **farklı** timestamp bloğu kullanır (A1: 1830*, A3: 1835*, A2: 1840*) |

Kural: Aynı dosyada iki ajanın değişikliği gerekiyorsa **orkestratör** hangi ajanın yazacağını belirler ve diğerini o dilime kadar bekletir.

---

## 8. Riskler (güncel)

| # | Risk | Etki | Mitigasyon |
|---|---|---|---|
| R1 | Yerel PostgreSQL yok → DB kanıtı yalnız CI'da | Yerel "yeşil" yanılsaması; yavaş geri bildirim | DB'ye bağlı suite'ler yerelde skip; kanıt için PR + DB Smoke run URL'i zorunlu |
| R2 | Review/merge kuyruğu (H3) | Sprint çıkışı kayar | Dilim başına ≤1.500 satır; PR açıldıktan sonra ajan beklemez, sonraki dilimi **başka branch'te** hazırlar |
| R3 | R10'un çoklu bağımlılığı | Kabul işi geç kalır | Journey iskeleti + fixture genişletmesi F1'de başlar; adımlar merge oldukça açılır |
| R4 | Consent modeli kapsam kayması (#266) | Süre uzar | Yalnız consent+relay+taslak; gerçek SMS/e-posta sağlayıcısı **kapsam dışı** (sahte provider + dispatch audit yeterli) |
| R5 | UX çalışmasının "sonsuz cila"ya dönüşmesi | Takvim sarkması | R8/R9 yalnız üç ölçüte bağlı: durum ekranları, klavye/focus, axe=0 |
| R6 | Matrix/doküman sapması (v1'de yaşandı) | Yanlış önceliklendirme | Her merge sonrası A6 matrix'i reconcile eder; R14 otomatik linkage testini ekler |
| R7 | Windows mojibake / `git add -f` unutulması | Sessiz kayıp, CI kırmızısı | `docs/agents/repo-operations.md` §2 ve §4 zorunlu okuma |
| R8 | Ajanların ortak dosyalarda çakışması | Merge çatışması, geri alma maliyeti | §7 sahiplik matrisi + orkestratör tek yazar kuralı |
| R9 | Auto-merge/baypas cazibesi | Governance erozyonu | Auto-merge OFF; bypass yalnız kayıtlı emergency şablonuyla ve insan onayıyla |

---

## 9. KPI (v2)

| Metrik | Bugün | Kapanış hedefi |
|---|---|---|
| Truth matrix `runtime`+`pilot-ready` | 7/13 (~%54) | 13/13 |
| Attendance satırı | `internal` | `runtime` (verdict'ler yeni head'e bağlı) |
| Notification satırı | `planning-only` | `runtime` (consent+relay+taslak kanıtlı) |
| `test/e2e` senaryo | 8 (auth/shell) | ≥ 20 (journey + negatif matris) |
| Açık `p0` issue | 5 | 0 |
| Milestone due date | 0/8 | 8/8 (planlanan kapanış tarihleriyle) |
| Prod `/api/v1/health` | 500 | 200 |
| Dilim boyutu | — | ≤ 1.500 satır |
| PR açılış→merge | — | ≤ 3 gün |

---

## 10. İnsan iş listesi (kontrol listesi)

- [ ] **H1** Prod env: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `AUDIT_HMAC_KEY`, `DATABASE_URL` (değerler yalnız ortamda) → `/api/v1/health` 200
- [ ] **H2** Vercel GitHub App preview onarımı veya kayıtlı waiver (#329)
- [ ] **H3** Her PR için ikinci aktör review + merge (branch protection: 1 approval, conversation resolution)
- [ ] **H4** Pilot okullar: 2–3 okul, MSA/DPA imzası, haftalık metrik, Go/No-Go
- [ ] **H5** DPO/KVKK: consent modeli onayı, DPIA v1, ihlal prosedürü
- [ ] **H6** Milestone hijyeni onayı: M2/M3 kapatma, M4–M7 due date, Faz 1b için ayrı milestone
- [ ] **H7** Pilot öncesi: yedek/geri yükleme provası (RPO<1s, RTO<4s), rollback provası, SLO alarmı

---

## 11. Owner kararları (yürütmeyi bloklar)

| # | Karar | Öneri |
|---|---|---|
| K1 | #268: quarantine (mevcut env kapıları) yeterli mi, yoksa kod tamamen mi çıkarılsın? | Env kapıları + `planning-only` etiket + export güvenlik testi (mevcut hâl) |
| K2 | #266 relay provider'ı: gerçek sağlayıcı mı, sahte/kuyruk mu? | Faz 1b için **sahte provider + dispatch audit**; gerçek entegrasyon Faz 2 |
| K3 | UX yüzeyi bu repo'da mı kalıyor? | Evet (Faz 1b), ayrı frontend repo Faz 2 |
| K4 | Ajan paralelliği | 5 üretici + 1 orkestratör + 1 doğrulayıcı |
| K5 | Pilot tarihi | F3 sonu (yaklaşık 8 hafta) |

---

## Sürüm

| Alan | Değer |
|---|---|
| Sürüm | v2.0 |
| Tarih | 2026-09-23 |
| Baz main HEAD | `15c5ab8d44f21b3165cf50658fadbc42b4bd68ae` |
| Önceki sürüm | `next-phase-plan.md` v1.0 (main `43b6163` bazlı, bayat) |
| Yürütme | `docs/phase2/master-prompt-v2.md` |
