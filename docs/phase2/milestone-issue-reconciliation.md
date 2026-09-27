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
| 5 | M4 | open | 1 | 1 | **yok** | 263 (leave — R1 merge, R2/R3 açık) |
| 6 | M5 | open | 1 | 1 | **yok** | 265 (attendance) |
| 7 | M6 | open | 1 | 2 | **yok** | 266 (notification — R5 branch merge edilmedi) |
| 8 | M7 | open | 3 | 1 | **yok** | 268, 269, 264 |

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

### 5.1 Kapanış yorumu önerisi (issue #339)

> **Kapanış kanıtı:** PR #360 (`feat(security): server-authoritative request context and protected endpoint default-deny`) `82cfb41` ile merge edildi.
> Zorunlu check'ler: DB Smoke `36101998379`, Backend CI `36101998392`, Gate 1 `36101998454`, P0 browser E2E `36101998541` — hepsi PASS; A7 bağımsız verdict'i **GO (0 blocker)**.
> F1/F2/F3 bulguları `fixed:93cb68d` / `fixed:8246222` ile kapatıldı; 7 review thread'i kanıtlı resolve edildi.
> Tasarım boşlukları issue **#362**'ye devredildi. Vercel preview kırmızıdır → **H2 kayıtlı waiver** (#363).

### 5.2 Önerilen komutlar (H6 onayı sonrası)

```bash
# (a) M2 ve M3'ü kapat (sıfır açık issue)
gh api -X PATCH repos/sisbas/OkulYonetimSaaS/milestones/3 -f state=closed   # M2
gh api -X PATCH repos/sisbas/OkulYonetimSaaS/milestones/4 -f state=closed   # M3

# (b) Due date ekle (öneri: M0/M4->10-17, M5/M6->10-24, M7->10-31)
gh api -X PATCH repos/sisbas/OkulYonetimSaaS/milestones/1 -f due_on=2026-10-17T00:00:00Z   # M0
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
| Milestone `due_on` | 8/8 | **0/8** |
| Truth matrix `runtime`+`pilot-ready` | 13/13 | reconcile bekliyor (`58bad0e`) |
| Acik PR | 0 | 1 (#364) |

**Kaynak (dogrulanabilir):** `gh issue list`, `gh api milestones`, `gh api search/issues` — 2026-09-27, main `58bad0eb6822bfc6dd42a9ab2807b2a2b8d9da91`.
