# Builder.io Project Setup — GATE 2.6 Sales UX

## Repository boundary

- Repository: `sisbas/OkulYonetimSaaS`
- Allowed directory: `full-vision-builder/**`
- Base branch: `main`
- Builder branch: `builder/sales-ux-simplification-v1`
- Commit mode: Draft Pull Requests or Pull Requests
- Direct commit: OFF
- Auto-push: OFF until first visual acceptance
- Merge from Builder: prohibited

## Source-of-truth boundary

- Behavior source-of-truth: `full-vision-demo/**` route, scenario, claim, fixture, reducer, reset, query allowlist and legacy alias contracts.
- Visual frontend source-of-truth target: `full-vision-builder/**`.
- The Builder frontend must not copy or reimplement behavior contracts. A later read-only adapter may consume them after Product Owner acceptance.
- `full-vision-demo/` remains the safe fallback until explicit behavior parity acceptance.

## Vercel settings

- Root Directory: `full-vision-builder`
- Framework: Vite
- Build Command: `npm run build`
- Output Directory: `dist`
- Serverless Functions: 0

## Exact Builder prompt — PR 1

```text
Work only inside full-vision-builder/** on branch builder/sales-ux-simplification-v1. Open a Draft Pull Request against main and reference Issue #126. Do not merge.

Goal: simplify the Full Vision Demo into one high-fidelity Turkish enterprise SaaS product with two usage modes: Sales Mode and Explore / Tüm Modüller Mode. This is a frontend visual-composition task, not a new feature or backend task.

Default Sales Mode navigation must show at most six choices:
1. Yönetici Özeti
2. Günlük Operasyon
3. Program ve İzin Sürekliliği
4. Akademik Gelişim
5. Akıllı Yönetim Vizyonu
6. Tüm Modüller

PR 1 scope:
- global sales shell
- five-stop navigation
- Presentation Mode
- Explore Mode transition
- Yönetici Özeti
- simplified visual tokens
- compact Demo Verisi and maturity labels

Preserve all existing route, scenario, fixture, reducer, reset, query allowlist, claim and legacy alias contracts in full-vision-demo/**. Do not copy fixture or scenario logic. Do not add API, auth, network, cookie, token, localStorage, sessionStorage, IndexedDB, serverless function, backend changes or package dependencies.

Visual direction:
- modern enterprise SaaS
- neutral canvas and white/low-contrast surfaces
- border-first components
- clear left-aligned hierarchy
- 8px spacing base
- restrained shadows
- desktop sidebar 240–264px
- tablet drawer and compact step control
- 44px minimum targets
- no global horizontal overflow

Do not use gradients, glassmorphism, neon colors, oversized hero headings, decorative charts, excessive rounded cards, nested card stacks or fake “AI thinking” animations.

Each sales surface must have one main message, one primary CTA, at most two secondary actions, at most four metrics, one dominant workspace, at most one support panel, one short problem statement, one institution-benefit statement, one visible maturity label and a compact Demo Verisi label.

Phase 3 must visibly state: “Canlı AI sonucu değildir. Önceden hazırlanmış kavramsal simülasyondur.”

Builder-editable inputs are limited to title, subtitle, description, helperText, label, icon, tone, density, layout, emphasis and primaryActionLabel. Never expose route, entity, fixture, reducer or scenario values as Builder inputs.

Produce visual proof for 1440×900, 1280×800, 1024×768 and 768×1024. Report console, overflow, keyboard/focus and dead CTA results. Do not report completion without exact head SHA, changed files, screenshots and Vercel Preview URL.
```

## Registered component manifest

The SDK-agnostic bounded registry is `src/builder-registry.ts`. It lists the approved visual components and the editable/protected input names. An actual Builder.io SDK binding must consume this manifest without adding a new dependency in this PR.

## Acceptance checks

- 1440×900
- 1280×800
- 1024×768
- 768×1024
- no global horizontal overflow
- no network/auth/storage code
- no backend file changes
- no package dependency changes
- one screen-level primary CTA
- maturity and demo disclosures visible
- Escape closes overlays and presentation mode
- all visible CTAs have a bounded frontend action
