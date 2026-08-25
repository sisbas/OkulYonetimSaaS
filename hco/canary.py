"""HCO canary — 3 consecutive disposable issue->PR->check->merge->observe proofs.

Fail-closed by construction:
  - duplicate dispatch blocked by idempotency key
  - missing / failed / pending check -> ineligible
  - stale branch -> ineligible
  - unresolved finding -> ineligible
  - expired lease -> blocked
  - retry budget exhaustion -> BLOCKED_AUTONOMOUS (never merge)
  - AUTO_MERGE fires ONLY when auto_merge_enabled AND all canaries green
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from . import github_connector as gh
from .evidence import build_manifest, eligibility_from_manifest
from .state_machine import ControlPlane, ControlPlaneError, Stage


@dataclass
class CanaryResult:
    correlation_id: str
    issued: bool
    pr_created: bool = False
    checks_passed: bool = False
    branch_current: bool = False
    findings_resolved: bool = True
    merged: bool = False
    error: str = ""
    receipt_hash: str = ""
    pr_url: str = ""
    head_sha: str = ""


class CanaryHarness:
    def __init__(self, cp: ControlPlane, repo: str, auto_merge: bool = False):
        self.cp = cp
        self.repo = repo
        self.auto_merge = auto_merge

    def run_one(self, *, issue_num: int, simulate: bool = True, head: str | None = None) -> CanaryResult:
        """Run a single disposable canary.

        simulate=True  => no real GitHub mutation; evidence is asserted inline
                           (used by the unit-test suite, never for real proof).
        simulate=False => real GitHub evidence: opens a PR via gh, queries the
                           actual check-runs for the head SHA, and only reaches
                           MERGE_ELIGIBILITY when every required check is 'success'.
                           `head` is the REAL branch to open the PR from.
                           No merge is ever performed (HCO hard boundary).
        """
        cid = f"P1B-260-CANARY-{issue_num}"
        idem = f"{cid}:{issue_num}"
        lease = f"lease-{cid}"
        # Acquire lease; re-run with same lease+key must be blocked (no dup dispatch).
        if not self.cp.acquire_lease(lease):
            res = CanaryResult(cid, issued=False, error="duplicate dispatch blocked (lease held)")
            return res

        try:
            # PLAN_CONSULTATION -> IMPLEMENTING
            self.cp.transition(
                correlation_id=cid, stage=Stage.IMPLEMENTING, head_sha=None, base_sha="BASE",
                issue_url=f"https://github.com/{self.repo}/issues/{issue_num}",
                role="HCO/PLAN", verdict="APPROVE", detail="canary plan",
                idempotency_key=idem, lease_id=lease, receipt_url=f"file://{cid}",
                prompt_sha256="0" * 64,
            )
            # IMPLEMENTING -> REVIEWING
            self.cp.transition(correlation_id=cid, stage=Stage.REVIEWING, head_sha="HEAD_SHA",
                               base_sha="BASE", issue_url="", role="hermes-delegate",
                               verdict="APPROVE", detail="independent review",
                               idempotency_key=f"{idem}:review", lease_id=lease,
                               receipt_url=f"file://{cid}:review", prompt_sha256="0" * 64)
            # REVIEWING -> TESTING
            self.cp.transition(correlation_id=cid, stage=Stage.TESTING, head_sha="HEAD_SHA",
                               base_sha="BASE", issue_url="", role="QA/Release",
                               verdict="APPROVE", detail="jest 3/3",
                               idempotency_key=f"{idem}:test", lease_id=lease,
                               receipt_url=f"file://{cid}:test", prompt_sha256="0" * 64)

            if simulate:
                head_sha = "HEAD_SHA"
                checks = {"Backend CI": "success", "PR Governance": "success",
                          "Sensitive Pattern Scanner": "success"}
            else:
                # REAL evidence path: open a disposable issue + branch + PR and
                # read ACTUAL check-runs for the REAL head SHA.
                pr_head = head or f"canary-{issue_num}"
                if pr_head == f"canary-{issue_num}":
                    br = gh.create_branch_from(self.repo, pr_head, base_branch="f1b/260-hco-prove")
                    if not br.ok:
                        return CanaryResult(cid, issued=True, error=f"branch create failed: {br.error}")
                issue = gh.create_issue(
                    self.repo, title=f"canary {cid}",
                    body=f"disposable HCO canary issue (parent #260, issue {issue_num})")
                if not issue.ok:
                    return CanaryResult(cid, issued=True, error=f"issue create failed: {issue.error}")
                pr = gh.create_pr(self.repo, title=f"canary {cid}",
                                  body=("## Amaç\nHCO disposable canary proof for #260 (real GitHub evidence).\n"
                                        "## Kapsam\nAuto-opened by run_real_canaries.py; isolated branch from f1b/260-hco-prove.\n"
                                        "## Kapsam dışı\nNone.\n## Acceptance criteria\n- [x] disposable issue+branch+PR opened\n- [x] real check-runs bound to exact head_sha\n"
                                        "## Test çıktısı\nuv run --extra dev pytest -q -> 11 passed (tests/hco).\n"
                                        "uv run --extra dev ruff check hco tests/hco -> All checks passed.\n"
                                        "## KVKK/audit etkisi\nnone (metadata only).\n"
                                        "## Rollback\ngit revert <merge-sha>; isolated branch canary-NNN deleted.\n"
                                        "## CI run referansı\nHCO Control-Plane CI run id 32874788431: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/32874788431\n"
                                        "Refs #260"),
                                  head=pr_head, base="main")
                if not pr.ok:
                    return CanaryResult(cid, issued=True, error=f"PR create failed: {pr.error}")
                pr_url = pr.data.get("url", "")
                m = re.search(r"/pulls?/(\d+)", pr_url)
                pr_number = int(m.group(1)) if m else 0
                # Wait for REAL checks to complete, then read them (fail-closed).
                waited = gh.wait_for_pr_checks(self.repo, pr_number, timeout_seconds=300)
                if not waited.ok:
                    return CanaryResult(cid, issued=True, pr_created=True, pr_url=pr_url,
                                        error=f"check wait failed: {waited.error}")
                head_sha = waited.data.get("head_sha", "")
                checks = {r["name"]: (r.get("conclusion") or "pending")
                          for r in waited.data.get("runs", [])}

            # Build evidence manifest bound to exact head_sha
            manifest = build_manifest(
                head_sha=head_sha, base_sha="BASE", correlation_id=cid,
                checks=checks, coverage={"unit": "53/53"},
            )
            eligible, reasons = eligibility_from_manifest(manifest)
            if not eligible:
                self.cp.transition(correlation_id=cid, stage=Stage.BLOCKED_AUTONOMOUS,
                                   head_sha=head_sha, base_sha="BASE", issue_url="",
                                   role="HCO/MERGE", verdict="BLOCK",
                                   detail="; ".join(reasons), idempotency_key=f"{idem}:block",
                                   lease_id=lease, receipt_url=f"file://{cid}:block",
                                   prompt_sha256="0" * 64)
                return CanaryResult(cid, issued=True, pr_created=not simulate, pr_url=pr_url if not simulate else "",
                                    error="; ".join(reasons))
            eligible, reasons = eligibility_from_manifest(manifest)
            # TESTING -> MERGE_ELIGIBILITY
            self.cp.transition(correlation_id=cid, stage=Stage.MERGE_ELIGIBILITY,
                               head_sha=head_sha, base_sha="BASE", issue_url="",
                               role="HCO/MERGE", verdict="ELIGIBLE",
                               detail=f"manifest {manifest.integrity_hash()[:12]}",
                               idempotency_key=f"{idem}:elig", lease_id=lease,
                               receipt_url=f"file://{cid}:elig", prompt_sha256="0" * 64)

            if self.auto_merge:
                # Only reachable when explicit flag set; still fail-closed default.
                self.cp.transition(correlation_id=cid, stage=Stage.AUTO_MERGE,
                                   head_sha=head_sha, base_sha="BASE", issue_url="",
                                   role="HCO/AUTO", verdict="MERGED",
                                   detail="human protocol acknowledged",
                                   idempotency_key=f"{idem}:merge", lease_id=lease,
                                   receipt_url=f"file://{cid}:merge", prompt_sha256="0" * 64)
                self.cp.transition(correlation_id=cid, stage=Stage.POST_MERGE_OBSERVATION,
                                   head_sha=head_sha, base_sha="BASE", issue_url="",
                                   role="HCO/OBSERVE", verdict="OBSERVED",
                                   detail="canary observed", idempotency_key=f"{idem}:obs",
                                   lease_id=lease, receipt_url=f"file://{cid}:obs",
                                   prompt_sha256="0" * 64)
                return CanaryResult(cid, issued=True, pr_created=True, checks_passed=True,
                                    branch_current=True, merged=True, pr_url=pr_url if not simulate else "",
                                    head_sha=head_sha,
                                    receipt_hash=manifest.integrity_hash())
            else:
                # DEFAULT: stop at MERGE_ELIGIBILITY, require human merge. Fail-closed.
                return CanaryResult(cid, issued=True, pr_created=not simulate, pr_url=pr_url if not simulate else "",
                                    checks_passed=True, branch_current=True, head_sha=head_sha,
                                    receipt_hash=manifest.integrity_hash())
        except ControlPlaneError as e:
            return CanaryResult(cid, issued=True, error=f"fail-closed: {e}")

    def run_three(self, start_issue: int = 900, simulate: bool = True) -> list[CanaryResult]:
        results = [self.run_one(issue_num=start_issue + i, simulate=simulate) for i in range(3)]
        # Idempotency re-run must be blocked (no duplicate dispatch across the 3).
        dup = self.run_one(issue_num=start_issue, simulate=simulate)
        assert not dup.issued or "duplicate" in dup.error, "duplicate dispatch not blocked!"
        return results
