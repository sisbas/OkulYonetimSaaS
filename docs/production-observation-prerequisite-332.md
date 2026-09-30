# Production observation prerequisite repair (#332)

Run 36665769448 checked out `9bd8d5dc333cdfe575e2500ff6e2828673edcc84`
and passed runtime integration and build, then failed at the removed
`verify:hosted-demos` npm script. Production Observe never executed and no
observation report was produced.

The replacement required gate executes the canonical runtime boundary suite
and production workflow regression after build. It verifies byte-identical
nonempty shell, JavaScript and CSS build assets, same-origin `/api/v1` routing,
static `/runtime` serving, and the existing authority/no-fake-API contracts.
Runtime integration tests additionally exercise application routing and
observation identity failures. The workflow regression resolves every invoked
npm script against `package.json`, preventing another dead prerequisite.

## Observation remains UNPROVEN

A successful Vercel commit status, including deployment dashboard reference
`8d6SxiumYa8KnGzwzu8n9y3bWZtk`, is not independently verified deployment SHA
evidence. Setting `expected_head_sha` does not establish the deployed SHA.
The existing contract requires checkout SHA and provider-metadata deployment
SHA both to equal the expected SHA, plus target-host binding and real API
reachability. These requirements remain mandatory.

Repository secret names include `VERCEL_API_TOKEN`, `VERCEL_TEAM_ID`, and
`VERCEL_PROTECTION_BYPASS_SECRET`; listing names does not establish credential
validity or metadata access. No production deployment tied to this repair
head has been independently established, so a production dispatch is not
justified yet.

Minimum external action: provide an authoritative production deployment URL/ID
for the exact observation checkout SHA, ensure the workflow credential can
read its Vercel metadata (and bypass protection where applicable), and dispatch
the repaired workflow on that same ref with the matching expected SHA and
target/alias. If auth bootstrap still fails, the authorized production operator
must restore the required JWT environment as described in #332. A fresh report
and uploaded artifact receipt are required before claiming observation PASS.
