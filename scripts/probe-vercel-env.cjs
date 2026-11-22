'use strict';

// TEMP diagnostic: lists Vercel project env names/masked-state only.
const token = process.env.VERCEL_API_TOKEN || '';
const team = process.env.VERCEL_TEAM_ID || '';
const project = process.env.VERCEL_PROJECT || 'okulyonetimsaas';

(async () => {
  if (!token) {
    console.log(JSON.stringify({ error: 'VERCEL_TOKEN_MISSING' }));
    return;
  }
  const url = new URL(`https://api.vercel.com/v9/projects/${encodeURIComponent(project)}/env`);
  if (team) url.searchParams.set('teamId', team);
  url.searchParams.set('limit', '100');
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const text = await response.text();
  if (!response.ok) {
    console.log(JSON.stringify({ error: `VERCEL_HTTP_${response.status}`, body: text.slice(0, 200) }));
    return;
  }
  const body = JSON.parse(text);
  const envs = Array.isArray(body.envs) ? body.envs : [];
  console.log(JSON.stringify({
    count: envs.length,
    entries: envs
      .filter((item) => /DATABASE|NEON|JWT/.test(String(item.key || '')))
      .map((item) => ({
        key: item.key,
        target: item.target,
        hasValue: typeof item.value === 'string' && item.value.length > 0,
        valueLength: typeof item.value === 'string' ? item.value.length : 0,
        looksMasked: /[•*]/.test(String(item.value || '')),
      })),
  }));
})().catch((error) => console.log(JSON.stringify({ error: String(error.message || error) })));
