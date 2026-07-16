#!/usr/bin/env python3
"""Apply or verify the repository's main-branch merge-governance ruleset.

The apply operation requires a fine-grained token with repository
Administration: write permission in REPO_ADMIN_TOKEN or GH_ADMIN_TOKEN.
The verify operation can query a public repository without a token.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

API_ROOT = "https://api.github.com"
API_VERSION = "2026-03-10"
DEFAULT_REPOSITORY = "sisbas/OkulYonetimSaaS"
DEFAULT_PAYLOAD = ".github/rulesets/main-merge-governance.json"
RULESET_NAME = "main-merge-governance"

REQUIRED_CHECKS = {
    "Sprint 1 Quality Gate",
    "Backend CI",
    "DB Smoke",
    "Gate 1 CI",
    "Sensitive Pattern Scanner",
    "GitGuardian scan",
    "PR Governance / Body Validation",
    "PR Governance / Issue Reference",
    "PR Governance / Rollback Plan",
    "PR Governance / Acceptance Criteria",
    "Merge Governance Enforcement",
}


class RulesetError(RuntimeError):
    """Raised when a ruleset request or validation fails."""


def api_request(
    repository: str,
    path: str,
    *,
    method: str = "GET",
    token: str | None = None,
    payload: dict[str, Any] | None = None,
) -> Any:
    url = f"{API_ROOT}/repos/{repository}{path}"
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": API_VERSION,
        "User-Agent": "OkulYonetimSaaS-ruleset-admin",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"

    body = None
    if payload is not None:
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        headers["Content-Type"] = "application/json"

    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        response_body = exc.read().decode("utf-8", errors="replace")
        raise RulesetError(
            f"GitHub API {method} {path} failed with HTTP {exc.code}: {response_body}"
        ) from exc
    except urllib.error.URLError as exc:
        raise RulesetError(f"GitHub API request failed: {exc}") from exc


def load_payload(path: str) -> dict[str, Any]:
    payload_path = Path(path)
    if not payload_path.is_file():
        raise RulesetError(f"Ruleset payload not found: {payload_path}")
    try:
        data = json.loads(payload_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RulesetError(f"Cannot read ruleset payload: {exc}") from exc
    if not isinstance(data, dict):
        raise RulesetError("Ruleset payload must be a JSON object")
    return data


def find_rule(ruleset: dict[str, Any], rule_type: str) -> dict[str, Any]:
    for rule in ruleset.get("rules", []):
        if isinstance(rule, dict) and rule.get("type") == rule_type:
            return rule
    raise RulesetError(f"Missing required ruleset rule: {rule_type}")


def validate_ruleset(ruleset: dict[str, Any]) -> None:
    errors: list[str] = []

    if ruleset.get("name") != RULESET_NAME:
        errors.append(f"name must be {RULESET_NAME!r}")
    if ruleset.get("target") != "branch":
        errors.append("target must be 'branch'")
    if ruleset.get("enforcement") != "active":
        errors.append("enforcement must be 'active'")
    if ruleset.get("bypass_actors") != []:
        errors.append("bypass_actors must be an empty array")

    include = (
        ruleset.get("conditions", {})
        .get("ref_name", {})
        .get("include", [])
    )
    if "~DEFAULT_BRANCH" not in include and "refs/heads/main" not in include:
        errors.append("conditions must include the default branch or refs/heads/main")

    try:
        find_rule(ruleset, "deletion")
        find_rule(ruleset, "non_fast_forward")

        pull_rule = find_rule(ruleset, "pull_request")
        pull = pull_rule.get("parameters", {})
        expected_pull = {
            "dismiss_stale_reviews_on_push": True,
            "require_last_push_approval": True,
            "required_approving_review_count": 1,
            "required_review_thread_resolution": True,
        }
        for key, expected in expected_pull.items():
            if pull.get(key) != expected:
                errors.append(f"pull_request.parameters.{key} must be {expected!r}")
        allowed_methods = set(pull.get("allowed_merge_methods", []))
        if not allowed_methods or not allowed_methods.issubset({"merge", "squash", "rebase"}):
            errors.append("allowed_merge_methods must contain valid GitHub merge methods")

        checks_rule = find_rule(ruleset, "required_status_checks")
        checks_params = checks_rule.get("parameters", {})
        if checks_params.get("strict_required_status_checks_policy") is not True:
            errors.append("strict_required_status_checks_policy must be true")
        actual_checks = {
            item.get("context")
            for item in checks_params.get("required_status_checks", [])
            if isinstance(item, dict) and item.get("context")
        }
        missing = sorted(REQUIRED_CHECKS - actual_checks)
        extra = sorted(actual_checks - REQUIRED_CHECKS)
        if missing:
            errors.append(f"missing required checks: {', '.join(missing)}")
        if extra:
            errors.append(f"unexpected required checks: {', '.join(extra)}")
    except RulesetError as exc:
        errors.append(str(exc))

    if errors:
        formatted = "\n".join(f"- {error}" for error in errors)
        raise RulesetError(f"Ruleset validation failed:\n{formatted}")


def get_named_ruleset(repository: str, token: str | None) -> dict[str, Any] | None:
    rulesets = api_request(repository, "/rulesets?includes_parents=false", token=token)
    if not isinstance(rulesets, list):
        raise RulesetError("Unexpected response while listing repository rulesets")

    matches = [item for item in rulesets if item.get("name") == RULESET_NAME]
    if len(matches) > 1:
        raise RulesetError(f"Multiple rulesets named {RULESET_NAME!r} exist")
    if not matches:
        return None

    ruleset_id = matches[0].get("id")
    if not isinstance(ruleset_id, int):
        raise RulesetError("Existing ruleset has no numeric id")
    detail = api_request(repository, f"/rulesets/{ruleset_id}", token=token)
    if not isinstance(detail, dict):
        raise RulesetError("Unexpected response while reading repository ruleset")
    return detail


def validate_active_branch_rules(repository: str, token: str | None) -> None:
    active_rules = api_request(repository, "/rules/branches/main", token=token)
    if not isinstance(active_rules, list):
        raise RulesetError("Unexpected response while reading active rules for main")

    rule_types = {item.get("type") for item in active_rules if isinstance(item, dict)}
    for required_type in {"deletion", "non_fast_forward", "pull_request", "required_status_checks"}:
        if required_type not in rule_types:
            raise RulesetError(f"Active main rules are missing {required_type!r}")


def apply_ruleset(repository: str, payload: dict[str, Any], token: str) -> None:
    validate_ruleset(payload)
    existing = get_named_ruleset(repository, token)

    if existing is None:
        result = api_request(repository, "/rulesets", method="POST", token=token, payload=payload)
        action = "created"
    else:
        ruleset_id = existing["id"]
        result = api_request(
            repository,
            f"/rulesets/{ruleset_id}",
            method="PUT",
            token=token,
            payload=payload,
        )
        action = "updated"

    if not isinstance(result, dict):
        raise RulesetError("Unexpected response while applying repository ruleset")
    validate_ruleset(result)
    validate_active_branch_rules(repository, token)
    print(f"PASS: {RULESET_NAME} {action} and active on main (id={result.get('id')})")


def verify_ruleset(repository: str, token: str | None) -> None:
    ruleset = get_named_ruleset(repository, token)
    if ruleset is None:
        raise RulesetError(f"Ruleset {RULESET_NAME!r} does not exist")
    validate_ruleset(ruleset)
    validate_active_branch_rules(repository, token)
    print(f"PASS: {RULESET_NAME} is active and valid on main (id={ruleset.get('id')})")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("validate-payload", "apply", "verify"))
    parser.add_argument(
        "--repository",
        default=os.environ.get("GITHUB_REPOSITORY", DEFAULT_REPOSITORY),
        help="Repository in owner/name format",
    )
    parser.add_argument("--payload", default=DEFAULT_PAYLOAD)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    token = os.environ.get("REPO_ADMIN_TOKEN") or os.environ.get("GH_ADMIN_TOKEN")

    try:
        payload = load_payload(args.payload)
        if args.command == "validate-payload":
            validate_ruleset(payload)
            print("PASS: ruleset payload schema and policy checks")
        elif args.command == "apply":
            if not token:
                raise RulesetError(
                    "REPO_ADMIN_TOKEN or GH_ADMIN_TOKEN is required for apply; "
                    "use a fine-grained token with repository Administration: write"
                )
            apply_ruleset(args.repository, payload, token)
        else:
            verify_ruleset(args.repository, token)
    except RulesetError as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
