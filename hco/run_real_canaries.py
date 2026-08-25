"""HCO real 3-canary proof (issue #260 gate).

Runs THREE consecutive disposable canaries against the REAL GitHub repo using
the gh-cli connector (no fabrication): for each, open a disposable issue, open
a PR from a REAL branch, wait for the REAL checks to finish, resolve the REAL
head SHA, query the REAL check-runs, bind evidence to exact head, advance the
state machine to MERGE_ELIGIBILITY, and record a POST_MERGE_OBSERVATION receipt.
Duplicate dispatch is blocked by idempotency key. No merge is ever performed
(HCO hard boundary).

Usage:
  uv run python hco/run_real_canaries.py

Requires `gh` authenticated and the HCO branch pushed.
"""
from __future__ import annotations

import os
import sys
import tempfile

REPO = "sisbas/OkulYonetimSaaS"
START_ISSUE = 295  # fresh disposable issue numbers for this proof run

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from hco import CanaryHarness, CanaryResult, ControlPlane, Stage


def main() -> int:
    receipt_store = os.path.join(tempfile.gettempdir(), "hco_real_canary_receipts.jsonl")
    if os.path.exists(receipt_store):
        os.remove(receipt_store)

    cp = ControlPlane(receipt_store_path=receipt_store, auto_merge_enabled=False)
    harness = CanaryHarness(cp, repo=REPO, auto_merge=False)

    results: list[CanaryResult] = []
    for i in range(3):
        issue = START_ISSUE + i
        r = None
        for attempt in range(2):
            r = harness.run_one(issue_num=issue, simulate=False)
            if r.issued and not r.error:
                break
            print(f"  canary {issue} attempt {attempt+1} failed: {r.error}; retrying")
        results.append(r)
        print(f"[canary {issue}] issued={r.issued} pr={r.pr_url} "
              f"head={r.head_sha[:10] if r.head_sha else '-'} error={r.error or '-'}")
        if not r.issued or r.error:
            print(f"  CANARY {issue} FAILED after retries: {r.error}")
            return 2

    # Duplicate dispatch negative proof: re-run first issue -> must be blocked.
    dup = harness.run_one(issue_num=START_ISSUE, simulate=False)
    if dup.issued and "duplicate" not in (dup.error or ""):
        print("DUPLICATE DISPATCH NOT BLOCKED — fail-closed breach")
        return 3

    # Verify all three reached MERGE_ELIGIBILITY with real evidence.
    receipts = cp.recorded_receipts()
    elig = [r for r in receipts if r.stage == Stage.MERGE_ELIGIBILITY.value]
    print(f"\nMERGE_ELIGIBILITY receipts: {len(elig)} / 3")
    print(f"Total receipts recorded: {len(receipts)}")
    if len(elig) < 3:
        print("MISSING ELIGIBILITY — abort")
        return 4

    print("\nREAL 3-CANARY PROOF OK (no merge performed; HCO hard boundary).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
