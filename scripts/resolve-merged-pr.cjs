'use strict';

// Association indexing can lag behind the push event. Only the exact merged
// main PR is evidence; an ancestor commit's associated PR is not sufficient.
async function resolveMergedPullRequest({
  github, owner, repo, mergeSha,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  if (!/^[0-9a-f]{40}$/i.test(mergeSha)) throw new Error('Invalid merge SHA');
  const delays = [1000, 3000, 6000];
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    const associated = await github.paginate(
      github.rest.repos.listPullRequestsAssociatedWithCommit,
      { owner, repo, commit_sha: mergeSha, per_page: 100 },
    );
    const matches = new Map();
    for (const item of associated) {
      if (!item.merged_at || item.base?.ref !== 'main') continue;
      const { data: pr } = await github.rest.pulls.get({
        owner, repo, pull_number: item.number,
      });
      if (pr.merged === true && pr.base?.ref === 'main' &&
          pr.base?.repo?.full_name?.toLowerCase() === (owner + '/' + repo).toLowerCase() &&
          pr.merge_commit_sha === mergeSha &&
          Number.isFinite(Date.parse(pr.merged_at)) &&
          /^[0-9a-f]{40}$/i.test(pr.head?.sha ?? '')) {
        matches.set(pr.number, pr);
      }
    }
    if (matches.size > 1) throw new Error('Ambiguous exact merged PR association');
    if (matches.size === 1) return { pr: [...matches.values()][0], attempts: attempt + 1 };
    if (attempt < delays.length) await wait(delays[attempt]);
  }
  // Absence is not approval. Caller must record an incident and fail the job.
  return { pr: null, attempts: delays.length + 1 };
}

module.exports = { resolveMergedPullRequest };
