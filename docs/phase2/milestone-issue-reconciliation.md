# Milestone ve Issue Mutabakatı — 2026-09-27 (main `58bad0e`)

**Amaç:** Faz 1b kapanışı için issue/milestone durumunu kanıtla kayda geçirmek ve **H6 (milestone hijyeni)**
karar paketini hazırlamak. **Uygulama insan onayına bağlıdır** (plan §9/H6: ajan öneriyi ve komutları hazırlar).

**Review düzeltmesi (2026-09-29):** kaynak main
`9bd8d5dc333cdfe575e2500ff6e2828673edcc84`. Aşağıdaki 2026-09-27 sayıları tarihsel
snapshot'tır, güncel toplam değildir (2026-09-29 API: 19 açık issue). Milestone API
aynı gün 8 mevcut milestone için `due_on=null`, M2/M3 için `open` / 0 açık issue doğruladı.
Bu belge issue kapatma veya milestone değişikliği uygulamaz; H6 owner onayı bekler.

## 1. Sayısal anlık görüntü (GitHub API, 2026-09-27)

| Metrik | Değer | Kaynak |
|---|---|---|
| Toplam issue | **154** | `search/issues?is:issue` |
| Kapalı issue | **137** | `search/issues?is:issue+is:closed` |
| **Açık issue** | **17** | fark |
| Açık **P0** | **6** | `search/issues?is:issue+is:open+label:p0` |
| Açık **milestone'sız** | **7** | `search/issues?is:issue+is:open+no:milestone` |
| Açık PR | **1** (#364, docs) | `gh pr list --state open` |

## 2. Milestone tablosu

| # | Milestone | Durum | Açık | Kapalı | `due_on` | Not |
|---|---|---|---|---|---|---|
| 1 | M0 | open | 4 | 9 | **yok** | 339, 260, 259, 258 |
| 2 | M1 | closed | 0 | 1 | yok | — |
| 3 | M2 | **open** | **0** | 2 | yok | **kapatılabilir** (açık issue yok) |
| 4 | M3 | **open** | **0** | 5 | yok | **kapatılabilir** (açık issue yok) |
| 5 | M4 | open | 1 | 1 | **yok** | 263 (leave — R1 merge, R2/R3 açık; v2 F1 bitimi ≈ 10-14) |
| 6 | M5 | open | 1 | 1 | **yok** | 265 (attendance — verdict R15 F3'e bağlı; öneri 2026-11-18) |
| 7 | M6 | open | 1 | 2 | **yok** | 266 (notification — R5 branch merge edilmedi; R7 F2'de) |
| 8 | M7 | open | 3 | 1 | **yok** | 268, 269, 264; #264/#269 F2, **#268 R12 F3**; owner onayına sunulan tarih 2026-11-18 (§5.2) |

**Kritik bulgu:** 8 milestone'un **hiçbirinde `due_on` yok** (plan KPI hedefi: 8/8) ve **M2/M3 sıfır açık issue'ya rağmen `open`**.

## 3. Açık issue'ların milestone dağılımı

| Milestone | Issue'lar |
|---|---|
| **MILESTONE-YOK (7)** | 362 (branch selection), **358** (checkpoint imzası, P0), **345** (WS1 Phase 1b closure), **344** (Phase-2 EPIC), 336 (governance incident), **332** (prod env → **H1**, P0), **329** (Vercel → **H2**) |
| M0 (4) | **339** (R4 → PR #360 merge ✅), 260 (HCO), **259** (audit, P0), 258 (TRUTH) |
| M4 (1) | **263** (leave, P0 → R1 merge ✅, R2/R3 açık) |
| M5 (1) | 265 (attendance) |
| M6 (1) | 266 (notification → redaction merge ✅, R5/R6/R7 açık) |
| M7 (3) | 268 (reports), **269** (acceptance, P0), 264 (UX) |

## 4. Issue bazlı mutabakat (kanıtlı)

| Issue | Bu turda ne oldu | Öneri |
|---|---|---|
| **#339** SECURITY-CONTEXT | PR **#360** merge (`82cfb41`); issue API'deki 12 AC hâlâ unchecked; named specialist exact-head verdict kanıtı eksik | **AÇIK / BLOCKED**; merge veya seçilmiş CI ile kapatılamaz (§5.1) |
| **#263** LEAVE-OPS | R1/PR **#357** merge (`7f555c8`); R2 (assign/clear), R3 (bakiye/timezone) açık | açık kalır; due date |
| **#266** NOTIFICATION | redaction/PR **#361** merge (`e794450`); **R5 dalı (`2dcdb49`) PR'sız**; R6/R7 açık | açık kalır; R5 PR'ı açılmalı |
| **#259** SECURITY/AUDIT | key-ring yardımcı kodu main'de (#361), fakat AuditModule runtime wiring **#367 / PR #366** bekler; checkpoint imzası **#358** açık | açık kalır; uçtan uca rotasyon kabulü yok |
| **#258** TRUTH | matrix #356 ile merge; **`58bad0e`'e reconcile edilmedi** | açık kalır; reconcile dilimi |
| **#269** ACCEPTANCE | kabul harness'ı landı (#353); journey/negatif matris açık | açık kalır |
| **#329 / #332** | H2 **waiver kayıtlı** (#363) / H1 env bekliyor (**insan**) | açık kalır; gözlem H1 sonrası |
| **#358 / #362** | yeni; ikisi de milestone'sız | yeni milestone'a ata |


## 5. H6 karar paketi — **uygulama insan onayına bağlı** (ajan uygulamaz)

### 5.1 Kanıt envanteri (issue #339 — kapanış yetkisi değildir)

> **Teslimat kaydı:** PR #360 (`feat(security): server-authoritative request context and protected endpoint default-deny`) merge SHA `82cfb41313fc40ef2a85aaa4e7458ab4bfde3b9d`; son PR head `8246222c010001bb4a3f5349cd37d01fd06fdcf9`.
>
> AC-1–9 için aşağıdaki `fixed:` kaynakları önceki dilimin kod referanslarıdır;
> bu docs review'ında yeniden runtime kabulü yapılmadı. AC-10–12 bağımsız kanıt ister;
> hiçbir satır issue checkbox'ını veya specialist verdict'ünü otomatik tamamlamaz.
> 1. Context yokken protected controller fail-closed → `src/common/guards/permission.guard.ts` default-deny bloğu + `test/rbac/controller-enforcement-consistency.spec.ts` · `fixed:69f1c0f`, `fixed:8246222`
> 2. Enforcement'sız protected controller mimari testle yakalanır → aynı spec (metadata'sız controller testi) · `fixed:69f1c0f`
> 3. Tenant/branch/rol/permission sunucudan çözülür → `src/common/context/*` + `authority-resolver.service.ts` + `branch-scope.service.ts` · `fixed:69f1c0f`
> 4. Client değerleri yetki veremez/genişletemez → DTO+ValidationPipe 400 + guard yalnız sunucu-verisi · `fixed:69f1c0f`
> 5. Cross-tenant/branch/escalation/missing-permission negatifleri → `test/rbac/security-context-default-deny.spec.ts` (N1–N17) · `fixed:69f1c0f`
> 6. Non-enumerating red (403/404 ayrımı sızmaz) → `deny-response.ts` + `denyAndThrow` (mapped 404/401) · `fixed:8246222`
> 7. Catalog yalnız erişilebilir kayıtları okunabilir adlarla döner → `context-catalog.service.ts` + catalog spec'leri · `fixed:69f1c0f`, `fixed:93cb68d`
> 8. Effective role/permission sözleşmesi versioned + testli → `authority-resolver.service.ts` + resolution testleri · `fixed:69f1c0f`
> 9. Audit metadata redacted + allowlist → `context-audit.ts` + redaction taraması (bulgu 0) · `fixed:69f1c0f`
> 10. Regresyonlar + fresh DB → Backend CI `36101998392`, DB Smoke `36101998379`, Gate 1 `36101998454`, runtime-integration 52/52; migration yok (şema kanıtı tetiklenmedi)
> 11. **BLOCKED — Architecture, Security, KVKK, Data/DB, QA** rollerinin her biri
>    `8246222c010001bb4a3f5349cd37d01fd06fdcf9` için gerçek bağımsız verdict,
>    reviewer kimliği ve kanıt URL/path sağlamalıdır. Önceki A7/`3a901f9` GO iddiası
>    bu beş verdict'ün yerine geçmez. `artifacts/verify/R4/verdict.md` current main'de
>    yok; PR #360 reviews API `COMMENTED` kayıtları ve #339 routing yorumu gerçek
>    beş exact-head specialist verdict sağlamaz. "Re-verify kuyrukta" kanıt değildir.
> 12. Rollback + observation → `artifacts/R4/pr-body.md` Rollback bölümü + `artifacts/H1-H2/observation-log.md`
>
> Tasarım boşlukları issue **#362**'ye devredildi. Vercel preview kırmızıdır → **H2 kayıtlı waiver** (#363).
>
> **Kapanış kararı: BLOCKED.** #339 açık kalır. AC-11 için eksik named verdict'ler,
> AC-10 exact-head tam check eşlemesi ve Definition of Done post-merge observation
> kanıtı tamamlanmadan owner'a kapanış önerilmez. Bu PR tam ürün kabulü değildir.
>
> **Check kapsamı (review P2 düzeltmesi — "complete required-check set"):** Yukarıdaki satırlar bilinçli bir
> **evidans alt kümesidir**, tam liste değildir. Tam **zorunlu set = 10 context**
> (`.github/rulesets/main-merge-governance.json`): Sprint 1 Quality Gate · Backend CI · DB Smoke ·
> Gate 1 CI · Sensitive Pattern Scanner · GitGuardian scan · PR Governance / Body Validation ·
> PR Governance / Issue Reference · PR Governance / Rollback Plan · PR Governance / Acceptance Criteria.
> Toplam PASS sayısı veya seçilmiş workflow run'ları bu on context'in exact-head
> SUCCESS eşlemesinin yerine geçmez; bu belge #360 için yeni tam-set PASS iddia etmez.
> `P0 browser E2E and artifact evidence` bu sette
> **YOK** (zorunlu status check değildir; kabul yüzeyi olarak koşar). `Review Thread Resolution` ayrı bir
> ruleset parametresidir (`required_review_thread_resolution=true`; context listesinde değil).

**Güncel governance kaynağı:** [aktif ruleset 19052349](https://github.com/sisbas/OkulYonetimSaaS/rules/19052349),
2026-09-29 API: **10 required context**, `required_approving_review_count=0`.
Formal approval sayısının sıfır olması, #339'un bağımsız Architecture/Security/KVKK/Data/QA
review gereksinimini kaldırmaz; v2 §10'daki "1 approval" ifadesi live ruleset değeri değildir.
**POLICY_DEADLOCK #368 OPEN:** current main `progress-v2.md:46–47` AFTER merge resolve,
live ruleset BEFORE merge resolve ister. Owner kararı bekler; bu belge governance policy'sini
yeniden yazmaz. Testler PASS olsa da resolve/merge yetkisi doğmaz.

### 5.2 Önerilen komutlar (H6 onayı sonrası)

**Tarih gerekçesi / owner kararı:** `docs/phase2/README.md:9` v1'i bayat sayar.
Ancak v2 `remaining-plan-v2.md:105–106` yalnız #264/#269'u F2 (hafta 3–6) içinde,
**#268 R12'yi F3 (hafta 6–8)** içinde planlar; R12 eşlemesi `:129`'dadır.
Bu yüzden M7'yi F2 bitişine bağlayan önceki **2026-10-31 gerekçesi eksiktir**.
Planın `:3` tarihini (2026-09-23) başlangıç varsayarsak +8 hafta = **2026-11-18**;
bu tarih v2'nin açık milestone deadline'ı değil, **H6 owner onayına sunulan hesaplı öneri**dir.
v1 `next-phase-plan.md:62` S5'i 2026-12-04'te bitirir ve `:213` aynı tarihi önerir,
fakat o komut `/milestones/7`'yi "M7" diye etiketler: live API'de **M7 number=8,
number=7 M6**. Owner başlangıcı/tarihi onaylamadan aşağıdaki hiçbir komut uygulanmaz.
M1'in `closed_at` tarihi bir due date kanıtı değildir; M2/M3 hâlâ açık olduğundan
2026-09-28 "gerçek kapanış günü" değildir. Aşağıdaki tarihlerin tamamı öneridir.

Milestone tarihleri en geç bağımlı fazın bitişinden önce olamaz: M0 R13/R14 ve
M5 R15 F3'te olduğundan +8 hafta = 2026-11-18; M6 R7 F2'ye uzandığından
+6 hafta = 2026-11-04. Bu hesap başlangıç varsayımıdır; canlı CI/review kapasitesi
ve owner takvim kararı olmadan deadline sayılmaz. #345 Faz 1b kapanış tracker'ıdır;
Phase 2 milestone'una yalnız sonraki ticari aşama epic'i #344 önerilir.

```bash
# (a) M2/M3 teslimatları doğrulanıp owner onayladıktan sonra kapat;
#     sıfır açık issue tek başına semantic kapanış kanıtı değildir.
gh api -X PATCH repos/sisbas/OkulYonetimSaaS/milestones/3 -f state=closed   # M2
gh api -X PATCH repos/sisbas/OkulYonetimSaaS/milestones/4 -f state=closed   # M3

# (b) 8 mevcut milestone'un TAMAMINA due date ekle (KPI: 8/8)
#     Yalnız H6 owner onayından sonra; gerçek deadline veya kapanış kaydı DEĞİLDİR.
#     M1 closed_at=2026-08-11 bir kaynak bilgisi; due_on için ayrıca onay gerekir.
#     M2/M3 için 2026-09-28 geçmiş tarih önerisidir, gerçek kapanış günü değildir.
#     M7 F3/R12'yi içerir: 2026-09-23 + 8 hafta = 2026-11-18 (başlangıç varsayımı).
gh api -X PATCH repos/sisbas/OkulYonetimSaaS/milestones/1 -f due_on=2026-11-18T00:00:00Z   # M0 öneri (R13/R14 F3)
gh api -X PATCH repos/sisbas/OkulYonetimSaaS/milestones/2 -f due_on=2026-08-11T00:00:00Z   # M1 öneri
gh api -X PATCH repos/sisbas/OkulYonetimSaaS/milestones/3 -f due_on=2026-09-28T00:00:00Z   # M2 öneri
gh api -X PATCH repos/sisbas/OkulYonetimSaaS/milestones/4 -f due_on=2026-09-28T00:00:00Z   # M3 öneri
gh api -X PATCH repos/sisbas/OkulYonetimSaaS/milestones/5 -f due_on=2026-10-17T00:00:00Z   # M4
gh api -X PATCH repos/sisbas/OkulYonetimSaaS/milestones/6 -f due_on=2026-11-18T00:00:00Z   # M5 öneri (R15 F3)
gh api -X PATCH repos/sisbas/OkulYonetimSaaS/milestones/7 -f due_on=2026-11-04T00:00:00Z   # M6 öneri (R7 F2)
gh api -X PATCH repos/sisbas/OkulYonetimSaaS/milestones/8 -f due_on=2026-11-18T00:00:00Z   # M7 öneri (F3 dahil)

# (c) Faz 1b kapanis milestone u olustur (plan 10/H6)
gh api -X POST repos/sisbas/OkulYonetimSaaS/milestones -f title="Phase 1b Closure" -f due_on=2026-11-18T00:00:00Z  # öneri: M7/F3'ten önce kapanış tarihi verilmez

# (d) Milestone siz Faz 1b kalemlerini yeni milestone a ata (Phase-2 epic HARIC)
for n in 358 329 332 362 345; do gh issue edit $n --milestone "Phase 1b Closure"; done

# (e) Phase-2 epic kalemleri icin ayri milestone (istege bagli) — due_on ile (tum milestone'lar tarihli kalsin)
gh api -X POST repos/sisbas/OkulYonetimSaaS/milestones -f title="Phase 2 - Commercial Release" -f due_on=2027-01-15T00:00:00Z
for n in 344; do gh issue edit $n --milestone "Phase 2 - Commercial Release"; done
```

### 5.3 #336 (Governance Incident) icin karar gerekiyor

`[Governance Incident] main update bf8a7a3` (2026-09-11, etiketsiz, milestone'suz). Kayit mi, acik is mi?
Oneri: kanit/kapanis varsa kapatilir; yoksa `documentation` etiketiyle yeni milestone'a alinir.

## 6. KPI deltasi (plana gore)

| KPI | Hedef | Bugun |
|---|---|---|
| Acik `p0` issue | 0 | **6** |
| Milestone `due_on` | 8/8 mevcut | **0/8 doğrulandı (2026-09-29)** → yalnız owner onaylı 8 PATCH uygulanırsa 8/8; yeni tarihli Phase 1b ile 9/9, opsiyonel Phase 2 ile 10/10. Uygulanmadı. |
| Truth matrix `runtime`+`pilot-ready` | 13/13 | reconcile bekliyor (`58bad0e`) |
| Acik PR | 0 | 1 (#364) |

**Kaynak (dogrulanabilir):** `gh issue list`, `gh api milestones`, `gh api search/issues` — 2026-09-27, main `58bad0eb6822bfc6dd42a9ab2807b2a2b8d9da91`.
