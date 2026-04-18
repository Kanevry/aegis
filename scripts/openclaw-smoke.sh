#!/usr/bin/env bash
set -euo pipefail

OPENCLAW_BASE_URL="${OPENCLAW_BASE_URL:-http://localhost:18789}"
AEGIS_BASE_URL="${AEGIS_BASE_URL:-http://localhost:3000}"
OPENCLAW_GATEWAY_TOKEN="${OPENCLAW_GATEWAY_TOKEN:-}"
AEGIS_SHARED_TOKEN="${AEGIS_SHARED_TOKEN:-}"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

pass() {
  echo "OK: $*"
}

require_token() {
  local name="$1"
  local value="$2"

  if [[ -z "${value}" ]]; then
    fail "missing required environment variable: ${name}"
  fi
}

check_url() {
  local name="$1"
  local url="$2"
  local auth_header="$3"

  if ! curl --silent --show-error --fail ${auth_header:+-H "${auth_header}"} "${url}" >/dev/null; then
    fail "${name} check failed: ${url}"
  fi

  pass "${name}"
}

require_token "OPENCLAW_GATEWAY_TOKEN" "${OPENCLAW_GATEWAY_TOKEN}"
require_token "AEGIS_SHARED_TOKEN" "${AEGIS_SHARED_TOKEN}"

check_url \
  "OpenClaw models endpoint" \
  "${OPENCLAW_BASE_URL}/v1/models" \
  "Authorization: Bearer ${OPENCLAW_GATEWAY_TOKEN}"

check_url \
  "Aegis OpenClaw bridge health" \
  "${AEGIS_BASE_URL}/api/runtime/openclaw/health" \
  "Authorization: Bearer ${AEGIS_SHARED_TOKEN}"

READY_URL="${AEGIS_BASE_URL}/api/ready"
if curl --silent --show-error --fail "${READY_URL}" >/dev/null 2>&1; then
  pass "Optional Aegis ready endpoint"
else
  echo "WARN: optional ready endpoint not available at ${READY_URL}" >&2
fi

echo "Smoke test completed successfully."
