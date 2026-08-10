# WP-07F — PR-2B-A Keystone Task-Routing Cards

> **Karar: GO** — TASK ROUTING / PLANNING ONLY.
>
> Bu kayıt, PR-2B-A için keystone task-routing kartlarının (PR2BA-*) kanonik
> registry'sidir. Kartlar yalnızca routing/planning kaydıdır; hiçbir kartın
> aksiyonu bu pakette uygulanmaz (implementation, PR açma, workflow/deploy
> trigger, merge, issue close, secret kullanımı, reviewer request, check
> trigger, observation execution — hepsi blocked, ayrı yetkilendirme ister).
>
> Kaynaklar: `docs/rag/pr2b-a-body-draft.md`, `docs/rag/pr2b-a-backend-data-authority-matrix.md`,
> `docs/security/pr2b-a-security-kvkk-review.md`, `docs/rag/pr2b-a-draft-package.md` (çıktı paketi).

## Kart şeması

```
task_id | source | target_team | lane | scope | out_of_scope |
acceptance_criteria | required_evidence | blockers | dependencies |
owner | reviewer | status | next_trigger | requires_human_approval
```

## Kartlar (8/8 — evidence_ready)

### PR2BA-DRAFT-BODY

| Alan | Değer |
|---|---|
| source | PR-2b-A draft package |
| target_team | Repository Governance |
| lane | planning |
| scope | draft PR body + acceptance matrix |
| out_of_scope | PR açma/branch/update |
| acceptance_criteria | 11 zorunlu bölüm hazır |
| required_evidence | `docs/rag/pr2b-a-body-draft.md` (Amaç, Karar, Split strategy, Authority boundary, Kapsam, Kapsam dışı, Acceptance criteria, Test çıktısı, Evidence checklist, Security/KVKK, Rollback, Reviewer/check, CEO checkpoint, Architecture blockers, No-close guardrails, Issue reference) |
| blockers | none |
| dependencies | none |
| owner | Repository Governance |
| reviewer | CTO |
| status | **evidence_ready** |
| next_trigger | CTO synthesis |
| requires_human_approval | false (draft) |

### PR2BA-ARCH-AUTHORITY

| Alan | Değer |
|---|---|
| source | PR-2b-A |
| target_team | Architecture & Platform |
| lane | planning |
| scope | routing authority + deployment identity + split strategy |
| out_of_scope | #190/#191 implementation |
| acceptance_criteria | PASS/FAIL identity kuralları sabit |
| required_evidence | `docs/rag/pr2b-a-body-draft.md` §Authority boundary (Karar: GO; metadata-bound routing authority, deployment identity fields, PASS identity rules, literal failureReason FAIL taksonomisi, stale deployment rejection) |
| blockers | none |
| dependencies | PR2BA-DRAFT-BODY |
| owner | Architecture |
| reviewer | CTO |
| status | **evidence_ready** |
| next_trigger | CTO synthesis |
| requires_human_approval | false |

### PR2BA-BACKEND-JSON-AUTHORITY

| Alan | Değer |
|---|---|
| source | PR-2b-A |
| target_team | Backend & Data |
| lane | planning |
| scope | controlled JSON contract + failure mapping |
| out_of_scope | kod değişikliği |
| acceptance_criteria | contract ve forbidden matrix hazır |
| required_evidence | `docs/rag/pr2b-a-backend-data-authority-matrix.md` (Karar: GO; /api/v1 health authority, known endpoint response matrix, controlled JSON contract, forbidden response matrix, failureReason mapping, tenant/branch regression, fixture policy) |
| blockers | none |
| dependencies | PR2BA-ARCH-AUTHORITY |
| owner | Backend |
| reviewer | Architecture |
| status | **evidence_ready** |
| next_trigger | CTO synthesis |
| requires_human_approval | false |

### PR2BA-QA-EVIDENCE-CHECKLIST

| Alan | Değer |
|---|---|
| source | PR-2b-A |
| target_team | Trust & Quality |
| lane | planning |
| scope | evidence checklist + PASS contract |
| out_of_scope | observation execution |
| acceptance_criteria | Unresolved evidence list is explicit: E14=MISSING, E15=UNPROVEN, CI-01..13=PENDING, REV-01=PENDING, REV-02=PENDING, ART-01=PENDING; PASS/FAIL contract preserved |
| required_evidence | `docs/rag/pr2b-a-draft-package.md` §3 (E13–E17, CI-01…13, REV-01/02, ART-01; PASS/FAIL contract) |
| blockers | CEO checkpoint (yalnız execution için) |
| dependencies | PR2BA-BACKEND-JSON-AUTHORITY |
| owner | QA |
| reviewer | CTO |
| status | **evidence_ready** |
| next_trigger | execution authorization |
| requires_human_approval | true (execution için) |

### PR2BA-SECURITY-KVKK-CHECKLIST

| Alan | Değer |
|---|---|
| source | PR-2b-A |
| target_team | Security/KVKK |
| lane | planning |
| scope | 16 maddelik checklist + allowlist |
| out_of_scope | secret kullanımı |
| acceptance_criteria | checklist PASS kuralı |
| required_evidence | `docs/security/pr2b-a-security-kvkk-review.md` (Karar: GO; 16 madde ✅, allowed/forbidden artifact fields, redaction requirements, secret/authority boundary, PASS rule, blocking risks) |
| blockers | none |
| dependencies | PR2BA-DRAFT-BODY |
| owner | Security |
| reviewer | CTO |
| status | **evidence_ready** |
| next_trigger | CTO synthesis |
| requires_human_approval | true (execution secret kullanımı) |

