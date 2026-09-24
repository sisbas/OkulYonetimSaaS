# §6.2 Devir Paketi — C (bayat doküman senkronu, R1 sonrası)

| Alan | Değer |
|---|---|
| Dilim | **C** (bayat doküman senkronu) |
| Talimat | ORCH `msg_00005` (R1 sonrası bayat dokümanlar) |
| Branch | `p1b/phase2-plan-of-record` |
| PR | **#359** |
| Head | `ce5d082d728eb7bf74c1b275878fd726d33c8aa3` |

## Yapılanlar

1. **`frontend/ux/spec.md` §13**: "Leave approve servisinde `LeaveImpactAnalysisNotReadyException` bulunur"
   ifadesi kaldırıldı (R1 sonrası ölü durum). Commit `60319e4`.
2. **`frontend/runtime/app.js`**: `reasonUi` + `uiStateTitles` + hint map'lerinden `impact_analysis_not_ready`
   kaldırıldı (ölü UI etiketi). Impact workflow adımları (`loadImpact`/`renderImpact`) korundu. Commit `60319e4`.
3. **`IMPACT_ANALYSIS_NOT_READY` kalıntı taraması** (`git grep`): kalan referanslar — aşağıdaki "Kalıntılar" tablosu.

## Kalıntılar (git grep `IMPACT_ANALYSIS_NOT_READY`)

| Dosya | Satır | Durum |
|---|---|---|
| `docs/architecture/phase1-leave-gate3.md` | 39 | Tarihsel gate-3 kaydı — dokunulmadı (bayat değil, karar geçmişi) |
| `docs/frontend/preflight/*.md` | çeşitli | Frontend preflight planları — R1 sonrası gözden geçirilmeli (A5) |
| `docs/frontend/runtime-*/**.md` | çeşitli | Tarihsel runtime planı |
| `src/leaves/leave-errors.ts` | 40 | **Üretim kodu**: `IMPACT_ANALYSIS_NOT_READY` reason-code enum'u (A1 sahipliği; R1'de kullanım değişir) |
| `test/contracts/leave-runtime.contract.spec.ts` | 38 | **Test**: A1 R1 branch'inde güncelleniyor |

## Bulgu — doküman/test çifti (blocker, çözüldü)

- `docs/leaves/leave-runtime-contract.md` senkronu (ORCH msg_00005) **bu PR'a konulamadı**:
  aynı PR'da `test/contracts/leave-runtime.contract.spec.ts` hâlâ eski doküman metnini
  (`IMPACT_ANALYSIS_NOT_READY`, `Approval is fail-closed until #160`) bekliyor →
  **Backend CI run 36059456265 FAILURE**.
- Test dosyası A1 sahipliğinde ve R1 branch'inde (`p1b/leave-decision-impact-gate`) güncelleniyor;
  main'deki test dokümanı kilitliyor. Doküman+test **aynı PR'da** inmelidir.
- Çözüm: `04d8c2c` ile `docs/leaves/leave-runtime-contract.md` geri alındı → Backend CI
  **run 36063086129 SUCCESS**. Doküman senkronu **A1 R1 merge'i sonrası** ayrı A6 diliminde uygulanacak.

## İnsan kapısı gereksinimi

- Yok (bu dilim üretim kodu içermez). Yalnız A1 merge sıralamasına bağlı.
