## Amaç

H1 paketindeki operasyonel HMAC rotasyon iddiasını current main gerçeğine göre düzeltmek.
Correction branch head: `{{HEAD}}`. **PR #364 zaten MERGED**; kayıtlı PR head
`90804855a3b952631d257b307bf96542d4bdb4e9`, merge/main
`9bd8d5dc333cdfe575e2500ff6e2828673edcc84` (2026-09-29T19:46:29Z).
Bu branch düzeltmesi merged PR'a veya main'e teslim edilmiş değildir.

## Kapsam

- `artifacts/H1-H2/H1-prod-env-and-health.md`: bağlantısız AuditModule, kayıtlı olmayan verifier ve çalışmayan ring bootstrap kontrolü açıkça belgelenir.
- #367 / PR #366 güvenli wiring + exact-head runtime kanıtı önkoşuldur; rotasyon adımları yürürlükte olmayan taslaktır. Retention exposure/güvenlik kabulü iddia edilmez.
- JWT_KEY_ID mevcut unsupported düzeltmesi main kaynaklarıyla doğrulandı; #358 checkpoint boşluğu açık tutuldu.
- `artifacts/review364/verify-docs.cjs`: salt-okunur scope/source/ruleset guard ve üç negatif mutasyon.
- Bu body şablonunda HEAD/CI alanları yayın sırasında API ile doldurulur.

## Kapsam dışı

Runtime wiring, retention veya checkpoint kodu; production rotasyon/deploy; governance policy değişikliği; issue closure ve merge.

## Acceptance criteria

- [x] H1 rehberi main runtime limitation ve #367 / PR #366 güvenli wiring önkoşulunu açıkça belirtir.
- [x] JWT_KEY_ID unsupported davranışı kaynak assertion ile doğrulanır; retention exposure iddiası yoktur.
- [x] Scope/source guard ve negatif mutasyonlar PASS; acceptance guard 11/11 PASS.
- [ ] Production H1 kanıtı ve güvenli wiring runtime kabulü (insan / ayrı kod dilimi).
- [ ] Bağımsız exact-head review ve H3 owner kararı.
- [ ] POLICY_DEADLOCK #368 owner kararı; governance acceptance.
- [ ] Merged #364 sonrası düzeltmenin main'e teslimi: mevcut PR ile mümkün değil; yeni PR bu yetkili kapsamda açılmadı.

## Test çıktısı

- Planning-only scope guard: PASS — `node artifacts/review364/verify-docs.cjs`; current-main kaynakları + live 10 contexts / 0 formal approvals + OPEN #368; üç negatif doküman mutasyonu reddedildi.
- Changed files: yalnız `artifacts/H1-H2/H1-prod-env-and-health.md` ve `artifacts/review364/{verify-docs.cjs,pr-body.md}`.
- Runtime code: none. Migration: none. Ruleset change: none.
- `npm ci`: PASS (600 packages; exit 0).
- `npm run test:e2e:guard -- --runInBand`: PASS, 1 suite / 11 tests.
- `npm run lint`: PASS (`tsc --noEmit`, exit 0).
- `npm test -- --runInBand`: exit 0; 112 suites / 1002 tests PASS, **9 suites / 37 tests skipped**. Live asset probes ayrıca erken SKIP döndü; bunlar production/DB kabulü değildir.
- İlk geniş test denemesi 120s tool timeout ile kesildi (PASS sayılmadı); 600s bütçeli tekrar 184.841s'de tamamlandı.
- Kanıt bu docs dilimine aittir; ürün kabulü değildir. PASS, #368 engelini kaldırmaz.

## KVKK/audit etkisi

Secret değerleri veya PII eklenmedi. Audit rehberi gerçekleşmemiş bootstrap/route/rotation güvence iddialarını kaldırır; production veya retention işlemi yürütülmedi.

## Rollback

`git revert <bu-PR-merge-sha>`; yalnız rehber ve verification artifacts geri alınır. Şema/veri dönüşümü yok.

## CI run referansı

{{CI}}

## Issue reference

Refs #332 #259 #358 #367 #368.

## İnsan kapısı / PR durumu

**MERGED / correction delivery BLOCKED**. `gh pr ready 364 --undo` kapalı PR olduğu
için reddedildi; Draft yapılamadı. **POLICY_DEADLOCK #368 OPEN**: `progress-v2.md:46–47` AFTER merge resolve ister,
aktif ruleset 19052349 BEFORE merge ister. Policy değişmedi. Bu çalışmada thread resolve edilmedi.
İlk API gözleminde mevcut 2 thread zaten resolved idi (unresolved=0); bu state owner kararı veya bağımsız kabul kanıtı değildir.
