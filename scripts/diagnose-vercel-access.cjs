// GET-only authorization probes. Response bodies (including user profiles and
// environment values) are deliberately neither parsed nor logged.
const fs = require('node:fs');

async function main() {
  const token = process.env.VERCEL_TOKEN;
  if (!token) throw new Error('TOKEN_UNAVAILABLE');
  const project = 'prj_T3niSmmEo4038jwEHEYIjtHXuVZz';
  async function status(path, scoped) {
    const url = new URL(path, 'https://api.vercel.com');
    if (scoped && process.env.VERCEL_TEAM_ID) url.searchParams.set('teamId', process.env.VERCEL_TEAM_ID);
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000),
    });
    await response.body?.cancel();
    return response.status;
  }
  const report = {
    mode: 'READ_ONLY_ACCESS_PROBE_NOT_DEPLOYMENT_ACCEPTANCE',
    observedAt: new Date().toISOString(),
    checkoutSha: process.env.GITHUB_SHA ?? null,
    tokenIdentityHttpStatus: await status('/v2/user', false),
    projectWithTeamHttpStatus: await status(`/v9/projects/${project}`, true),
    projectWithoutTeamHttpStatus: await status(`/v9/projects/${project}`, false),
  };
  fs.mkdirSync('artifacts/vercel-deployment-diagnosis', { recursive: true });
  fs.writeFileSync('artifacts/vercel-deployment-diagnosis/access.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
main().catch(() => { console.error('ACCESS_PROBE_UNAVAILABLE'); process.exitCode = 1; });