### PR2BA-ROLLBACK-NOCLOSE

| Alan | Değer |
|---|---|
| source | PR-2b-A |
| target_team | Release Governance |
| lane | planning |
| scope | rollback plan + #185/#145 no-close guardrails |
| out_of_scope | issue close |
| acceptance_criteria | guardrail koşulları sabit |
| required_evidence | `docs/rag/pr2b-a-draft-package.md` §5 (rollback plan, deployment rollback decision tree, failure-handling rules, rollback surfaces) + §8 (#185/#145 closure koşulları, triage matrix, follow-up conditions, rule set) |
| blockers | none |
| dependencies | PR2BA-ARCH-AUTHORITY |
| owner | Release Governance |
| reviewer | CTO |
| status | **evidence_ready** |
| next_trigger | CTO synthesis |
| requires_human_approval | false |

### PR2BA-REVIEWER-CHECK-MATRIX

| Alan | Değer |
|---|---|
| source | PR-2b-A |
| target_team | Release Governance |
| lane | planning |
| scope | reviewer/check matrix |
| out_of_scope | reviewer request/check trigger |
| acceptance_criteria | 10 check + 8 rol matrisi |
| required_evidence | `docs/rag/pr2b-a-draft-package.md` §6 (reviewer matrix 8 rol, check matrix 10 check, required before ready/merge, CEO authority checkpoint, required status checks, reviewer'lar) |
| blockers | none |
| dependencies | PR2BA-DRAFT-BODY |
| owner | Release Governance |
| reviewer | CTO |
| status | **evidence_ready** |
| next_trigger | PR açılışında (ayrı yetki) |
| requires_human_approval | true (tetikleme) |

### PR2BA-CTO-SYNTHESIS

| Alan | Değer |
|---|---|
| source | PR-2b-A |
| target_team | CTO |
| lane | planning |
| scope | final draft package |
| out_of_scope | execution |
| acceptance_criteria | 10 bölüm derlendi (9 team deliverable + CTO Final Synthesis) |
| required_evidence | tüm kart çıktıları → `docs/rag/pr2b-a-draft-package.md` (1 Draft PR Body · 2 Acceptance Matrix · 3 Evidence Checklist · 4 Security/KVKK Checklist · 5 Rollback Plan · 6 Reviewer/Check Matrix · 7 CEO Authority Checkpoint · 8 No-Close Guardrails · 9 Task-Routing Cards · 10 CTO Final Synthesis) |
| blockers | none |
| dependencies | PR2BA-DRAFT-BODY, PR2BA-ARCH-AUTHORITY, PR2BA-BACKEND-JSON-AUTHORITY, PR2BA-QA-EVIDENCE-CHECKLIST, PR2BA-SECURITY-KVKK-CHECKLIST, PR2BA-ROLLBACK-NOCLOSE, PR2BA-REVIEWER-CHECK-MATRIX |
| owner | CTO |
| reviewer | CEO (yalnız execution) |
| status | **evidence_ready** |
| next_trigger | bu paket (çalıştı — PROMPT 9) |
| requires_human_approval | false (draft) |

## Owner map

| Team | Kartlar |
|---|---|
| Repository Governance | PR2BA-DRAFT-BODY |
| Architecture | PR2BA-ARCH-AUTHORITY |
| Backend & Data | PR2BA-BACKEND-JSON-AUTHORITY |
| Trust & Quality | PR2BA-QA-EVIDENCE-CHECKLIST |
| Security/KVKK | PR2BA-SECURITY-KVKK-CHECKLIST |
| Release Governance | PR2BA-ROLLBACK-NOCLOSE, PR2BA-REVIEWER-CHECK-MATRIX |
| CTO | PR2BA-CTO-SYNTHESIS |

## Dependencies (DAG)

```
PR2BA-DRAFT-BODY ──┬─► PR2BA-ARCH-AUTHORITY ──► PR2BA-BACKEND-JSON-AUTHORITY ──► PR2BA-QA-EVIDENCE-CHECKLIST
                  ├─► PR2BA-SECURITY-KVKK-CHECKLIST
                  └─► PR2BA-REVIEWER-CHECK-MATRIX
PR2BA-ARCH-AUTHORITY ──► PR2BA-ROLLBACK-NOCLOSE
tüm kartlar ──► PR2BA-CTO-SYNTHESIS
```

## Blocked actions

Implementation · workflow/deploy trigger · merge · issue close · secret use ·
auto-assignment (CTO kararı olmadan) · reviewer request · check trigger ·
observation execution.

## CTO handoff (synthesis kaydı)

- 8 kart `evidence_ready` durumunda **PROMPT 9** (CTO Final Synthesis) çalıştı:
  çıktı paketi `docs/rag/pr2b-a-draft-package.md` (10 bölüm derlenmiş: 9 team deliverable + CTO Final Synthesis).
- Execution kartları (PR2BA-QA-EVIDENCE-CHECKLIST, PR2BA-SECURITY-KVKK-CHECKLIST,
  PR2BA-REVIEWER-CHECK-MATRIX) `requires_human_approval=true` ile CEO checkpoint'e
  bağlıdır; bu paket hiçbir execution yetkisi vermez.
- PR2BA-CTO-SYNTHESIS `in_progress → evidence_ready`; sonraki trigger'lar ayrı
  yetkilendirme ile (Keystone K1–K6 / execution authorization).

<!-- PR-2B-A KEYSTONE ROUTING: PLANNING ONLY / NO MUTATION / NO TRIGGER / NO CLOSE / NO SECRET USE -->
