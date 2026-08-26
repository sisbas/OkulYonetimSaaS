"""HCO control-plane — durable state machine + receipt store.

Hermes-native (no OpenClaw). All transitions are append-only, idempotent,
correlation-bound and fail-closed by default.
"""
from __future__ import annotations

import hashlib
import json
import os
import time
import uuid
from dataclasses import asdict, dataclass
from enum import Enum


# --- Lifecycle states (issue #260 normative ordering) ---
class Stage(str, Enum):
    PLAN_CONSULTATION = "PLAN_CONSULTATION"
    IMPLEMENTING = "IMPLEMENTING"
    REVIEWING = "REVIEWING"
    TESTING = "TESTING"
    MERGE_ELIGIBILITY = "MERGE_ELIGIBILITY"
    AUTO_MERGE = "AUTO_MERGE"
    POST_MERGE_OBSERVATION = "POST_MERGE_OBSERVATION"
    RCA_REPAIR = "RCA_REPAIR"
    BLOCKED_AUTONOMOUS = "BLOCKED_AUTONOMOUS"


# Forward-only transitions. RCA_REPAIR loops back to REVIEWING on any valid finding.
_ALLOWED = {
    Stage.PLAN_CONSULTATION: {Stage.IMPLEMENTING, Stage.BLOCKED_AUTONOMOUS},
    Stage.IMPLEMENTING: {Stage.REVIEWING, Stage.RCA_REPAIR, Stage.BLOCKED_AUTONOMOUS},
    Stage.REVIEWING: {Stage.TESTING, Stage.RCA_REPAIR, Stage.BLOCKED_AUTONOMOUS},
    Stage.TESTING: {Stage.MERGE_ELIGIBILITY, Stage.RCA_REPAIR, Stage.BLOCKED_AUTONOMOUS},
    Stage.RCA_REPAIR: {Stage.REVIEWING, Stage.BLOCKED_AUTONOMOUS},
    Stage.MERGE_ELIGIBILITY: {Stage.AUTO_MERGE, Stage.RCA_REPAIR, Stage.BLOCKED_AUTONOMOUS},
    # AUTO_MERGE is fail-closed: it MUST NOT fire without explicit human protocol.
    Stage.AUTO_MERGE: {Stage.POST_MERGE_OBSERVATION, Stage.BLOCKED_AUTONOMOUS},
    Stage.POST_MERGE_OBSERVATION: set(),
    Stage.BLOCKED_AUTONOMOUS: set(),
}


@dataclass
class Receipt:
    """Immutable, append-only evidence record bound to a lifecycle event."""
    event_id: str
    correlation_id: str
    issue_url: str
    stage: str
    head_sha: str | None
    base_sha: str | None
    role: str
    verdict: str
    detail: str
    timestamp_iso: str
    receipt_url: str  # immutable proof pointer (file path / gh url)
    prompt_sha256: str
    idempotency_key: str
    lease_id: str | None
    previous_stage: str | None

    def to_json(self) -> str:
        return json.dumps(asdict(self), ensure_ascii=False, sort_keys=True)

    def integrity_hash(self) -> str:
        return hashlib.sha256(self.to_json().encode("utf-8")).hexdigest()


class ControlPlaneError(RuntimeError):
    """Raised on illegal transition / fail-closed breach."""


