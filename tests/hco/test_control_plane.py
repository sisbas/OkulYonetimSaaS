"""HCO control-plane tests — proving #260 fail-closed contract."""
import os
import sys

import pytest

# Make repo importable (hco/ is a top-level package)
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, REPO)

from hco import CanaryHarness, ControlPlane, ControlPlaneError, Stage
from hco.evidence import build_manifest, eligibility_from_manifest


@pytest.fixture
def cp(tmp_path):
    return ControlPlane(receipt_store_path=str(tmp_path / "receipts.jsonl"), auto_merge_enabled=False)


def _transition(cp, *, cid, stage, key, lease, head_sha=None, base_sha="BASE"):
    return cp.transition(
        correlation_id=cid, stage=stage, head_sha=head_sha, base_sha=base_sha,
        issue_url="https://github.com/x/y/issues/1", role="HCO", verdict="APPROVE",
        detail="d", idempotency_key=key, lease_id=lease,
        receipt_url="file://x", prompt_sha256="0" * 64,
    )


def test_legal_forward_transition(cp):
    cp.acquire_lease("L1")
    ev = _transition(cp, cid="C1", stage=Stage.IMPLEMENTING, key="C1:plan", lease="L1")
    assert cp.stage_of("C1") == Stage.IMPLEMENTING
    assert ev.event_id
    assert ev.integrity_hash()


def test_illegal_transition_blocked(cp):
    cp.acquire_lease("L2")
    _transition(cp, cid="C2", stage=Stage.IMPLEMENTING, key="C2:p", lease="L2")
    with pytest.raises(ControlPlaneError):
        # IMPLEMENTING -> PLAN_CONSULTATION is not allowed (forward-only)
        _transition(cp, cid="C2", stage=Stage.PLAN_CONSULTATION, key="C2:b", lease="L2")


def test_idempotency_blocks_duplicate_dispatch(cp):
    cp.acquire_lease("L3")
    _transition(cp, cid="C3", stage=Stage.IMPLEMENTING, key="SAME_KEY", lease="L3")
    with pytest.raises(ControlPlaneError):
        _transition(cp, cid="C3", stage=Stage.IMPLEMENTING, key="SAME_KEY", lease="L3")


def test_expired_lease_fail_closed(cp):
    cp.acquire_lease("LX", ttl_seconds=-1)  # already expired
    with pytest.raises(ControlPlaneError):
        _transition(cp, cid="C4", stage=Stage.IMPLEMENTING, key="C4:p", lease="LX")


def test_auto_merge_disabled_by_default(cp):
    cp.acquire_lease("L5")
    cid = "C5"
    for st, key in [(Stage.IMPLEMENTING, "p"), (Stage.REVIEWING, "r"),
                    (Stage.TESTING, "t"), (Stage.MERGE_ELIGIBILITY, "e")]:
        _transition(cp, cid=cid, stage=st, key=key, lease="L5", head_sha="H")
    with pytest.raises(ControlPlaneError):
        _transition(cp, cid=cid, stage=Stage.AUTO_MERGE, key="m", lease="L5", head_sha="H")


def test_evidence_manifest_fail_closed():
    m = build_manifest(head_sha="abc1234", base_sha="B", correlation_id="C",
                       checks={"Backend CI": "success", "X": "failed"})
    eligible, reasons = eligibility_from_manifest(m)
    assert not eligible
    assert any("failed" in r for r in reasons)


def test_three_canaries_no_duplicate_dispatch(cp, tmp_path):
    harness = CanaryHarness(cp, repo="sisbas/OkulYonetimSaaS", auto_merge=False)
    results = harness.run_three(start_issue=901, simulate=True)
    assert len(results) == 3
    for r in results:
        assert r.issued
        assert r.checks_passed
        assert r.receipt_hash
        assert not r.merged  # fail-closed: no autonomous merge

    # Re-run same first issue -> duplicate dispatch blocked (idempotency)
    dup = harness.run_one(issue_num=901, simulate=True)
    assert (not dup.issued) or "duplicate" in dup.error
