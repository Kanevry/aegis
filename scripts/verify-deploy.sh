#!/usr/bin/env bash
# verify-deploy.sh — Ægis deployment smoke-test
#
# Usage:
#   ./scripts/verify-deploy.sh [URL]
#   ./scripts/verify-deploy.sh --help
#
# Arguments:
#   URL   Base URL to verify (default: https://aegis-codex.vercel.app)
#
# Exit codes:
#   0   All checks passed
#   1   One or more checks failed
#
# Make executable after pull:
#   chmod +x scripts/verify-deploy.sh

set -uo pipefail

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
DEFAULT_URL="https://aegis-codex.vercel.app"
LIVENESS_TIMEOUT=10   # seconds curl will wait before giving up
PASS=0
FAIL=0

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
green()  { printf '\033[0;32m%s\033[0m\n' "$*"; }
red()    { printf '\033[0;31m%s\033[0m\n' "$*"; }
bold()   { printf '\033[1m%s\033[0m\n'   "$*"; }

usage() {
  cat <<EOF
Usage: $(basename "$0") [URL]

Runs 4 smoke checks against a deployed Aegis instance.

Arguments:
  URL   Base URL to verify (default: $DEFAULT_URL)

Options:
  -h, --help   Show this help message and exit

Checks:
  1. Liveness         GET /         -> HTTP 200 in <${LIVENESS_TIMEOUT}s
  2. Landing content  GET /         -> body contains "Aegis" or "aegis"
  3. API smoke        POST /api/agent/run -> HTTP 200 or streaming start
  4. Sentry tunnel    GET /monitoring    -> HTTP 200/404/405 (not 502/503)

Exit code: 0 = all pass, 1 = one or more fail.
EOF
}

# Record result, print check line
check_pass() {
  local label="$1" detail="$2"
  green "✓ ${label} (${detail})"
  PASS=$(( PASS + 1 ))
}

check_fail() {
  local label="$1" detail="$2"
  red "✗ ${label} (${detail})"
  FAIL=$(( FAIL + 1 ))
}

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

URL="${1:-$DEFAULT_URL}"
# Strip trailing slash for consistency
URL="${URL%/}"

bold "→ Verifying ${URL}"
echo ""

# ---------------------------------------------------------------------------
# Check 1: Liveness — GET / must return HTTP 200 within LIVENESS_TIMEOUT
# ---------------------------------------------------------------------------
check1_start=$(date +%s%N)
http_code=$(curl -s -o /dev/null \
  --max-time "$LIVENESS_TIMEOUT" \
  -w "%{http_code}" \
  "${URL}/" 2>/dev/null) || http_code="000"
check1_end=$(date +%s%N)
elapsed_ms=$(( (check1_end - check1_start) / 1000000 ))
elapsed_s=$(awk "BEGIN { printf \"%.1f\", ${elapsed_ms}/1000 }")

if [[ "$http_code" == "200" ]]; then
  check_pass "Liveness" "${elapsed_s}s, ${http_code}"
else
  check_fail "Liveness" "${elapsed_s}s, got ${http_code} (expected 200)"
fi

# ---------------------------------------------------------------------------
# Check 2: Landing page content — body must mention Aegis
# ---------------------------------------------------------------------------
body=$(curl -s --max-time "$LIVENESS_TIMEOUT" "${URL}/" 2>/dev/null) || body=""
if echo "$body" | grep -qi "aegis"; then
  check_pass "Landing page" "contains \"Aegis\""
else
  check_fail "Landing page" "body does not contain \"Aegis\" — check / route"
fi

# ---------------------------------------------------------------------------
# Check 3: API smoke — POST /api/agent/run must return 200
# ---------------------------------------------------------------------------
api_code=$(curl -s -o /dev/null \
  --max-time "$LIVENESS_TIMEOUT" \
  -w "%{http_code}" \
  -X POST "${URL}/api/agent/run" \
  -H "content-type: application/json" \
  -d '{"prompt":"hello","provider":"openai"}' 2>/dev/null) || api_code="000"

if [[ "$api_code" == "200" ]]; then
  check_pass "API /agent/run" "${api_code}"
else
  check_fail "API /agent/run" "got ${api_code} (expected 200) — check OPENAI_API_KEY and route handler"
fi

# ---------------------------------------------------------------------------
# Check 4: Sentry tunnel route — GET /monitoring must NOT be 502 or 503
# ---------------------------------------------------------------------------
tunnel_code=$(curl -s -o /dev/null \
  --max-time "$LIVENESS_TIMEOUT" \
  -w "%{http_code}" \
  "${URL}/monitoring" 2>/dev/null) || tunnel_code="000"

if [[ "$tunnel_code" == "502" || "$tunnel_code" == "503" ]]; then
  check_fail "Sentry tunnel /monitoring" "got ${tunnel_code} — Vercel route is broken"
else
  check_pass "Sentry tunnel /monitoring" "${tunnel_code} responsive"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
total=$(( PASS + FAIL ))
echo ""
if [[ $FAIL -eq 0 ]]; then
  green "${PASS}/${total} checks passed."
  exit 0
else
  red "${FAIL}/${total} checks FAILED."
  echo ""
  echo "Suggested next steps:"
  if [[ "$http_code" != "200" ]]; then
    echo "  • Liveness failed — check Vercel deployment status and domain alias."
  fi
  if ! echo "$body" | grep -qi "aegis" 2>/dev/null; then
    echo "  • Landing content missing — the app may be serving an error page."
  fi
  if [[ "$api_code" != "200" ]]; then
    echo "  • API failed — verify OPENAI_API_KEY is set in Vercel env and the /api/agent/run route is deployed."
  fi
  if [[ "$tunnel_code" == "502" || "$tunnel_code" == "503" ]]; then
    echo "  • Sentry tunnel broken — check tunnelRoute: '/monitoring' in next.config.ts and Vercel function logs."
  fi
  echo ""
  echo "  Circuit breaker: set AEGIS_DEMO_MODE=true in Vercel env then redeploy."
  exit 1
fi
