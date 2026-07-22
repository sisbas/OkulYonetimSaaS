# Demo Responsive Release Candidate

Parent tracker: GitHub Issue #120  
Branch: `demo/responsive-release-candidate`  
Base: `main`

## Scope

This release candidate is limited to demo frontend responsive CSS, minimum UI markup, a standalone responsive static test, and this documentation. Route names, fixture seed, conflict engine, conflict counts, backend/API behavior, auth/permission contracts, persistent storage and real communication behavior are unchanged.

## Before / after

| Area | Before | After |
| --- | --- | --- |
| Tablet navigation | Sidebar remained until 760px | Compact navigation begins at 820px; sidebar does not reduce the 768×1024 grid area |
| Global overflow | No explicit root-level guard | `html`, `body`, app shell and workspace constrain global horizontal overflow |
| Schedule grid | Local scroll existed but was subtle | Local scroll is keyboard-focusable, contained, sticky-labeled and has a visible scroll hint |
| Grid readability | Event content present | Course, group, teacher, room, time and textual state remain visible |
| Primary CTA | Schedule validation was secondary; notification cards could show primary actions | One screen-level primary CTA; card actions use secondary hierarchy |
| State communication | Several states relied heavily on color/context | Conflict, validation, leave, attendance and notification states include text labels |
| Demo boundary | Demo labels existed | Action labels and messages explicitly use Demo, Simülasyon or Gerçek işlem yapılmadı |
| Modal accessibility | Escape and backdrop close existed | Escape/backdrop retained; focus entry, loop and return added; sticky footer keeps actions accessible |

## Viewport verification matrix

| Check | 1440×900 | 1024×768 | 768×1024 |
| --- | --- | --- | --- |
| Global overflow | PASS | PASS | PASS |
| Sidebar/navigation | Full sidebar | Full sidebar | Compact tablet navigation |
| Grid readability | PASS | PASS with local scroll | PASS with local scroll |
| Primary CTA visible | PASS | PASS | PASS |
| Demo Verisi visible | PASS | PASS | PASS |
| Modal visible/closable | PASS | PASS | PASS |
| Conflict cards | PASS | PASS | PASS |
| Published read-only | Unchanged | Unchanged | Unchanged |
| Leave/attendance/notification demo actions | PASS | PASS | PASS |
| Fixture reset | Unchanged | Unchanged | Unchanged |

## Validation

```bash
node demo-frontend/smoke-test.js
node demo-frontend/responsive-test.js
```

Browser screenshots are required for `/demo/schedule` at all three target viewports. CI/Vercel results must be recorded against the Draft PR head SHA before UX PASS.

## Remaining Sev-3 debt

- Long Turkish course names can still increase event-card height.
- Tablet users may need one initial cue before discovering horizontal scroll despite the visible hint.
- 1024×768 remains on the full-sidebar layout by design; compact mode can be reconsidered after the presentation.
- Visual regression screenshots are not yet automated in CI.

## Rollback

Revert the release-candidate commits. No migration, fixture rollback, API rollback or storage cleanup is required.
