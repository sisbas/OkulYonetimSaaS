"""HCO — Hermes-native Central Orchestrator control-plane (proves #260)."""
from .canary import CanaryHarness, CanaryResult
from .evidence import EvidenceManifest, build_manifest, eligibility_from_manifest
from .github_connector import GHResult, check_runs_for_sha, gh_available, required_checks
from .state_machine import ControlPlane, ControlPlaneError, Receipt, Stage

__all__ = [
    "CanaryHarness",
    "CanaryResult",
    "ControlPlane",
    "ControlPlaneError",
    "EvidenceManifest",
    "GHResult",
    "Receipt",
    "Stage",
    "build_manifest",
    "check_runs_for_sha",
    "eligibility_from_manifest",
    "gh_available",
    "required_checks",
]
