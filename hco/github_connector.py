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
