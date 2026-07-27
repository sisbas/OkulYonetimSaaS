# Production Frontend Preflight: Canonical Reason-Code → UI State Matrix

Issue: #145  
Status: preflight artefact.  
Implementation: none.

## Purpose

This matrix defines how the runtime frontend must translate canonical backend reason codes into safe user-facing UI states after #144 stabilizes the API/contract layer.

The goal is to prevent fake success states, cross-tenant record discovery, stale overwrite and ambiguous leave/coverage decisions.

## Global rules

1. Reason codes are server-authored. The browser must not invent authoritative reason codes.
2. Forbidden and not-visible states must be non-enumerating unless the response explicitly confirms same-scope empty state.
3. Stale version states must never auto-retry with mutation.
4. Conflict states must not show success until the server confirms resolution.
5. Empty state is not the same as forbidden state.
6. Offline state must not fall back to localStorage or fake API authority.
7. UI copy must avoid exposing raw internal permission keys or sensitive object identifiers.

## Canonical matrix

| Canonical reason code | HTTP class | UI state | User-facing message stance | Control behavior | Enumeration risk control |
| --- | --- | --- | --- | --- | --- |
| `AUTH_REQUIRED` | 401 | auth_required | Oturum süresi doldu. Yeniden giriş gerekli. | Disable protected actions. | Does not mention target object. |
| `TENANT_CONTEXT_REQUIRED` | 400/403 | tenant_context_required | Kurum bağlamı doğrulanamadı. | Disable route actions. | Does not infer tenant from client. |
| `BRANCH_CONTEXT_REQUIRED` | 400/403 | branch_context_required | Şube bağlamı doğrulanamadı. | Disable branch actions. | Does not infer branch from client. |
| `FORBIDDEN` | 403 | forbidden_non_enumerating | Bu işlem için yetkiniz yok. | Hide/disable action. | Same message for denied and hidden records. |
| `RESOURCE_NOT_VISIBLE` | 403/404 | forbidden_non_enumerating | Bu kayıt görüntülenemiyor. | Back to safe landing route. | Do not reveal existence. |
| `RESOURCE_NOT_FOUND_SAME_SCOPE` | 404 | empty_or_not_found_same_scope | Kayıt bulunamadı veya silinmiş olabilir. | Back/reload affordance. | Only allowed when API confirms same-scope lookup. |
| `LEAVE_QUEUE_EMPTY` | 200 | empty_same_scope | Bekleyen izin talebi yok. | Show neutral empty state. | Same-scope only. |
| `DAILY_QUEUE_EMPTY` | 200 | empty_same_scope | Açık operasyon aksiyonu yok. | Show neutral empty state. | Same-scope only. |
| `VALIDATION_FAILED` | 422 | validation_error | Alanları kontrol edin. | Keep form state in memory. | No sensitive field echo. |
| `STALE_VERSION` | 409/412 | stale_version | Kayıt güncellendi. Yenilemeden işlem yapılamaz. | Disable submit until refresh. | No auto-overwrite. |
| `HARD_CONFLICT_PRESENT` | 409/422 | conflict_blocking | Çakışma çözülmeden işlem tamamlanamaz. | Keep blocking panel visible. | Show only same-scope conflict projection. |
| `COVERAGE_REQUIRED` | 409/422 | coverage_required | Bu izin için ders kapsamı tamamlanmalı. | Disable final decision if required. | Do not infer candidate availability. |
| `ASSIGNMENT_CONFLICT` | 409 | conflict_blocking | Görevlendirme mevcut programla çakışıyor. | Keep assignment modal open. | Show API-returned conflict projection only. |
| `CANDIDATE_UNAVAILABLE` | 409/422 | candidate_unavailable | Seçilen aday bu ders için uygun değil. | Require another server-listed candidate. | No client-side candidate solver. |
| `DECISION_LOCKED` | 409 | locked_state | Bu talep artık değiştirilemez. | Disable decision controls. | No local override. |
| `ATTENDANCE_SESSION_LOCKED` | 409 | locked_state | Yoklama oturumu kilitli. | Disable edit controls. | No client-only update. |
| `RATE_LIMITED` | 429 | rate_limited | Kısa süre sonra tekrar deneyin. | Disable repeat action briefly. | No sensitive details. |
| `SERVER_ERROR` | 500 | error_retryable | İşlem tamamlanamadı. | Retry read only; no mutation retry by default. | Do not expose stack/request IDs unless safe. |
| `OFFLINE_OR_UNAVAILABLE` | network | offline_or_unavailable | Bağlantı kurulamadı. | Disable mutation, allow read retry. | No local authority fallback. |

## Forbidden vs empty distinction

| Scenario | Correct UI | Incorrect UI |
| --- | --- | --- |
| Teacher opens another teacher's leave detail | forbidden_non_enumerating | "Bu talep Ahmet öğretmene ait". |
| Operations Manager opens another branch leave detail | forbidden_non_enumerating | "Bu kayıt başka şubede". |
| Branch leave queue is genuinely empty | empty_same_scope | forbidden, error or fake sample rows. |
| Candidate API denied | forbidden_non_enumerating | "Aday yok" unless same-scope empty is explicit. |
| Same-scope record deleted after listing | empty_or_not_found_same_scope | cross-tenant hint. |

## Message copy guidance

- Use neutral Turkish, action-oriented copy.
- Do not expose raw permission keys, tenant IDs, branch IDs, user IDs or internal resource IDs.
- Prefer: "Bu kayıt görüntülenemiyor."  
  Avoid: "Bu kayıt başka kuruma ait." 
- Prefer: "Kayıt güncellendi. Lütfen yenileyin."  
  Avoid: silent overwrite or automatic mutation retry.
- Prefer: "Çakışma çözülmeden işlem tamamlanamaz."  
  Avoid: fake success or local-only solver.

## Runtime verification expectations

After #144 and implementation:

- Browser E2E must assert forbidden/non-enumerating copy for cross-scope attempts.
- Browser E2E must assert stale mutation does not auto-retry.
- Browser E2E must assert hard conflict blocks decision/assignment success.
- Scanner must confirm no demo fixture, fake API or localStorage authority path.

## Acceptance coverage

- Reason-code/UI state matrix ready: yes.
- Cross-tenant non-enumerating behavior represented: yes.
- Runtime implementation added: no.
