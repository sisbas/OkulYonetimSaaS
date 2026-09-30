## Amaç

Merged #364 sonrası H1 paketindeki operasyonel HMAC rotasyon iddiasını current main
gerçeğine göre düzelten **yeni Draft correction PR**.
Current correction PR head: `{{HEAD}}`. **PR #364 tarihsel olarak MERGED**; kayıtlı eski PR head
`90804855a3b952631d257b307bf96542d4bdb4e9`, merge/main
`9bd8d5dc333cdfe575e2500ff6e2828673edcc84` (2026-09-29T19:46:29Z).
`origin/main` bu branch'e normal merge ile alındı; yalnız H1 rehberindeki çelişkili
rotasyon iddiası conflict üretti ve kaynakla doğrulanan BLOKLU rehber korunarak çözüldü.
Bu yeni PR düzeltmeyi main'e taşımak için açılır; henüz main'e merge edilmedi.

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
- [ ] Bu correction PR'ın H3 owner review/merge ile main'e teslimi.

## Test çıktısı

- **Post-merge** planning-only scope guard: PASS — `node artifacts/review364/verify-docs.cjs`; scope baz main `9bd8d5dc333cdfe575e2500ff6e2828673edcc84`, current-main kaynakları + live 10 contexts / 0 formal approvals + OPEN #368; üç negatif doküman mutasyonu reddedildi, conflict marker yok.
- Changed files: yalnız `artifacts/H1-H2/H1-prod-env-and-health.md` ve `artifacts/review364/{verify-docs.cjs,pr-body.md}`.
- Runtime code: none. Migration: none. Ruleset change: none.
- Bağımlılıklar mevcut H1 worktree'de önceki `npm ci` ile kurulmuştu (tarihsel 600 packages / exit 0); merge sonrası lockfile değişmedi, bu devam turunda install tekrar edilmedi.
- **Post-merge** `npm run lint`: PASS (`tsc --noEmit`, exit 0).
- **Post-merge** `npm run test:e2e:guard -- --runInBand`: PASS, 1 suite / 11 tests (3.895s).
- **Post-merge** `npm test -- --runInBand`: exit 0; 112 suites / 1002 tests PASS, **9 suites / 37 tests skipped** (36.041s). Live asset probes ayrıca erken SKIP döndü; bunlar production/DB kabulü değildir.
- **Post-merge** `npm run build`: PASS (TypeScript + runtime asset copy, exit 0).
- Eski branch `862780f94f0d1be7466cd54d2b6a75cd289ef8f2` CI/local sonuçları tarihsel kanıttır; yeni current-head CI yerine kullanılmaz.
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

**Yeni correction PR: Draft / merge-ready değil.** #364 merged tarihsel PR'dır,
bu correction PR'ın readiness'ini göstermez. **POLICY_DEADLOCK #368 OPEN**: `progress-v2.md:46–47` AFTER merge resolve ister,
aktif ruleset 19052349 BEFORE merge ister. Policy değişmedi. Bu çalışmada thread resolve edilmedi.
Eski #364'ün 2 thread'i önceki API gözleminde zaten resolved idi; bu state yeni PR için
owner kararı veya bağımsız kabul kanıtı değildir. Retention veya H1 production kabulü yapılmadı.
