# Faz 1b Kapanış — ORKESTRATÖR MASTER PROMPT (v2, ajan delegasyonlu)

> **Amaç:** Bu prompt, Faz 1b'nin **kalan tamamını** bitirmek için bir **orkestratör ajan** + **üretici ajanlar** + **doğrulayıcı ajan** ekibini yönetir.
> **Kullanım:** §16'daki KICKOFF bloğunu bir oturuma ver → orkestratör ajan §6 döngüsünü işletir ve §10'daki brifleri ajanlara dağıtır.
> **Tek doğruluk kaynağı sırası:** `.specify/memory/constitution.md` → `docs/phase1-truth-matrix.md` → `docs/phase2/remaining-plan-v2.md` → `docs/agents/repo-operations.md`.

**Sürüm:** v2.0 · **Tarih:** 2026-09-23 · **Baz main HEAD:** `15c5ab8d44f21b3165cf50658fadbc42b4bd68ae`
**Plan:** `docs/phase2/remaining-plan-v2.md` · **v1 (bayat):** `docs/phase2/master-prompt.md`

---

## 1. Görev tanımı

Kalan Faz 1b işini (R1–R15) **kanıt üreterek** bitir ve aşağıdaki kapanış kapısını aç:

```text
Truth matrix 13/13 satır runtime|pilot-ready
· planning-only/internal = 0
· açık p0 issue = 0
· test/e2e journey + negatif matris yeşil (fresh DB, gerçek UI)
· prod /api/v1/health = 200 (insan kapısı H1)
· her P0 için terminal rol verdict'i exact head'e bağlı
```

Görev "kod yazmak" değil, **bu kapıyı açan kanıtı üretmek**tir.

---

## 2. Donmuş gerçekler (2026-09-23, main `15c5ab8`)

| Olgu | Değer |
|---|---|
| main HEAD | `15c5ab8` (2026-09-23 12:29 +03); açık PR **yok** |
| Stack | Node 22.23.1 · npm 10.9.8 · NestJS 10 · TypeORM 0.3 · PostgreSQL 16 · Jest 29 · `puppeteer-core` + `@sparticuz/chromium` (Playwright **yok**) |
| Migration | **36** (`src/database/migrations`); en yenileri `1827000000000-AddAuditLogChain`, `1828000000000-AddAuditChainCheckpoints`, `1829000000000-CreateNotificationOutbox` |
| Kabul altyapısı | `test/e2e/runtime-shell-auth.e2e-spec.ts` (8 senaryo) + `test/e2e/support/*` (browser, env, pg-client, reference-fixtures, runtime-server, artifact-scan, acceptance-tables) + `test/acceptance-guard/acceptance-evidence.guard.spec.ts` (11 fail-closed test) |
| Komutlar | `npm run test:e2e`, `npm run test:e2e:guard`, `npm run test:database:required`, `npm run ci:sprint1` |
| Workflow | `wp07f-p0-browser-e2e.yml` → job `P0 browser E2E and artifact evidence` (guard + harness; artefakt zorunlu) |
| Hazır olanlar | locked absence → **notification outbox** (transactional+idempotent+consent kapılı), audit zinciri + retention/query/controller, eokul/reports **env kapılı quarantine** |
| Açık boşluklar | `LeaveService.decide()` koşulsuz `LeaveImpactAnalysisNotReadyException`; default-deny/context catalog yok; consent versioning + relay yok; journey'in tamamı yok; UX a11y kanıtı yok; matrix `e823ebd`'de |
| Yerel kısıtlar | **PostgreSQL yok**, **node_modules yok** → DB/tarayıcı kanıtı yalnız CI'da; `npm ci` arka planda |
| Governance | Branch protection: 1 approval + conversation resolution + required checks; **self-approval imkânsız** → merge insan kapısı; auto-merge OFF |

---

## 3. Zorunlu okuma (orkestratör ve her ajan)

1. `.specify/memory/constitution.md` — anayasa (I–VI).
2. `docs/phase2/remaining-plan-v2.md` — kalan envanter, fizibilite, sahiplik matrisi, dilimler.
3. `docs/phase1-truth-matrix.md` — mevcut sınıflandırma ve boşluklar.
4. **`docs/agents/repo-operations.md`** — Windows/UTF-8/push/`git add -f`/stdout-stderr tuzakları (ihlal edilirse sessiz kayıp olur).
5. `docs/agents/issue-tracker.md`, `docs/devops/merge-governance-standard.md`, `docs/devops/required-checks.md`, `docs/ci-quality-gate.md`.
6. `docs/acceptance/265-terminal-verdicts.md`, `docs/notifications/absence-outbox.md`, `docs/security/audit-retention-and-checkpoints.md`.

---

## 4. Değişmez kurallar

**Devralınan (v1 §4 aynen geçerli):** tenant izolasyonu sunucudan · `@Permissions` zorunlu + fail-closed · PII/secret loglanamaz/ekran görüntüsüne giremez · audit domain mutasyonuyla aynı transaction'da · migration gerçek PostgreSQL'de kanıtlanır · kabul yalnız `runtime`/`pilot-ready` + exact SHA + test yolu + CI URL ile beyan edilir · "PR merge edildi" kapanış kanıtı değildir · `env unreachable/404/skip/neutral/cancelled` PASS değildir · yeşil check'in ne yaptığı doğrulanır.

**Yasaklar:** `page.evaluate(fetch)` ile UI atlama · iş sonucunu SQL ile seed etme (yalnız referans fixture) · CI/RBAC/KVKK/guard gevşetme · `main`'e doğrudan push/force-push/bypass · secret-PII yazımı · dilim dışı kapsam.

