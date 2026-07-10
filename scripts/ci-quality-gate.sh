#!/usr/bin/env bash

set -uo pipefail

mkdir -p ci-logs
SUMMARY_FILE="${GITHUB_STEP_SUMMARY:-ci-logs/summary.md}"
STATUS_FILE="ci-logs/status.tsv"
: > "$STATUS_FILE"

sanitize_markdown_cell() {
  sed 's/|/\\|/g' | tr -d '\r'
}

first_error_line() {
  local log_file="$1"
  local line
  line=$(grep -E -m 1 "(npm ERR!|ERR!|##\[error\]|Error:|ERROR|FAIL|Failed|failed|Cannot|Exception|SyntaxError|TypeError|ReferenceError|ECONNREFUSED|EACCES|ENOENT|Migration)" "$log_file" || true)
  if [[ -z "$line" ]]; then
    line=$(tail -n 20 "$log_file" | grep -E -m 1 "[^[:space:]]" || true)
  fi
  if [[ -z "$line" ]]; then
    echo "No explicit error line found; inspect full log artifact."
  else
    printf '%s' "$line" | sanitize_markdown_cell
  fi
}

classify_failure() {
  local check_name="$1"
  local log_file="$2"

  if grep -Eiq "ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|timed out|network|pg_isready|postgres|database.*connect|connection refused|permission denied|EACCES|ENOENT|Cannot find module|No such file|tsconfig|configuration|config" "$log_file"; then
    echo "env/config"
    return
  fi

  if grep -Eiq "flaky|retry|Jest did not exit|worker process.*failed to exit|timeout.*exceeded" "$log_file"; then
    echo "flaky test/runtime"
    return
  fi

  case "$check_name" in
    *RBAC*|*KVKK*|*audit*|*test*) echo "real test failure" ;;
    *migration*|*seed*) echo "env/config or schema failure" ;;
    *lint*|*build*) echo "code quality/build failure" ;;
    *npm*) echo "dependency/install failure" ;;
    *) echo "unclassified failure" ;;
  esac
}

write_header() {
  {
    echo "## Sprint 1 CI Quality Gate"
    echo
    echo "| # | Check | Result | First error line | Classification |"
    echo "|---:|---|---|---|---|"
  } >> "$SUMMARY_FILE"
}

write_row() {
  local order="$1"
  local check_name="$2"
  local result="$3"
  local first_error="$4"
  local classification="$5"
  printf '| %s | %s | %s | %s | %s |\n' "$order" "$check_name" "$result" "$first_error" "$classification" >> "$SUMMARY_FILE"
  printf '%s\t%s\t%s\t%s\t%s\n' "$order" "$check_name" "$result" "$first_error" "$classification" >> "$STATUS_FILE"
}

run_check() {
  local order="$1"
  local check_name="$2"
  local command="$3"
  local slug
  slug=$(printf '%s-%s' "$order" "$check_name" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g; s/--*/-/g; s/-$//')
  local log_file="ci-logs/${slug}.log"

  echo "::group::${order} ${check_name}"
  {
    echo "# ${order} ${check_name}"
    echo "Command: ${command}"
    echo
  } > "$log_file"

  bash -lc "$command" 2>&1 | tee -a "$log_file"
  local status=${PIPESTATUS[0]}

  if [[ "$status" -eq 0 ]]; then
    write_row "$order" "$check_name" "PASS" "—" "—"
    echo "::endgroup::"
    return 0
  fi

  local error_line
  local classification
  error_line=$(first_error_line "$log_file")
  classification=$(classify_failure "$check_name" "$log_file")

  write_row "$order" "$check_name" "FAIL" "$error_line" "$classification"
  {
    echo
    echo "**Decision:** FAIL at ${order} ${check_name}."
    echo "**Retry required:** Do not retry blindly. Classify as flaky, env/config, or real test failure first."
    echo "**Rollback/revert:** If this failure is on main, revert the offending merge commit and re-run this workflow."
  } >> "$SUMMARY_FILE"

  echo "::error title=${check_name} failed::${error_line}"
  echo "::endgroup::"
  return "$status"
}

write_header

run_check "01" "npm ci" "npm ci" || exit $?
run_check "02" "lint" "npm run lint" || exit $?
run_check "03" "unit tests" "npm run test:unit" || exit $?
run_check "04" "migration check" "npm run db:migrate" || exit $?
run_check "05" "seed check" "npm run db:seed:permissions" || exit $?
run_check "06" "datasource verify" "npm run db:verify" || exit $?
run_check "07" "RBAC tests" "npm run test:rbac" || exit $?
run_check "08" "KVKK tests" "npm run test:kvkk" || exit $?
run_check "09" "audit/redaction tests" "npm run test:audit-redaction" || exit $?
run_check "10" "build" "npm run build" || exit $?

{
  echo
  echo "**Decision:** PASS."
  echo "**Retry required:** No."
  echo "**Blocker:** None."
} >> "$SUMMARY_FILE"

echo "Sprint 1 CI Quality Gate passed."
