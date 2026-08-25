"""HCO GitHub connector — gh-cli wrapper. NO plaintext token; uses `gh auth`.

Fail-closed: every call returns structured (ok, data, error). A transport error or
missing required status is never treated as success.
"""
from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass


@dataclass
class GHResult:
    ok: bool
    data: dict | None = None
    error: str = ""


def _run(args: list[str], timeout: int = 60) -> GHResult:
    try:
        proc = subprocess.run(
            ["gh", *args],
            capture_output=True, text=True, timeout=timeout, check=False,
            encoding="utf-8", errors="replace",
        )
    except subprocess.TimeoutExpired:
        return GHResult(ok=False, error="gh timeout")
    if proc.returncode != 0:
        return GHResult(ok=False, error=(proc.stderr or proc.stdout).strip()[:500])
    return GHResult(ok=True, data={"raw": proc.stdout.strip()})


def gh_available() -> bool:
    r = _run(["auth", "status"])
    return r.ok


def required_checks(repo: str, branch: str = "main") -> GHResult:
    """Read the active ruleset required status checks. Fail-closed if missing."""
    r = _run(["api", f"repos/{repo}/branches/{branch}/protection"])
    if not r.ok:
        return r
    try:
        prot = json.loads(r.data["raw"])
        checks = [
            c.get("context") or c.get("integration_id")
            for c in prot.get("required_status_checks", {}).get("contexts", [])
        ]
        return GHResult(ok=True, data={"checks": [c for c in checks if c]})
    except (json.JSONDecodeError, KeyError, TypeError) as e:
        return GHResult(ok=False, error=f"parse protection failed: {e}")


def check_runs_for_sha(repo: str, head_sha: str) -> GHResult:
    r = _run(["api", f"repos/{repo}/commits/{head_sha}/check-runs",
              "--jq", "{runs: [.check_runs[] | {name: .name, status: .status, conclusion: .conclusion}]}"])
    if not r.ok:
        return r
    try:
        payload = json.loads(r.data["raw"])
        return GHResult(ok=True, data={"runs": payload.get("runs", [])})
    except json.JSONDecodeError:
        # fail-closed: unparseable evidence is not success
        return GHResult(ok=False, error="check-runs payload unparseable")


def branch_is_current(repo: str, branch: str, base: str = "main") -> GHResult:
    """True only if branch tip == base tip (no stale divergence)."""
    rb = _run(["api", f"repos/{repo}/branches/{branch}", "--jq", ".commit.sha"])
    rm = _run(["api", f"repos/{repo}/branches/{base}", "--jq", ".commit.sha"])
    if not (rb.ok and rm.ok):
        return GHResult(ok=False, error="branch/base resolve failed")
    return GHResult(ok=True, data={"current": rb.data["raw"] == rm.data["raw"],
                                   "branch_sha": rb.data["raw"], "base_sha": rm.data["raw"]})


def create_pr(repo: str, title: str, body: str, head: str, base: str = "main") -> GHResult:
    """Human-gated: only invoked under explicit approval protocol."""
    r = _run(["pr", "create", "--repo", repo, "--title", title, "--body", body,
              "--head", head, "--base", base])
    if not r.ok:
        return r
    return GHResult(ok=True, data={"url": r.data["raw"]})


def create_issue(repo: str, title: str, body: str, labels: list[str] | None = None) -> GHResult:
    """Open a disposable issue for canary proof. Human-gated."""
    args = ["issue", "create", "--repo", repo, "--title", title, "--body", body]
    if labels:
        args += ["--label", ",".join(labels)]
    r = _run(args)
    if not r.ok:
        return r
    return GHResult(ok=True, data={"url": r.data["raw"]})


def get_pr_head_sha(repo: str, pr_number: int) -> GHResult:
    """Resolve the exact head SHA of an open PR (real evidence binding)."""
    r = _run(["api", f"repos/{repo}/pulls/{pr_number}", "--jq", ".head.sha"])
    if not r.ok:
        return r
    return GHResult(ok=True, data={"head_sha": r.data["raw"].strip()})


def create_branch_from(repo: str, new_branch: str, base_branch: str = "main") -> GHResult:
    """Create (or reset) a disposable branch from an existing branch for real
    canary isolation. Idempotent: if the ref already exists it is force-reset
    to the base SHA rather than failing."""
    base_sha = _run(["api", f"repos/{repo}/git/ref/heads/{base_branch}", "--jq", ".object.sha"])
    if not base_sha.ok:
        return GHResult(ok=False, error=f"base ref resolve failed: {base_sha.error}")
    sha = base_sha.data["raw"].strip()
    # Idempotent: delete existing ref first (force reset) to avoid 422.
    _run(["api", "-X", "DELETE", f"repos/{repo}/git/refs/heads/{new_branch}"])
    r = _run(["api", f"repos/{repo}/git/refs", "-f", f"ref=refs/heads/{new_branch}",
              "-f", f"sha={sha}"])
    if not r.ok:
        return r
    return GHResult(ok=True, data={"branch": new_branch, "sha": sha})


def wait_for_pr_checks(repo: str, pr_number: int, timeout_seconds: int = 600,
                       poll_seconds: int = 20) -> GHResult:
    """Poll until all PR check-runs are COMPLETED AND SUCCESS (fail-closed).

    Returns the final run set only when every check is completed with a
    'success' conclusion. If any check is failure/cancelled/timed_out, or the
    deadline passes, returns ok=False so the caller's eligibility predicate
    blocks (never assumes success)."""
    import time
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        head_res = get_pr_head_sha(repo, pr_number)
        if not head_res.ok:
            return GHResult(ok=False, error=head_res.error)
        sha = head_res.data.get("head_sha", "")
        runs = check_runs_for_sha(repo, sha)
        if not runs.ok:
            return GHResult(ok=False, error=runs.error)
        rs = runs.data.get("runs", [])
        if not rs:
            time.sleep(poll_seconds)
            continue
        all_completed = all(r.get("status") == "completed" for r in rs)
        all_success = all(r.get("conclusion") == "success" for r in rs)
        if all_completed and all_success:
            return GHResult(ok=True, data={"runs": rs, "head_sha": sha,
                                          "all_completed": True, "all_success": True})
        if all_completed and not all_success:
            # Terminal failure: stop polling, let eligibility block.
            return GHResult(ok=False, error="checks completed with non-success conclusion")
        time.sleep(poll_seconds)
    return GHResult(ok=False, error="timeout waiting for checks to complete")
