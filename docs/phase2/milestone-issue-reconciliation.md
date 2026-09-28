# Milestone ve Issue Mutabakatı — 2026-09-27 (main `58bad0e`)

**Amaç:** Faz 1b kapanışı için issue/milestone durumunu kanıtla kayda geçirmek ve **H6 (milestone hijyeni)**
karar paketini hazırlamak. **Uygulama insan onayına bağlıdır** (plan §9/H6: ajan öneriyi ve komutları hazırlar).

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
| 6 | M5 | open | 1 | 1 | **yok** | 265 (attendance — verdict R10/R15'e bağlı; v2 F2 bitimi ≈ 10-28) |
| 7 | M6 | open | 1 | 2 | **yok** | 266 (notification — R5 branch merge edilmedi; R7 F2'de) |
| 8 | M7 | open | 3 | 1 | **yok** | 268, 269, 264 (F2: R7–R11; **v2 bitiş ≈ 10-28**) |

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
| **#339** SECURITY-CONTEXT | PR **#360** merge (`82cfb41`); tüm AC'ler işaretli; DB Smoke/Backend CI/Gate 1/P0 E2E yeşil; A7 GO | **KAPATILABİLİR** (kapanış yorumu §5.1) |
| **#263** LEAVE-OPS | R1/PR **#357** merge (`7f555c8`); R2 (assign/clear), R3 (bakiye/timezone) açık | açık kalır; due date |
| **#266** NOTIFICATION | redaction/PR **#361** merge (`e794450`); **R5 dalı (`2dcdb49`) PR'sız**; R6/R7 açık | açık kalır; R5 PR'ı açılmalı |
| **#259** SECURITY/AUDIT | key-ring rotasyon desteği main'de (#361); checkpoint imzası **#358** açık | açık kalır |
| **#258** TRUTH | matrix #356 ile merge; **`58bad0e`'e reconcile edilmedi** | açık kalır; reconcile dilimi |
| **#269** ACCEPTANCE | kabul harness'ı landı (#353); journey/negatif matris açık | açık kalır |
| **#329 / #332** | H2 **waiver kayıtlı** (#363) / H1 env bekliyor (**insan**) | açık kalır; gözlem H1 sonrası |
| **#358 / #362** | yeni; ikisi de milestone'sız | yeni milestone'a ata |


## 5. H6 karar paketi — **uygulama insan onayına bağlı** (ajan uygulamaz)

### 5.1 Kapanış yorumu önerisi (issue #339 — AC bazlı eşleme ile)

> **Kapanış kanıtı:** PR #360 (`feat(security): server-authoritative request context and protected endpoint default-deny`) `82cfb41` ile merge edildi.
>
> AC eşlemesi (her satır `fixed:<sha>` ile):
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
> 11. Rol verdict'leri → A7 `artifacts/verify/R4/verdict.md` (HEAD `3a901f9` için GO; `8246222` için re-verify kuyrukta) — **bu AC, re-verify bitmeden kapatılamaz**
> 12. Rollback + observation → `artifacts/R4/pr-body.md` Rollback bölümü + `artifacts/H1-H2/observation-log.md`
>
> Tasarım boşlukları issue **#362**'ye devredildi. Vercel preview kırmızıdır → **H2 kayıtlı waiver** (#363).
>
> **Not (AC-11 kaydı):** A7 re-verify PR açıldıktan SONRA üretilecek; bu kapanış önerisi, AC-11'in `8246222`'ye yeniden bağlanmasına şartlıdır. Şartsız kapatma YOK.

### 5.2 Önerilen komutlar (H6 onayı sonrası)

```bash
# (a) M2 ve M3'ü kapat (sıfır açık issue)
gh api -X PATCH repos/sisbas/OkulYonetimSaaS/milestones/3 -f state=closed   # M2
gh api -X PATCH repos/sisbas/OkulYonetimSaaS/milestones/4 -f state=closed   # M3

# (b) 8 mevcut milestone'un TAMAMINA due date ekle (KPI: 8/8)
#     M1 zaten kapalı (2026-08-11) → gerçek kapanış tarihi kaydedilir.
#     M2/M3 bu paketle kapatılıyor → due date = kapanış günü.
#     M0/M4→10-17, M5/M6→10-24, M7→10-31 (v2 faz takvimiyle tutarlı: R7-R11 v2 F2'de).
gh api -X PATCH repos/sisbas/OkulYonetimSaaS/milestones/1 -f due_on=2026-10-17T00:00:00Z   # M0
gh api -X PATCH repos/sisbas/OkulYonetimSaaS/milestones/2 -f due_on=2026-08-11T00:00:00Z   # M1 (gerçek kapanış)
gh api -X PATCH repos/sisbas/OkulYonetimSaaS/milestones/3 -f due_on=2026-09-28T00:00:00Z   # M2 (kapanış günü)
gh api -X PATCH repos/sisbas/OkulYonetimSaaS/milestones/4 -f due_on=2026-09-28T00:00:00Z   # M3 (kapanış günü)
gh api -X PATCH repos/sisbas/OkulYonetimSaaS/milestones/5 -f due_on=2026-10-17T00:00:00Z   # M4
gh api -X PATCH repos/sisbas/OkulYonetimSaaS/milestones/6 -f due_on=2026-10-24T00:00:00Z   # M5
gh api -X PATCH repos/sisbas/OkulYonetimSaaS/milestones/7 -f due_on=2026-10-24T00:00:00Z   # M6
gh api -X PATCH repos/sisbas/OkulYonetimSaaS/milestones/8 -f due_on=2026-10-31T00:00:00Z   # M7

# (c) Faz 1b kapanis milestone u olustur (plan 10/H6)
gh api -X POST repos/sisbas/OkulYonetimSaaS/milestones -f title="Phase 1b Closure" -f due_on=2026-11-14T00:00:00Z

# (d) Milestone siz Faz 1b kalemlerini yeni milestone a ata (Phase-2 epic HARIC)
for n in 358 329 332 362; do gh issue edit $n --milestone "Phase 1b Closure"; done

# (e) Phase-2 epic kalemleri icin ayri milestone (istege bagli)
gh api -X POST repos/sisbas/OkulYonetimSaaS/milestones -f title="Phase 2 - Commercial Release"
for n in 344 345; do gh issue edit $n --milestone "Phase 2 - Commercial Release"; done
```

### 5.3 #336 (Governance Incident) icin karar gerekiyor

`[Governance Incident] main update bf8a7a3` (2026-09-11, etiketsiz, milestone'suz). Kayit mi, acik is mi?
Oneri: kanit/kapanis varsa kapatilir; yoksa `documentation` etiketiyle yeni milestone'a alinir.

## 6. KPI deltasi (plana gore)

| KPI | Hedef | Bugun |
|---|---|---|
| Acik `p0` issue | 0 | **6** |
| Milestone `due_on` | 8/8 | **0/8 bugün → paket uygulanınca 8/8** (M0–M7 due date + M2/M3 kapanış; yeni milestone'lar tarihlerle oluşturulur) |
| Truth matrix `runtime`+`pilot-ready` | 13/13 | reconcile bekliyor (`58bad0e`) |
| Acik PR | 0 | 1 (#364) |

**Kaynak (dogrulanabilir):** `gh issue list`, `gh api milestones`, `gh api search/issues` — 2026-09-27, main `58bad0eb6822bfc6dd42a9ab2807b2a2b8d9da91`.
