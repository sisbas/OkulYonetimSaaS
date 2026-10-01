// Read-only Vercel diagnosis. Raw API responses, environment values and log
// messages are never printed or written to artifacts.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');

const ENV_NAMES = ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET',
  'AUDIT_HMAC_KEY', 'AUDIT_HMAC_KEY_ID', 'AUDIT_HMAC_PREVIOUS_KEYS',
  'KVKK_PSEUDONYM_KEY', 'KVKK_PSEUDONYM_KEY_VERSION'];

function deploymentIdentity(value) {
  return {
    id: /^dpl_[a-zA-Z0-9]+$/.test(value.id ?? value.uid ?? '') ? value.id ?? value.uid : null,
    url: /^[a-zA-Z0-9.-]+\.vercel\.app$/.test(value.url ?? '') ? value.url : null,
    commitSha: /^[a-f0-9]{40}$/.test(value.meta?.githubCommitSha ?? '') ? value.meta.githubCommitSha : null,
    state: ['READY', 'ERROR', 'BUILDING', 'QUEUED', 'CANCELED'].includes(value.readyState ?? value.state)
      ? value.readyState ?? value.state : 'UNKNOWN',
    errorCode: /^[A-Z_0-9]{1,80}$/.test(value.errorCode ?? '') ? value.errorCode : null,
    resourceProvisioningFailure: /resource provisioning failed/i.test(value.errorMessage ?? ''),
    integrationState: ['error', 'pending', 'ready', 'skipped', 'timeout'].includes(value.integrations?.status)
      ? value.integrations.status : null,
    buildPhaseTimestampPresent: Boolean(value.buildingAt || value.duration?.startTime),
  };
}

function classifyLogs(text) {
  return {
    requiredVariableFailures: ENV_NAMES.filter((name) => new RegExp(
      `(?:FATAL:\\s*${name}\\b[^\\n]{0,160}|${name} is required)`, 'i',
    ).test(text)),
    moduleNotFound: /MODULE_NOT_FOUND|Cannot find module/.test(text),
    databaseConnectionFailure: /ECONNREFUSED|ENOTFOUND|password authentication failed|connection timeout/i.test(text),
    resourceProvisioningFailure: /resource provisioning failed/i.test(text),
    permissionDenied: /not authorized|unauthorized|invalid token|forbidden/i.test(text),
  };
}

function productionEnvironmentNames(rows) {
  return ENV_NAMES.filter((name) => rows.some((row) => row.key === name &&
    (Array.isArray(row.target) ? row.target.includes('production') : row.target === 'production')));
}

