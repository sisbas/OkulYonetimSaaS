# WP-07F Production Reachability and Observation

## Selected topology

```text
Vercel project + Vercel Node serverless entry + Nest application + /api/v1/* file-system routing
```

The bounded production routing decision is:

- Static hosted output remains `hosted-demos-static-dist`.
- `/runtime`, `/`, `/demo`, and `/full-vision` remain static hosted contracts.
- `/api/v1` and `/api/v1/*` are served by Vercel API functions under `api/v1`.
- The API entry boots the existing Nest `AppModule`, keeps the `api/v1` global prefix, and returns application-controlled JSON for known API paths.
- No CORS workaround is introduced.
- No fake API is introduced.

## Observation identity contract

The production observation report is written inside the uploaded artifact at:

```text
artifacts/wp07f-production-observation/observation-identity.json
```

The identity file must include:

- `commitSha`
- `branchRef`
- `productionDeploymentId`
- `productionDeploymentUrl`
- `productionAlias`
- `targetBaseUrl`
- `observationTimestamp`
- `artifactName`
- `reportContentDigest`
- `deploymentCommitSha`
- `deploymentCommitSource`
- `deploymentMetadataStatus`
- `apiReachabilityStatus`
- `overallStatus`
- `checks[]`

`reportContentDigest` is the digest of `observation-identity.json` content before upload. It is not the GitHub uploaded artifact archive digest. The GitHub artifact `id`, `name`, and `digest` remain the Actions artifact API or `actions/upload-artifact` output source of truth and must be recorded separately during evidence reconciliation.

The report must not contain an `artifactDigest` field because that name is reserved for the uploaded artifact source-of-truth digest.

`overallStatus` is `FAIL` whenever a known `/api/v1/*` endpoint is not application-controlled JSON or looks like Vercel platform `NOT_FOUND`.

## Required observation command

```bash
OBSERVATION_TARGET_BASE_URL="https://<production-alias-or-deployment>" \
PRODUCTION_ALIAS="https://<production-alias>" \
PRODUCTION_DEPLOYMENT_URL="https://<deployment-url>" \
PRODUCTION_DEPLOYMENT_ID="<deployment-id>" \
GITHUB_SHA="<commit-sha>" \
GITHUB_REF_NAME="<branch-or-ref>" \
npm run observe:production-runtime
```

Deliberate failure mode:

```bash
OBSERVATION_SELF_TEST_UNREACHABLE_API=true npm run observe:production-runtime
```

In that mode the observation must fail if the API path is not application-controlled JSON.

## Rollback

This PR does not introduce a database migration and does not require data rollback.

Rollback is bounded to reverting the production reachability PR merge commit:

```bash
git revert <pr-1-merge-commit-sha>
```

Expected reverted surfaces:

```text
api/v1/index.ts
api/v1/[...path].ts
vercel.json
scripts/observe-production-runtime.js
scripts/build-hosted-demos-static.js
scripts/test-hosted-demos-static-deployment.js
.github/workflows/wp07f-production-observation.yml
docs/wp-07/production-reachability-observation.md
package.json
```

## Non-goals

- No Attendance implementation.
- No Parent Notification implementation.
- No production PII fixture.
- No UI feature expansion.
- No PR #182 reopen.
- No governance bypass.