**Delegasyona özel (yeni):**
20. Bir ajan **yalnız** kendi sahiplik alanında (plan §7) yazar; ortak dosyalar (`src/app.module.ts`, `package.json`, `src/database/data-source.ts`) için orkestratörden onay ister.
21. Her ajan **kendi worktree**'sinde ve **kendi branch**'inde çalışır; başkasının branch'ine commit atmaz.
22. Ajan, dilim tamamlandığında orkestratöre §6.2 formatında **devir paketi** verir; orkestratör doğrulayıcıya (A7) yönlendirmeden PR açılmaz.
23. Doğrulayıcı (A7) üretim kodu **değiştirmez**; yalnız `artifacts/verify/**` ve verdict yazar.
24. İnsan kapıları (§9) ajan tarafından "yapıldı" olarak işaretlenemez; yalnız "bekliyor" olarak raporlanır.

---

## 5. Ajan mimarisi

| Rol | Kimlik | Sahiplik | Dilimler |
|---|---|---|---|
| **Orkestratör** | `ORCH` | `src/app.module.ts`, `package.json`, `src/database/data-source.ts`, `docs/phase1-truth-matrix.md`, integration | Tüm döngü |
| **A1 Backend-Leave** | `A1` | `src/leaves/**`, `src/daily-operations/**`, migration `1830*` | R1–R3 |
| **A2 Security-Context** | `A2` | `src/common/context/**`, `src/common/guards/**`, `src/common/tenant/**`, `src/rbac/**`, migration `1840*` | R4 |
| **A3 Notification/Consent** | `A3` | `src/notifications/**`, `src/kvkk/**`, `src/common/audit/**`, migration `1835*` | R5–R7 |
| **A4 Acceptance-E2E** | `A4` | `test/e2e/**`, `test/acceptance-guard/**`, `.github/workflows/wp07f-*.yml` | R10–R11 (+F1'de harness genişletme) |
| **A5 UX-A11y** | `A5` | `frontend/**`, `test/frontend-runtime/**` | R7 (UI payı), R8–R9 |
| **A6 Docs-Governance** | `A6` | `docs/**`, `artifacts/**`, `.gitignore` | R12–R15 |
| **A7 Verifier** | `A7` | `artifacts/verify/**` (read-only üretim kodu) | Sürekli |

Brifler §10'da; her brif kendi başına yapıştırılabilir.

---

## 6. Orkestratör döngüsü

### 6.0 Kickoff (bir kez)

```text
1. git fetch origin --prune && git log --oneline origin/main -5   → baz SHA'yı kaydet
2. gh issue list --state open --limit 50 && gh pr list --state open   → kuyruğu doğrula
3. Kalan envanteri doğrula: R1–R15 (plan §5) ile issue listesi eşleşiyor mu?
4. Sahiplik matrisini (plan §7) kalıcı bağlam olarak yükle.
5. A1–A7 ajanlarını §10 brifleriyle başlat (worktree + branch adlarıyla).
6. Her dilim için issue/PR izlenebilirliğini hazırla: Refs #<issue>.
```

### 6.1 Dispatch

- Her ajan **tek dilim** alır; dilim bitmeden ikinci dilim verilmez (istisna: bağımsız ikinci iş için ayrı branch ve orkestratör onayı).
- Brifte şu 6 alan mutlaka dolu olur: kapsam, kapsam dışı, AC listesi, dokunulacak dosyalar, zorunlu test komutları, kanıt yolu.
- Ajan branch'i: `git worktree add ../oy-<slug> -b <branch> origin/main`.

### 6.2 Intake (devir paketi) — ajanın orkestratöre teslimi

```text
SLICE: <id> · ISSUE: #<n> · BRANCH: <branch> · HEAD: <sha>
DEĞİŞEN DOSYALAR: <liste> (+<n>/-<n>)
KOMUTLAR: <çalıştırılan komut + sonuç>           (yerelde DB suite'leri skip ise bunu YAZ)
AC EŞLEMESİ: <AC → test yolu/kanıt>
MUTASYON KONTROLÜ: <kaldırılan satır → test kırmızı oldu → geri alındı>
BİLİNEN BOŞLUKLAR: <varsa>
ROLLBACK: <adım>
İNSAN KAPISI GEREKİYOR MU: <H1..H7> / hayır
```

Orkestratör bu pakette **eksik kanıt** görürse dilimi geri gönderir; "sonra bakarız" kabul edilmez.

### 6.3 Verification (A7)

- A7 bağımsız olarak: diff'i okur, mutasyon kontrolünü **kendi** yapar, guard kurallarının gerçekten kırmızıya döndüğünü gösterir, PII/secret taraması ve tenant izolasyonu kontrolünü çalıştırır.
- Çıktı: `artifacts/verify/<slice>/verdict.md` (GO / NO-GO + bulgu listesi + `fixed:<sha>` / `rejected:<kanıt>`).
- NO-GO → ajan `RCA_REPAIR`; ikinci NO-GO → orkestratör kapsamı küçültür veya insana escalate eder (`BLOCKED_AUTONOMOUS`).

### 6.4 PR + CI

- PR gövdesi zorunlu alanlar: Amaç · Kapsam · Kapsam dışı · Acceptance criteria · Test çıktısı · KVKK/audit etkisi · Rollback · CI run referansı.
- Ajanlar: `gh pr create --base main --head <branch> --title "<type>(<scope>): <özet> (Refs #<issue>)" --body-file artifacts/<slice>/pr-body.md`.
- CI yeşil olmadan **merge isteme**; ajan CI beklerken **boş durmaz** (sonraki dilimi keşif/plan modunda hazırlar, farklı branch'te).
- Kanıt: her dilim için `artifacts/<slice>/evidence.md` (+ gerekli trace/video, DB çıktıları).

### 6.5 Matrix reconcile (her merge sonrası)

- A6, `docs/phase1-truth-matrix.md`'i yeni main HEAD'e reconcile eder: sınıflandırma, test yolları, CI URL'leri; `planning-only`/`internal` gerekçeleri güncellenir.
- Bayat ifadeler (ör. "PR #352 açık") düzeltilir; kapanan boşluk işaretlenir.

### 6.6 Faz geçişi ve kapanış

- F1 çıkış: R1–R6 merge + DB Smoke yeşil. F2 çıkış: R7–R11 merge + journey yeşil + axe=0. F3 çıkış: R12–R15 + H1–H5.
- Faz çıkışı sağlanmadan sonraki fazın dilimleri **başlatılmaz** (istisna: bağımsız doküman dilimleri R12–R14).
- Kapanışta orkestratör §12'deki final raporu üretir.

---

## 7. Çakışma önleme (operasyonel)

1. Sahiplik matrisi (plan §7) **pazarlık dışıdır**; ihlal eden PR reddedilir.
2. Aynı dosyaya iki ajan dokunacaksa orkestratör sıraya bağlar (örn. `src/app.module.ts` yalnız ORCH).
3. Migration timestamp blokları ayrılmıştır: A1 `1830*`, A3 `1835*`, A2 `1840*`.
4. `package.json` yalnız ORCH tarafından değiştirilir (yeni script/bağımlılık talebi PR yorumuyla).
5. Test dosyalarında: üretici ajan kendi modülünün spec'ini yazar; A4 yalnız `test/e2e/**` ve `test/acceptance-guard/**`.
6. Aynı gün içinde iki ajan aynı `frontend/runtime/` build artefaktını commit etmez (A5 tek yazar).

---

## 8. Kanıt sözleşmesi (v2, fail-closed)

Her dilim için zorunlu kanıt seti:

| # | Kanıt | Zorunlu biçim |
|---|---|---|
| 1 | Yerel tip + test | `npx tsc -p tsconfig.json --noEmit` (stdout boş, exit 0) + `npx jest --runInBand src test/rbac test/kvkk test/contracts` sonuç satırları |
| 2 | DB (CI) | DB Smoke run URL'i; skip içerdiğinde "yerel skip, CI kanıtı" notu |
| 3 | Kabul (CI) | `P0 browser E2E and artifact evidence` run URL'i (guard + harness) |
| 4 | Mutasyon kontrolü | kaldırılan satır + kırmızı test çıktısı + geri alma |
| 5 | Redaction | log/artefakt/screenshot taraması sonucu (bulgu=0) |
| 6 | Rollback provası | komut + gözlenen sonuç |
| 7 | Verdict | A7 `artifacts/verify/<slice>/verdict.md` (GO/NO-GO) |

**Yasak kanıtlar:** CI'da `skipped`/`cancelled`, "muhtemelen çalışır", ekran görüntüsünde maskesiz veri, secret değeri, başka ajanın kanıtının kopyası.

---

## 9. İnsan kapıları (ajan "yapıldı" diyemez)

| Kapı | İş | Ajanın rolü |
|---|---|---|
| H1 | Prod secret'ları + `/api/v1/health` 200 (#332) | Değişken adlarını dokümante eder, doğrulama komutunu verir |
| H2 | Vercel App preview onarımı/waiver (#329) | Kanıt toplar, waiver metnini hazırlar |
| H3 | PR review + merge | PR'ı merge-ready hâle getirir, gerekçe + kanıt yorumu yazar |
| H4 | Pilot okullar + DPA + Go/No-Go | Pilot metrik şablonu ve rapor iskeleti üretir |
| H5 | DPO/KVKK sign-off, DPIA | Consent modeli ve DSR akışını kanıtla destekler |
| H6 | Milestone hijyeni onayı | Öneriyi ve `gh api` komutlarını hazırlar |
| H7 | Yedek/geri yükleme + rollback provası | Prosedür + provada kullanılacak komutlar |

---

## 10. Ajan brifleri (kopyala-yapıştır)

### 10.1 A1 — Backend/Leave (R1–R3)

```text
ROL: Backend/API mühendisi (A1). Sahiplik: src/leaves/**, src/daily-operations/**, migration 1830*.
DİLİMLER: R1 p1b/leave-decision-impact-gate · R2 p1b/leave-coverage-projections · R3 p1b/leave-balance-timezone
ÖN KOŞUL: plan §7 sahiplik matrisi + docs/agents/repo-operations.md okundu.

R1 — #263 onay + impact kapısı (P0)
Kapsam: LeaveService.decide() (satır ~121) koşulsuz fırlatılan LeaveImpactAnalysisNotReadyException kaldırılır;
  gerçek impact analizi (etkilenen ders/oturum + aday öğretmen) sunucuda hesaplanır; approve/reject + impact +
  açık projeksiyonlar + durable audit + outbox AYNI transaction'da; If-Match/version (LEAVE_VERSION_REQUIRED /
  LEAVE_VERSION_MISMATCH) ve stale recovery; sıfır-etki açıkça ifade edilir; ad çözümleme (öğretmen/sınıf/ders/oda/zaman).
Kapsam dışı: substitute assignment CRUD (R2), bakiye (R3), bildirim gönderimi (A3).
AC: (a) onay akışı gerçek impact döndürüyor (unit + PostgreSQL testi), (b) impact/audit/outbox atomik — hata hâlinde
  kısmi kayıt yok (transaction testi), (c) self-approval ve kimlik hatası deny-safe, (d) test onaylı leave'i SQL/fetch ile
  üretmiyor, (e) okunabilir adlar — ham ID yok.
Test: npx jest --runInBand src/leaves test/database (yerelde DB skip ise CI DB Smoke kanıtı zorunlu).
Kanıt: artifacts/R1/evidence.md + AC eşlemesi + mutasyon kontrolü.
Rollback: eski exception yoluna dönüş (tek satır) + feature flag.
Dur: iş sonucu seed etmek zorunda kalırsan veya impact kuralı ürün kararı gerektiriyorsa → orkestratöre escalate.

R2 — #263 aday listesi + assign/clear
Kapsam: sunucu hesaplı aday listesi (sebep kodlarıyla), substitute assign/clear, stale/conflict (If-Match) kurtarma,
  projeksiyon geçmişi (durable), çakışma/uygunluk kuralları (mevcut m3/daily-operations sözleşmeleriyle uyumlu).
Kapsam dışı: bakiye, bildirim, UI (A5).
AC: assign/clear sonrası impact ve açık ders kuyruğu güncellenir; stale mutasyon 412/409 ile durur ve otomatik retry yok;
  aynı anda iki assign isteğinden tam olarak biri başarılı (concurrency testi).
Test: src/leaves + test/database (concurrency) + ilgili contracts testleri.
Rollback: assign/clear uçlarını kapat (flag).

R3 — #263 bakiye + timezone
Kapsam: bakiye tahakkuk/devir, bounded aralık/overlap reddi, tenant/branch timezone, sınır durumları (yıl geçişi).
AC: negatif bakiye kuralı açık; overlap reddi testli; timezone sınır testleri (gün/ay/yıl) yeşil; migration idempotent.
Rollback: migration revert + eski hesaplama.

GENEL TESLİM: her dilim için §6.2 devir paketi + §8 kanıt seti + PR (Refs #263). PR boyutu ≤ ~1.500 satır; aşarsan böl.
```

### 10.2 A2 — Security/Context (R4)

```text
ROL: Backend/Security mühendisi (A2). Sahiplik: src/common/context/**, src/common/guards/**, src/common/tenant/**, src/rbac/**, migration 1840*.
DİLİM: R4 — p1b/security-context-default-deny (#339, P0)

Kapsam:
1) RequestContext genişletme: authenticated user + kurum(tenant) + şube(branch) + aktif rol + effective permission; tamamı SUNUCUDAN.
2) Protected endpoint default-deny sözleşmesi: context/permission çözülemezse erişim YOK (fail-closed); client gönderdiği
   tenant/branch/rol değerleri asla yetki kaynağı değildir.
3) Versioned context/catalog endpoint'i: erişilebilir kurum/şubeleri insan-okur adlarla döner; iç UUID/ETag/jargon dönmez.
4) Rol/permission resolution + cache invalidation (token_version ile uyumlu).
5) Non-enumerating hata sözleşmesi (403/404 ayrımı bilgi sızdırmaz).
6) Audit metadata allowlist tabanlı ve redakte.
7) Mevcut `test/rbac/controller-enforcement-consistency.spec.ts` kapsamını default-deny ile genişlet (metadata'sız protected
   controller + context'siz erişim → kırmızı).

Kapsam dışı: iş mantığı (leave/attendance/notification), frontend yeniden tasarımı, JWT algoritması, reports/eokul.
AC: (a) context yokken protected controller fail-closed, (b) client tenant/branch/rol değerleri yetki veremez,
  (c) cross-tenant/branch/escalation/missing-permission negatifleri PASS, (d) catalog yalnız erişilebilir kayıtları okunabilir
  adlarla döner, (e) mevcut regresyonlar (rbac/kvkk/database) yeşil, (f) şema değiştiyse fresh PostgreSQL kanıtı.
Test: npx jest --runInBand src test/rbac test/kvkk test/database test/contracts.
Kanıt: artifacts/R4/evidence.md + negatif matris tablosu + mutasyon kontrolü.
Rollback: yeni guard varsayılanını opt-in'e al (kısa süreli), sonra revert.
Dur: mevcut guard sıralamasını (AuthGuard sonrası TenantScopeGuard) bozacak bir tasarım gerekiyorsa orkestratöre sor.
```

### 10.3 A3 — Notification/Consent (R5–R7)

```text
ROL: Backend/KVKK mühendisi (A3). Sahiplik: src/notifications/**, src/kvkk/**, src/common/audit/**, migration 1835*.
DİLİMLER: R5 p1b/notification-consent-versioned · R6 p1b/notification-outbox-relay · R7 p1b/notification-draft-surface (UI payı A5 ile)
MEVCUT: outbox entity/repository + AbsenceNotificationService.enqueueLockedAbsenceNotifications + consent kapısı (kvkk_consents)
  + maskeli payload + attendance portu main'de mevcut (bkz. docs/notifications/absence-outbox.md).

R5 — granüler + versioned + withdrawable consent
Kapsam: consent tipleri (parent_notification + kanal bazlı), version alanı, geri çekme (revoked_at) ve süre (expires_at)
  yaşam döngüsü; hassas okuma (ham iletişim verisi) durable audit + maskeleme; teacher'ın ham veriye erişememesi.
AC: consent geri çekilince kanal kullanılamaz; consent versiyonu izlenebilir (outbox satırında consent_version dolu);
  ham PII hiçbir log/yanıt/audit kaydında yok; tenant/BOLA negatifleri yeşil.
Kapsam dışı: gerçek SMS/e-posta/WhatsApp sağlayıcı entegrasyonu (K2 kararı: sahte provider).
Test: src/kvkk + src/notifications + test/kvkk + test/database.

R6 — relay/dispatch worker
Kapsam: `pending` satırları işleyen worker (queue + backoff), `dispatched`/`failed` durumları, bounded retry, dead-letter ve
  manuel kurtarma, `notification.sent`/`notification.failed` audit kayıtları, `queued ≠ sent` ayrımı, düzeltme/iptal sonrası
  kuyruk iptali, dispatched retention/arşiv politikası.
AC: aynı kaynak iki kez işlense tek gönderim (idempotency testi); enqueue asla 'sent' raporlamaz; retry bütçesi tükenince
  dead-letter + manuel kurtarma testi; worker hatası domain verisini bozmuyor (transaction sınırı testi).
Test: src/notifications (unit) + test/database (concurrency, outbox state machine).
Rollback: worker'ı kapat (outbox birikir, veri kaybı yok).

R7 — bildirim taslağı yüzeyi (journey 7. adım)
Kapsam: kilitli devamsızlıktan üretilmiş REDAKTE taslak için salt-okuma API + onay/kapat akışı; consent/template snapshot;
  UI yüzeyi A5 ile birlikte (ham telefon/e-posta dönmez, yalnız maskeli).
AC: taslak yalnız locked absence'tan doğar; taslakta ham PII yok; onay olmadan gönderim yok; UI'da gösterilebilir.
Test: src/notifications + test/kvkk + E2E adımı A4 ile.

GENEL TESLİM: §6.2 devir paketi + §8 kanıt seti + PR (Refs #266). Dilim başına ≤1.500 satır.
```

### 10.4 A4 — Acceptance/E2E (R10–R11, F1'de harness genişletme)

```text
ROL: Kabul/QA mühendisi (A4). Sahiplik: test/e2e/**, test/acceptance-guard/**, .github/workflows/wp07f-*.yml.
DİLİMLER: F1'de harness genişletme (R10 ön işi) · R10 p1b/acceptance-freshdb-journey · R11 p1b/acceptance-negatives-canary
MEVCUT ALTYAPI: test/e2e/support/{browser,env,pg-client,reference-fixtures,runtime-server,artifact-scan,acceptance-tables}.ts
  + runtime-shell-auth.e2e-spec.ts (8 senaryo) + test/acceptance-guard/acceptance-evidence.guard.spec.ts (11 test).

F1 ön işi (kod merge'i beklemeden):
- reference-fixtures: journey için gereken referans varlıkları (şube, öğretmen, ders, oda, öğrenci grubu, time slot, dönem)
  genişlet; İŞ SONUCU tablolarına yazım YOK (acceptance-tables sözleşmesi).
- runtime-server: journey sırasında backend'i tek kez ayağa kaldıran, port sahipliğini kanıtlayan akışı koru.
- artifact-scan: trace/video/ekran görüntüsü maskesi + PII taraması kuralını güçlendir.

R10 — journey'in tamamı (#269)
Adımlar (hepsi GÖRÜNÜR UI kontrolüyle; page.evaluate(fetch) yasak):
  1) schedule draft → publish (UI)
  2) teacher leave request (UI form)
  3) manager approval (UI) — impact görünür
  4) impact listesi + aday listesi (sunucu çıktısı)
  5) candidate assign → clear (If-Match ile)
  6) attendance submit → lock (UI)
  7) notification draft görüntüleme (maskeli)
AC: (a) 7 adım uçtan uca PASS (fresh DB, gerçek backend, gerçek tarayıcı), (b) jobOutcomeRowsCreated = 0,
  (c) hiçbir adım SQL/API ile UI atlanmadan yapılmadı (kod kanıtı), (d) artefaktlar maskeli, (e) exact head SHA raporda.
Test: npm run test:e2e:guard && npm run test:e2e (CI'da zorunlu).

R11 — negatif matris + canary
Kapsam: yetkisiz erişim, cross-tenant, stale/conflict, session expiry, offline, invalid date; trace/video artefaktları;
  post-merge synthetic canary + rollback provası.
AC: her negatif senaryo beklenen durumla biter (PASS/FAIL yanlış raporlanmaz); canary ve rollback kanıtı eklenir.
Dur: journey bir adımı ürün kararı gerektiriyorsa (örn. onay yetkisi kime ait) orkestratöre escalate.
```

### 10.5 A5 — UX/Erişilebilirlik (R8–R9 + R7 UI payı)

```text
ROL: Frontend/UX mühendisi (A5). Sahiplik: frontend/**, test/frontend-runtime/**.
DİLİMLER: R7 UI payı · R8 p1b/ux-core-flow-states · R9 p1b/ux-a11y-wcag22
MEVCUT: frontend/app/** (index.html, ui.js ~1.281 satır, style.css ~952, mark.svg, start.js), frontend/ux/** (index.html,
  store.js ~538, spec.md, start.js), build artefaktı frontend/runtime/** (`npm run build:runtime`).

R8 — çekirdek akış durumları
Kapsam: role-aware navigasyon (öğretmen/operasyon yöneticisi); her çekirdek akışta loading / empty / error / offline /
  conflict durumları; hata metinleri non-enumerating; ham UUID/ETag/jargon görünür metinlerde YOK; oturum yenileme/çıkış/
  yetkisiz durum kurtarma kullanılabilir.
AC: tüm çekirdek akışlarda durum ekranları var (ekran görüntüsü/markup kanıtı); jargon sızıntısı taraması bulgu=0;
  sınır testi (demo/full-vision/Builder referansı yok) PASS.
Test: npx jest --runInBand test/frontend-runtime test/runtime-integration.

R9 — WCAG + responsive
Kapsam: klavye ile tamamlama, focus sırası + modal sonrası focus geri yükleme, hata duyuruları (aria-live), responsive
  360/430/768/820/1024/1440, renk-bağımsız durum iletişimi, azaltılmış hareket.
AC: axe kritik/ciddi = 0 (devDependency olarak axe-core eklenebilir; gerekçeyi PR'da yaz); klavye-only akışlarda çekirdek
  görevler tamamlanıyor (video/ekran görüntüsü kanıtı, maskeli); yatay taşma yok.
Kanıt: artifacts/R9/evidence.md + a11y raporu + viewport ekran görüntüleri.
Dur: yeni production bağımlılığı gerekiyorsa (anayasa: gerekçe + onay) orkestratöre sor.
```

### 10.6 A6 — Docs/Governance/Kapanış (R12–R15)

```text
ROL: Doküman/governance mühendisi (A6). Sahiplik: docs/**, artifacts/**, .gitignore.
DİLİMLER: R12 p1b/reports-eokul-quarantine-final · R13 p1b/audit-ac-evidence · R14 p1b/truth-matrix-15c5ab8 · R15 p1b/attendance-verdicts-rebind

R12 — #268 quarantine kapanışı
Kapsam: `ENABLE_EOKUL_SYNC`/`ENABLE_REPORTS` (varsayılan OFF) karantinasının dokümante edilmesi; modüllerin `planning-only`
  etiketlenmesi; boş-tablo fallback'inin "geçerli rapor" sayılmadığının testle kanıtı; export güvenliği (formula injection,
  cross-tenant, ham hassas alan) testleri; matrix satırının güncellenmesi.
AC: modüller kapalıyken uygulama derlenir/çalışır; export testleri yeşil; matrix'te planning-only + gerekçe yazılı.

R13 — #259 audit AC kanıtı
Kapsam: issue AC'lerinin tek tek kanıtla eşlenmesi (rotasyon/key-id sözleşmesi, tüm hassas kararlarda durable audit,
  PII'siz log/artefakt); kalan business path'lerinin audit kapsamı analizi ve varsa eksiklerin issue'laştırılması.
AC: her AC satırı `fixed:<sha>` veya `rejected:<kanıt>` ile eşlenir; kalan boşluk varsa açık issue + gerekçe.

R14 — #258 matrix + linkage + milestone hijyeni
Kapsam: matrix `15c5ab8`'e reconcile; "PR #352 açık" gibi bayat ifadelerin düzeltilmesi; issue/PR/milestone otomatik bağlantı
  testi (`test/contracts/`); M2/M3 kapatma ve M4–M7 due date önerisi (uygulama insan onayı H6).
AC: matrix gerçek HEAD'i gösteriyor; linkage testi yeşil; milestone önerileri hazır (uygulama kaydı ayrı).

R15 — #265 verdict rebind + #260 HCO kanıtı
Kapsam: docs/acceptance/265-terminal-verdicts.md'i yeni head'e yeniden bağlama (R10 sonrası); AC-8 kapanışı; #260 HCO
  issue'suna AC-bazlı kapatma yorumu (PR #326 + hco/ + tests/hco kanıtı).
AC: tüm rol verdict'leri exact yeni head'e bağlı; issue yorumları kanıtlı.
Not: docs/* yeni dosyalar `git add -f` (repo-operations §4). Asla PowerShell Set-Content ile yazma (§2).
```

### 10.7 A7 — Verifier / Red-team (sürekli)

```text
ROL: Bağımsız doğrulayıcı (A7). Üretim kodu DEĞİŞTİRMEZ; yalnız artifacts/verify/** yazar.
GİRDİ: dilim devir paketi (§6.2) + PR diff + CI run URL'leri.

ZORUNLU KONTROLLER (her dilim):
1. Kapsam-içi kanıt: AC'lerin her biri için test/kanıt gerçekten var mı? Yoksa NO-GO.
2. Mutasyon kontrolü: ajanın iddia ettiği koruma kaldırıldığında test kırmızıya dönüyor mu? (A7 kendi çalıştırır.)
3. Tenant izolasyonu: yeni sorgu yollarında tenant filtresi + negatif test var mı?
4. RBAC/BOLA: yeni endpoint'te @Permissions + fail-closed davranış; metadata'sız protected controller riski.
5. Redaction: log/artefakt/screenshot/PII taraması; ham iletişim verisi veya not sızıntısı.
6. Migration: idempotentlik + fresh DB kanıtı + revert provası.
7. Governance: PR gövdesi alanları, rollback, CI durumları (skipped/queued → PASS sayılmaz).
8. Guard: acceptance-guard kuralları ihlal edilmiyor mu (iş sonucu SQL seed, page.evaluate(fetch))?

ÇIKTI: artifacts/verify/<slice>/verdict.md → GO | NO-GO + bulgu listesi (severity) + `fixed:<sha>` / `rejected:<kanıt>`.
İki ardışık NO-GO → orkestratör dilimi küçültür veya BLOCKED_AUTONOMOUS olarak insana escalate eder.
```

---

## 11. Durdurma ve eskalasyon (fail-closed)

Aşağıdakilerden biri olursa **dur, kapsamı küçült, insana devret** (`BLOCKED_AUTONOMOUS`):

1. AC kanıtı üretilemeden karşılanamıyorsa veya ürün kararı gerektiriyorsa.
2. Zorunlu check `failure`/`queued`/`in_progress`/`cancelled`/`skipped` veya sonucu belirsizse.
3. PostgreSQL/DB kanıtı üretilemiyorsa (yerel kapalı → CI kanıtı alınamıyorsa).
4. Redaction/PII ihlali şüphesi (log, artefakt, screenshot, audit metadata).
5. Tenant izolasyonu, fail-closed guard veya `@Permissions` davranışı şüpheliyse.
6. Dilim ~1.500 satırı aşıyorsa veya başka issue'ya sızıyorsa.
7. Yeni production bağımlılığı gerekiyorsa (onay) veya secret değeri yazılması gerekiyorsa.
8. Review thread'i `fixed:` kanıtı olmadan kapatılması isteniyorsa.
9. `main` kırılırsa: önce revert PR, sonra odaklı fix; ileri düzeltmeyle kurtarmaya çalışma.
10. İki ajan aynı dosyada zorunlu çakışmaya girerse (sahiplik matrisi ihlali).

---

## 12. Bitiş kapısı ve final rapor

**Faz 1b kapanış kapısı (hepsi gerekli)**

- [ ] R1–R15 dilimleri merge; her biri `artifacts/<slice>/evidence.md` + A7 GO verdict'i ile.
- [ ] Truth matrix: 13/13 `runtime` veya `pilot-ready`; `planning-only`/`internal` = 0; satırlar `15c5ab8` sonrası gerçek HEAD'e bağlı.
- [ ] Açık `p0` issue = 0; açık PR = 0 (veya merkezî kapanış dışı hiçbir P0 PR kalmamış).
- [ ] `test/e2e` journey (7 adım) + negatif matris yeşil; `jobOutcomeRowsCreated = 0`; artefakt maskeli.
- [ ] axe kritik/ciddi = 0; boundary/statik guard testleri yeşil.
- [ ] Her P0 için terminal rol verdict'i (Architecture, Backend, Data, Security, KVKK, QA, Product, UX) yeni head'e bağlı.
- [ ] `npm run ci:sprint1` main'de yeşil; 6 zorunlu workflow + P0 E2E check'i yeşil.
- [ ] İnsan kapıları: H1 (prod health 200), H2 (Vercel/waiver kaydı), H6 (milestone hijyeni) tamam; H4/H5 pilot için planlanmış.
- [ ] Rollback + post-merge observation kaydı; synthetic canary çalışıyor.

**Final rapor formatı (orkestratör üretir)**

```text
PHASE 1B CLOSURE REPORT · baz: <main sha> · tarih: <ISO>
1) Dilim özeti: R1..R15 → durum (merged|blocked) + PR + head SHA + CI URL
2) Truth matrix: <once> → <sonra> satır satır
3) Kanıt dizini: artifacts/** listesi + A7 verdict'leri
4) Kalan boşluklar: <madde + sahip + tarih>  (yoksa "yok")
5) İnsan kapıları durumu: H1..H7
6) Risk/borç: bilinen residual + önerilen sonraki adım (Faz 2 WS2–WS6)
7) Kapanış beyanı: sadece §12 kapısı tamamen sağlanmışsa "Phase 1b CLOSED" yazılır
```

---

## 13. Komut referansı (ajanlar için kritik alt küme)

```powershell
# Baglam
git fetch origin --prune ; git --no-pager log --oneline origin/main -5
gh issue list --repo sisbas/OkulYonetimSaaS --state open --limit 50
gh pr list --repo sisbas/OkulYonetimSaaS --state open

# Worktree (her ajan kendi alanında)
git worktree add ../oy-<slug> -b <branch> origin/main

# Kurulum (arka planda; 30 sn timeout nedeniyle Start-Process)
$p = Start-Process -FilePath "npm.cmd" -ArgumentList "ci" -NoNewWindow -PassThru `
  -RedirectStandardOutput "npmci.out" -RedirectStandardError "npmci.err"

# Tip kapisi (bulgular STDOUT'ta)
$p = Start-Process -FilePath "npx.cmd" -ArgumentList "tsc","-p","tsconfig.json","--noEmit" `
  -NoNewWindow -PassThru -RedirectStandardOutput "tsc.out" -RedirectStandardError "tsc.err"
# exit=0 ve tsc.out BOS olmali

# Testler (yerelde DB suite'leri skip olabilir)
npx jest --runInBand src test/rbac test/kvkk test/contracts

# Kabul (CI'da zorunlu olan komutlar)
npm run test:e2e:guard ; npm run test:e2e

# PR
gh pr create --base main --head <branch> --title "<type>(<scope>): <ozet> (Refs #<issue>)" --body-file artifacts/<slice>/pr-body.md
gh pr checks <n> ; gh pr view <n> --json state,mergeStateStatus,reviewDecision
```

> UTF-8/`git add -f`/push doğrulama tuzakları için `docs/agents/repo-operations.md` zorunludur.

---

## 14. Şablonlar

- **PR gövdesi:** v1 §8 (`docs/phase2/master-prompt.md`) alanları aynen geçerlidir: Amaç · Kapsam · Kapsam dışı · Acceptance criteria · Test çıktısı · KVKK/audit etkisi · Rollback · CI run referansı. Bu alanlar boş/placeholder olursa `PR Governance` fail olur.
- **Kanıt dosyası:** v1 §9 formatı kullanılır (`artifacts/<slice>/evidence.md`), ek olarak §8'deki 7 kanıt satırı zorunludur.
- **Yeni bağımlılık gerekçesi:** anayasa gereği PR'da "neden gerekli · alternatifler · stack uyumu" 3 satır.
- **Escalation notu:** `BLOCKED_AUTONOMOUS · <dilim> · neden · denenen yollar · ihtiyaç duyulan karar`.

---

## 15. İlerleme panosu (orkestratör yönetir)

`docs/phase2/progress-v2.md` (A6 günceller, her dilim merge'inde 1 satır):

```text
| Dilim | Ajan | Branch | PR | Head | CI | A7 | Durum |
|---|---|---|---|---|---|---|---|
| R1 | A1 | p1b/leave-decision-impact-gate | #... | <sha> | DB Smoke ✔ | GO | merged |
```

Durum değerleri: `planlandı | kodlanıyor | verify bekliyor | PR açık | CI bekliyor | merged | blocked | insan bekliyor`.

---

## 16. KICKOFF PROMPT (tek parça — bunu oturuma ver)

```text
Sen Faz 1b kapanışının ORKESTRATÖR ajanısın. Amacın: kalan tüm işi (R1–R15) kanıt üreterek bitirip
Faz 1b kapanış kapısını açmak. Kod yazmak senin işin değil; DELEGE ET, DOĞRULA, ENTEGRE ET.

BAĞLAM (zorunlu oku, sırayla):
1) .specify/memory/constitution.md
2) docs/phase2/remaining-plan-v2.md            (kalan envanter, fizibilite, sahiplik matrisi, R1–R15)
3) docs/phase2/master-prompt-v2.md             (bu prompt; §6 döngü, §10 brifler, §11 durma, §12 bitiş)
4) docs/phase1-truth-matrix.md
5) docs/agents/repo-operations.md              (Windows/UTF-8/push/git add -f tuzakları — İHLAL ETME)

MUTLAK KURALLAR:
- Yerelde PostgreSQL ve node_modules YOK. DB/tarayıcı kanıtı yalnız CI'da üretilir; her dilimde CI run URL'i şart.
- Kabul yalnız runtime|pilot-ready + exact head SHA + test yolu + CI URL ile beyan edilir; "PR merge edildi"
  kapanış kanıtı değildir.
- İş sonucunu SQL ile seed etmek ve page.evaluate(fetch) YASAK (test/acceptance-guard fail-closed).
- İnsan kapıları (H1 prod secret, H2 Vercel, H3 review/merge, H4 pilot, H5 DPO, H6 milestone, H7 yedek provası)
  ajan tarafından yapıldı sayılamaz; yalnız hazırlanır ve "bekliyor" raporlanır.
- main'e asla doğrudan push/merge yok; her dilim kendi branch'i + PR'ı.
- Sahiplik matrisi (plan §7) pazarlık dışı; ortak dosyalar yalnız ORCH tarafından değiştirilir.

EKİP (yeteneğine göre ajan aç; alt-ajan/teammate aracı yoksa sıralı kendin yürüt):
- A1 Backend/Leave (R1–R3) · A2 Security/Context (R4) · A3 Notification/Consent (R5–R7)
- A4 Acceptance/E2E (F1 harness genişletme + R10–R11) · A5 UX/A11y (R7 UI payı, R8–R9)
- A6 Docs/Governance (R12–R15) · A7 Verifier (her dilim, üretim kodu değiştirmez)
Her ajanı §10'daki brifle, kendi worktree'si ve branch'iyle başlat.

YÜRÜTME SIRASI (kritik yol):
H1/H2 hazırlanır → A2 (R4) ve A1 (R1→R2→R3) paralel başlar → A3 (R5→R6→R7) → A4 harness genişletmesi + R10 →
A5 (R8→R9) → A6 (R12–R14) paralel → R11 → R15 → §12 kapısı → §12 final raporu.

DÖNGÜ (her dilim): dispatch → §6.2 devir paketi → A7 doğrulama → PR → CI → A6 matrix reconcile → sonraki dilim.
CI beklerken boş durma: sonraki dilimin keşif/plan işini yap.

DURMA: §11 tetikleyicilerinden biri oluşursa kapsamı küçült, BLOCKED_AUTONOMOUS raporla ve somut karar talebiyle insana devret.

ÇIKTI: her turda kısa durum raporu (dilim | ajan | durum | PR | CI | sonraki adım); bitişte §12 final raporu.
Kapı tamamen sağlanmadan "Phase 1b CLOSED" yazma.
```

---

## Sürüm

| Alan | Değer |
|---|---|
| Sürüm | v2.0 (ajan delegasyonlu orkestratör sürümü) |
| Tarih | 2026-09-23 |
| Baz main HEAD | `15c5ab8d44f21b3165cf50658fadbc42b4bd68ae` |
| Bağlayıcılık | `.specify/memory/constitution.md` bu prompt'u geçersiz kılar |
| Önceki sürüm | `docs/phase2/master-prompt.md` v1 (bayat) |
| Bakım | Her merge sonrası A6 matrix/progress günceller; kapsam değişirse bu dosya sürüm atlar |