function windowsArguments(args) {
  return args.map((arg) => '"' + arg.replace(/"/g, '""') + '"').join(' ');
}

async function main() {
  const token = process.env.VERCEL_TOKEN;
  const localConfig = process.env.LOCAL_VERCEL_AUTH_CONFIG;
  if (localConfig && !/^[a-zA-Z0-9:\\/_\.~-]+$/.test(localConfig)) throw new Error('DIAGNOSTIC_UNAVAILABLE');
  const team = process.env.VERCEL_TEAM_ID ?? (localConfig ? 'team_TdQwmVs9Kt3dkxEAla4vr76w' : undefined);
  const project = 'prj_T3niSmmEo4038jwEHEYIjtHXuVZz';
  const previewId = 'dpl_Fpxrha4wkHH4dvAkroi8MKdJvtUk';
  if (!token && !localConfig) throw new Error('VERCEL_TOKEN_UNAVAILABLE');
  function runCli(args) {
    const cliArgs = ['--yes', 'vercel@62.1.0', ...args,
        ...(token ? ['--token', token] : ['--global-config', localConfig]),
        ...(team ? ['--scope', team] : [])];
    const windowsCommand = 'npx.cmd ' + windowsArguments(cliArgs);
    return spawnSync(process.platform === 'win32' ? 'cmd.exe' : 'npx',
      process.platform === 'win32' ? ['/d', '/s', '/c', windowsCommand] : cliArgs, {
        windowsVerbatimArguments: process.platform === 'win32',
        encoding: 'utf8', timeout: 60000, maxBuffer: 2 * 1024 * 1024,
      });
  }
  async function api(path) {
    const url = new URL(path, 'https://api.vercel.com');
    if (team) url.searchParams.set('teamId', team);
    if (localConfig && !token) {
      const result = runCli(['api', url.pathname + url.search, '--method', 'GET', '--raw']);
      if (result.status !== 0) throw new Error('DIAGNOSTIC_UNAVAILABLE');
      return JSON.parse(result.stdout);
    }
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`VERCEL_API_HTTP_${response.status}`);
    return response.json();
  }
  function cli(args) {
    const result = runCli(args);
    return {
      exitCode: result.status,
      timedOut: result.error?.code === 'ETIMEDOUT',
      classifications: classifyLogs(`${result.stdout ?? ''}\n${result.stderr ?? ''}`),
    };
  }
  const projectMetadata = await api(`/v9/projects/${project}`);
  const preview = await api(`/v13/deployments/${previewId}`);
  let productionId = projectMetadata.targets?.production?.id;
  if (!productionId) {
    const deployments = await api(`/v6/deployments?projectId=${project}&target=production&limit=1`);
    productionId = deployments.deployments?.[0]?.uid ?? deployments.deployments?.[0]?.id;
  }
  if (!/^dpl_[a-zA-Z0-9]+$/.test(productionId ?? '')) throw new Error('PRODUCTION_ID_UNAVAILABLE');
  const production = await api(`/v13/deployments/${productionId}`);
  const environment = await api(`/v9/projects/${project}/env`);
  const installations = await api('/v1/integrations/configurations?view=account');
  const installationRows = Array.isArray(installations) ? installations : installations.configurations ?? [];
  const linked = installationRows.filter((item) => item.projects == null || item.projects.includes(project));
  const resourceReports = [];
  for (const item of linked) {
    if (!/^icfg_[a-zA-Z0-9]+$/.test(item.id ?? '')) continue;
    let details;
    try {
      const resourceResponse = await api(`/v1/installations/${item.id}/resources`);
      const resources = Array.isArray(resourceResponse) ? resourceResponse : resourceResponse.resources ?? [];
      details = { readable: true, resources: resources.map((resource) => ({
        id: /^[a-zA-Z0-9_]{1,100}$/.test(resource.id ?? '') ? resource.id : null,
        state: ['ready', 'pending', 'error', 'active', 'suspended', 'failed'].includes(resource.status)
          ? resource.status : 'unknown',
      })) };
    } catch { details = { readable: false }; }
    resourceReports.push({ configurationId: item.id, ...details });
  }
  let buildEvents;
  try {
    const events = await api(`/v3/deployments/${previewId}/events?follow=0`);
    const rows = Array.isArray(events) ? events : events.events ?? [];
    buildEvents = { readable: true, count: rows.length, classifications: classifyLogs(JSON.stringify(rows)) };
  } catch { buildEvents = { readable: false }; }
  const report = {
    mode: 'READ_ONLY_DIAGNOSTIC_NOT_ACCEPTANCE',
    observedAt: new Date().toISOString(),
    checkoutSha: process.env.GITHUB_SHA ?? null,
    preview: deploymentIdentity(preview),
    production: deploymentIdentity(production),
    productionEnvironmentNamesPresent: productionEnvironmentNames(environment.envs ?? []),
    projectContract: {
      frameworkOther: projectMetadata.framework == null,
      installMatchesRepo: projectMetadata.installCommand === 'npm ci',
      buildMatchesRepo: projectMetadata.buildCommand === 'npm run build',
      outputMatchesRepo: projectMetadata.outputDirectory === 'dist/runtime',
      rootMatchesRepo: [null, undefined, '', '.'].includes(projectMetadata.rootDirectory),
      gitCredentialPresent: Boolean(projectMetadata.link?.gitCredentialId),
      repositoryIdMatches: String(projectMetadata.link?.repoId) === '1290014219',
      repositoryNameMatches: projectMetadata.link?.repo === 'OkulYonetimSaaS',
      productionBranchMain: projectMetadata.link?.productionBranch === 'main',
      nodeVersion: /^\d{1,2}\.x$/.test(projectMetadata.nodeVersion ?? '') ? projectMetadata.nodeVersion : null,
    },
    integrationResponseIsArray: Array.isArray(installations),
    linkedIntegrationConfigurations: linked.map((item) => ({
        id: /^icfg_[a-zA-Z0-9]+$/.test(item.id ?? '') ? item.id : null,
        provider: ['neon', 'upstash', 'supabase'].includes(item.slug ?? item.integration?.slug) ? item.slug ?? item.integration.slug : 'other',
        disabled: Boolean(item.disabled),
        needsFinalization: Boolean(item.needsFinalization),
        projectAccess: item.projects == null ? 'all' : 'selected',
      })),
    integrationResources: resourceReports,
    previewBuildEvents: buildEvents,
    previewBuildLogDiagnosis: cli(['inspect', previewId, '--logs']),
    productionRuntimeLogDiagnosis: cli(['logs', '--project', project, '--deployment', productionId,
      '--status-code', '500', '--since', '24h', '--limit', '20', '--json']),
  };
  const destination = 'artifacts/vercel-deployment-diagnosis';
  fs.mkdirSync(destination, { recursive: true });
  fs.writeFileSync(`${destination}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

module.exports = { deploymentIdentity, classifyLogs, productionEnvironmentNames, windowsArguments };
if (require.main === module) main().catch((error) => {
  const code = /^(VERCEL_API_HTTP_\d{3}|VERCEL_TOKEN_UNAVAILABLE|PRODUCTION_ID_UNAVAILABLE)$/.test(error.message)
    ? error.message : 'DIAGNOSTIC_UNAVAILABLE';
  console.error(code);
  process.exitCode = 1;
});
