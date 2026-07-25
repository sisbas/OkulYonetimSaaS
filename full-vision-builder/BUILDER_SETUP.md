# Builder.io Project Setup — GATE 2.5

## Repository boundary

- Repository: `sisbas/OkulYonetimSaaS`
- Allowed directory: `full-vision-builder/**`
- Base branch: `main`
- Builder branch: `builder/ui-shell-v1`
- Commit mode: Pull Requests
- Direct commit: OFF
- Auto-push: OFF
- Merge from Builder: prohibited

## Vercel settings

- Root Directory: `full-vision-builder`
- Framework: Vite
- Build Command: `npm run build`
- Output Directory: `dist`
- Serverless Functions: 0

## Exact first Builder prompt

Create a high-fidelity Turkish enterprise SaaS dashboard for an education operations platform. Preserve the existing React component structure, data labels, maturity disclosures, demo-data notice and design tokens. Work only inside `full-vision-builder/**`.

Do not add or modify routes, fixtures, scenario IDs, reducers, state logic, network requests, authentication, cookies, localStorage, sessionStorage, IndexedDB, API calls, serverless functions, database code or backend files.

Visual direction:
- Modern enterprise SaaS, not a marketing landing page.
- Dense information with strong hierarchy.
- Neutral canvas and white surfaces.
- Restrained phase accents.
- No gradients, glassmorphism, neon, oversized hero sections or decorative charts.
- Desktop shell with fixed left navigation and context bar.
- Tablet shell with drawer navigation and 44px minimum controls.
- Global horizontal overflow is prohibited.

Improve only:
- spacing rhythm
- typography hierarchy
- grid composition
- responsive behavior
- status visibility
- card density
- presentation-mode clarity

Required visible labels:
- Demo Verisi
- Mevcut / Kanıtlı
- Planlanan / Etkileşimli Simülasyon
- Vizyon / Kavramsal Simülasyon
- Canlı AI sonucu değildir. on Phase 3 surfaces

Open a Draft PR when complete. Do not merge.

## Acceptance checks

- 1440×900
- 1280×800
- 1024×768
- 768×1024
- no global horizontal overflow
- no network/auth/storage code
- no backend file changes
- one screen-level primary CTA
- maturity and demo disclosures visible
