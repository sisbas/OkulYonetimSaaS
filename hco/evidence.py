"""HCO evidence — same-SHA manifest hashing bound to exact head_sha.

Fail-closed: a manifest with no head_sha, or a head_sha that does not match the
supplied evidence, MUST NOT be attested.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass


@dataclass
class EvidenceManifest:
    head_sha: str
    base_sha: str
    correlation_id: str
    checks: dict[str, str]  # check_name -> "success"|"fail"|"pending"|"missing"
    coverage: dict[str, str]
    generated_by: str

    def to_canonical(self) -> str:
        payload = {
            "head_sha": self.head_sha,
            "base_sha": self.base_sha,
            "correlation_id": self.correlation_id,
            "checks": dict(sorted(self.checks.items())),
            "coverage": dict(sorted(self.coverage.items())),
            "generated_by": self.generated_by,
        }
        return json.dumps(payload, ensure_ascii=False, sort_keys=True)

    def integrity_hash(self) -> str:
        return hashlib.sha256(self.to_canonical().encode("utf-8")).hexdigest()


def build_manifest(
    *,
    head_sha: str,
    base_sha: str,
    correlation_id: str,
    checks: dict[str, str],
    coverage: dict[str, str] | None = None,
    generated_by: str = "hco.evidence",
) -> EvidenceManifest:
    if not head_sha or len(head_sha) < 7:
        raise ValueError("head_sha required for fail-closed evidence manifest")
    return EvidenceManifest(
        head_sha=head_sha,
        base_sha=base_sha,
        correlation_id=correlation_id,
        checks=checks,
        coverage=coverage or {},
        generated_by=generated_by,
    )


def eligibility_from_manifest(m: EvidenceManifest) -> tuple[bool, list[str]]:
    """Return (eligible, reasons). Fail-closed: any missing/failed/pending check blocks."""
    reasons: list[str] = []
    if not m.head_sha:
        reasons.append("no head_sha bound")
    for name, status in m.checks.items():
        if status in ("missing", "failed"):
            reasons.append(f"check {name}={status}")
        elif status == "pending":
            reasons.append(f"check {name}=pending (not yet success)")
    return (len(reasons) == 0, reasons)