class ControlPlane:
    def __init__(self, receipt_store_path: str, auto_merge_enabled: bool = False):
        self.receipt_store_path = receipt_store_path
        self.auto_merge_enabled = auto_merge_enabled  # DEFAULT OFF (fail-closed)
        os.makedirs(os.path.dirname(receipt_store_path), exist_ok=True)
        self._state: dict[str, Stage] = {}        # correlation_id -> stage
        self._leases: dict[str, float] = {}        # lease_id -> expiry_epoch
        self._idempotency: dict[str, str] = {}    # idempotency_key -> event_id
        self._retry_budget: dict[str, int] = {}    # fingerprint -> attempts
        self._replay()  # durable: restore state from append-only receipt store

    def _replay(self) -> None:
        """Reconstruct in-memory state from stored receipts so a process restart
        preserves lifecycle position, idempotency and correlation bindings.
        Fail-closed: a corrupt receipt line aborts replay rather than silently
        resetting state (which would permit duplicate autonomous dispatch)."""
        if not os.path.exists(self.receipt_store_path):
            return
        try:
            with open(self.receipt_store_path, encoding="utf-8") as f:
                for ln in f:
                    ln = ln.strip()
                    if not ln:
                        continue
                    ev = Receipt(**json.loads(ln))
                    self._state[ev.correlation_id] = Stage(ev.stage)
                    self._idempotency[ev.idempotency_key] = ev.event_id
                    if ev.lease_id:
                        # lease expiry is not persisted; unknown leases treated
                        # as expired (fail-closed) until re-acquired by caller.
                        self._leases.setdefault(ev.lease_id, 0.0)
        except (json.JSONDecodeError, KeyError, ValueError) as e:
            raise ControlPlaneError(f"receipt store replay failed (corrupt): {e}") from e

    # ---- idempotency / lease ----
    def acquire_lease(self, lease_id: str, ttl_seconds: int = 900) -> bool:
        now = time.time()
        if lease_id in self._leases and self._leases[lease_id] > now:
            return False  # still held -> duplicate dispatch blocked
        self._leases[lease_id] = now + ttl_seconds
        return True

    def lease_valid(self, lease_id: str) -> bool:
        if lease_id is None:
            return False
        return self._leases.get(lease_id, 0) > time.time()

    def idempotency_seen(self, idempotency_key: str) -> str | None:
        return self._idempotency.get(idempotency_key)

    # ---- transition ----
    def transition(
        self,
        *,
        correlation_id: str,
        stage: Stage,
        head_sha: str | None,
        base_sha: str | None,
        issue_url: str,
        role: str,
        verdict: str,
        detail: str,
        idempotency_key: str,
        lease_id: str | None = None,
        receipt_url: str = "",
        prompt_sha256: str = "",
    ) -> Receipt:
        # Idempotency: never double-process the same key.
        seen = self.idempotency_seen(idempotency_key)
        if seen is not None:
            raise ControlPlaneError(f"duplicate dispatch blocked by idempotency key {idempotency_key} (event {seen})")

        # Lease guard (fail-closed: a valid, unexpired lease is REQUIRED for every
        # autonomous transition. Omitting lease_id is not permitted — it would
        # bypass the guard and allow duplicate/concurrent mutations).
        if lease_id is None:
            raise ControlPlaneError("lease_id is required for every transition (fail-closed)")
        if not self.lease_valid(lease_id):
            raise ControlPlaneError(f"expired or missing lease {lease_id} -> fail-closed")

        prev = self._state.get(correlation_id, Stage.PLAN_CONSULTATION)
        if stage not in _ALLOWED.get(prev, set()):
            raise ControlPlaneError(f"illegal transition {prev.value} -> {stage.value}")

        # AUTO_MERGE autonomy guard: DEFAULT OFF. Never merges without explicit enable.
        if stage == Stage.AUTO_MERGE and not self.auto_merge_enabled:
            raise ControlPlaneError("AUTO_MERGE disabled (fail-closed default). Human protocol required.")

        ev = Receipt(
            event_id=uuid.uuid4().hex,
            correlation_id=correlation_id,
            issue_url=issue_url,
            stage=stage.value,
            head_sha=head_sha,
            base_sha=base_sha,
            role=role,
            verdict=verdict,
            detail=detail,
            timestamp_iso=__import__("datetime").datetime.now().isoformat(),
            receipt_url=receipt_url,
            prompt_sha256=prompt_sha256,
            idempotency_key=idempotency_key,
            lease_id=lease_id,
            previous_stage=prev.value,
        )
        self._state[correlation_id] = stage
        self._idempotency[idempotency_key] = ev.event_id
        self._append_receipt(ev)
        return ev

    def _append_receipt(self, ev: Receipt) -> None:
        line = ev.to_json() + "\n"
        with open(self.receipt_store_path, "a", encoding="utf-8") as f:
            f.write(line)

    def recorded_receipts(self) -> list[Receipt]:
        out: list[Receipt] = []
        if not os.path.exists(self.receipt_store_path):
            return out
        with open(self.receipt_store_path, encoding="utf-8") as f:
            for ln in f:
                ln = ln.strip()
                if ln:
                    out.append(Receipt(**json.loads(ln)))
        return out

    def stage_of(self, correlation_id: str) -> Stage:
        return self._state.get(correlation_id, Stage.PLAN_CONSULTATION)

    def retry_budget_ok(self, fingerprint: str, max_attempts: int = 5) -> bool:
        n = self._retry_budget.get(fingerprint, 0)
        if n >= max_attempts:
            # Budget exhausted -> caller must raise BLOCKED_AUTONOMOUS (never merge).
            return False
        self._retry_budget[fingerprint] = n + 1
        return True
