# Repository Agent Rules

## Full Vision sales UX boundary

Changes for the Full Vision sales frontend are limited to `full-vision-builder/**` and `.builder/rules/**` unless a Product Owner explicitly approves a broader scope.

### Allowed

- App shell and component composition
- Grid/flex layout, spacing, typography and responsive behavior
- Visual hierarchy, card density, modal/drawer composition
- Approved Turkish sales copy placement
- Presentation Mode and Explore Mode visual treatment
- Static, synthetic demo-only interactions that do not alter canonical product behavior

### Protected

Do not change or duplicate the canonical behavior contracts in `full-vision-demo/**`:

- route IDs and route paths
- scenario IDs
- fixture IDs and fixture graph
- reducers and state transitions
- reset behavior
- query allowlist
- claim classification
- risk or conflict outcomes
- legacy aliases

Do not add or change backend, API, authentication, network, storage, Vercel root runtime or package dependencies.

### Working method

- One bounded UX package per pull request.
- Draft pull requests only until Product Owner visual approval.
- Direct commits to `main`, Builder merge and automatic push are prohibited.
- Never claim completion without a reviewable visual proof set, exact head SHA, changed-file list and QA results.
- Sales Mode is the default surface; Explore Mode contains the full module catalogue and technical disclosures.
- Full Vision Demo remains the behavior source-of-truth until explicit parity acceptance.
