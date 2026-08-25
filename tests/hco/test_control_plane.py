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


def test_evidence_manifest_rejects_non_success_and_empty():
    # T2: any non-'success' conclusion or empty map must block.
    for bad in [{"X": "failure"}, {"X": "cancelled"}, {"X": "timed_out"},
                {"X": "pending"}, {"X": "missing"}, {}]:
        m = build_manifest(head_sha="abc1234", base_sha="B", correlation_id="C", checks=bad)
        eligible, _ = eligibility_from_manifest(m)
        assert not eligible


def test_lease_required_for_every_transition(cp):
    # T1: omitting lease_id must fail-closed (not silently skip the guard).
    with pytest.raises(ControlPlaneError):
        cp.transition(correlation_id="C6", stage=Stage.IMPLEMENTING, head_sha=None, base_sha="BASE",
                      issue_url="u", role="x", verdict="y", detail="d",
                      idempotency_key="C6:p", lease_id=None, receipt_url="f",
                      prompt_sha256="0" * 64)


def test_replay_restores_state_after_restart(tmp_path):
    # T0: a fresh ControlPlane over an existing receipt store must replay state
    # and block duplicate idempotency keys (no duplicate autonomous dispatch).
    store = str(tmp_path / "receipts.jsonl")
    cp1 = ControlPlane(receipt_store_path=store, auto_merge_enabled=False)
    cp1.acquire_lease("L7")
    cp1.transition(correlation_id="C7", stage=Stage.IMPLEMENTING, head_sha=None, base_sha="BASE",
                   issue_url="u", role="x", verdict="y", detail="d",
                   idempotency_key="C7:p", lease_id="L7", receipt_url="f", prompt_sha256="0" * 64)
    # Simulate process restart: new instance, same store.
    cp2 = ControlPlane(receipt_store_path=store, auto_merge_enabled=False)
    assert cp2.stage_of("C7") == Stage.IMPLEMENTING
    with pytest.raises(ControlPlaneError):
        cp2.transition(correlation_id="C7", stage=Stage.IMPLEMENTING, head_sha=None, base_sha="BASE",
                       issue_url="u", role="x", verdict="y", detail="d",
                       idempotency_key="C7:p", lease_id="L7", receipt_url="f", prompt_sha256="0" * 64)


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


def test_canary_real_path_requires_gh(monkeypatch, tmp_path):
    # T3: simulate=False must call the real connector (not fabricate evidence).
    cp = ControlPlane(receipt_store_path=str(tmp_path / "r.jsonl"), auto_merge_enabled=False)
    called = {}

    def fake_create_issue(repo, title, body, labels=None):
        called["create_issue"] = True
        return type("R", (), {"ok": True, "data": {"url": "https://example/issue/1"}})()

    def fake_create_branch(repo, new_branch, base_branch="main"):
        called["create_branch"] = True
        return type("R", (), {"ok": True, "data": {"branch": new_branch, "sha": "abc"}})()

    def fake_create_pr(repo, title, body, head, base):
        called["create_pr"] = True
        return type("R", (), {"ok": True, "data": {"url": "https://github.com/sisbas/OkulYonetimSaaS/pull/1"}})()

    def fake_head(repo, pr_number):
        called["head"] = True
        return type("R", (), {"ok": True, "data": {"head_sha": "deadbeef"}})()

    def fake_checks(repo, sha):
        called["checks"] = True
        return type("R", (), {"ok": True, "data": {"runs": [
            {"name": "Backend CI", "status": "completed", "conclusion": "success"}]}})()

    monkeypatch.setattr("hco.canary.gh.create_issue", fake_create_issue)
    monkeypatch.setattr("hco.canary.gh.create_branch_from", fake_create_branch)
    monkeypatch.setattr("hco.canary.gh.create_pr", fake_create_pr)
    monkeypatch.setattr("hco.canary.gh.get_pr_head_sha", fake_head)
    monkeypatch.setattr("hco.canary.gh.check_runs_for_sha", fake_checks)

    harness = CanaryHarness(cp, repo="sisbas/OkulYonetimSaaS", auto_merge=False)
    r = harness.run_one(issue_num=911, simulate=False)
    assert (called.get("create_issue") and called.get("create_branch")
            and called.get("create_pr") and called.get("head") and called.get("checks"))
    assert r.pr_created
    assert r.head_sha == "deadbeef"  # real SHA, not fabricated HEAD_SHA
