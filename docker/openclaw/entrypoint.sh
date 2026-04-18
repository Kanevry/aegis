#!/usr/bin/env bash
set -euo pipefail

require_env() {
  local key="$1"
  if [ -z "${!key:-}" ]; then
    echo "Missing required environment variable: ${key}" >&2
    exit 1
  fi
}

require_env OPENCLAW_GATEWAY_TOKEN
require_env AEGIS_BASE_URL
require_env AEGIS_SHARED_TOKEN

require_file() {
  local file_path="$1"
  if [ ! -f "${file_path}" ]; then
    echo "Required file is missing: ${file_path}" >&2
    exit 1
  fi
}

require_writable_dir() {
  local dir_path="$1"
  if [ ! -d "${dir_path}" ]; then
    echo "Required writable directory is missing: ${dir_path}" >&2
    exit 1
  fi
  if [ ! -w "${dir_path}" ]; then
    echo "Required writable directory is not writable: ${dir_path}" >&2
    exit 1
  fi
}

seed_openclaw_auth() {
  local seed_dir="${OPENCLAW_AUTH_SEED_DIR:-}"
  local target_dir="${OPENCLAW_AGENT_DIR:-${OPENCLAW_STATE_DIR}/agents/${OPENCLAW_AGENT_ID:-main}/agent}"

  if [ -z "${seed_dir}" ] || [ ! -d "${seed_dir}" ]; then
    return
  fi

  mkdir -p "${target_dir}"

  local name=""
  for name in auth-profiles.json auth.json; do
    local source_path="${seed_dir}/${name}"
    local target_path="${target_dir}/${name}"
    if [ ! -f "${source_path}" ]; then
      continue
    fi

    cp "${source_path}" "${target_path}"
    chmod 0600 "${target_path}"
  done
}

require_file "${OPENCLAW_CONFIG_PATH}"
require_file "${HOME}/.openclaw/exec-approvals.json"
require_writable_dir "${OPENCLAW_STATE_DIR}"
seed_openclaw_auth

echo "Starting OpenClaw gateway with Aegis bridge assumptions:"
echo "  - AEGIS_BASE_URL=${AEGIS_BASE_URL}"
echo "  - OPENCLAW_AEGIS_BRIDGE_ENABLED=${OPENCLAW_AEGIS_BRIDGE_ENABLED:-0}"
echo "  - OPENCLAW_AEGIS_APPROVAL_REQUEST_PATH=${OPENCLAW_AEGIS_APPROVAL_REQUEST_PATH:-/api/runtime/openclaw/approval-requests}"
echo "  - OPENCLAW_CONFIG_PATH=${OPENCLAW_CONFIG_PATH} (read-only)"
echo "  - EXEC_APPROVALS_PATH=${HOME}/.openclaw/exec-approvals.json (read-only)"
echo "  - OPENCLAW_STATE_DIR=${OPENCLAW_STATE_DIR} (writable)"
echo "  - OPENCLAW_AGENT_DIR=${OPENCLAW_AGENT_DIR:-${OPENCLAW_STATE_DIR}/agents/${OPENCLAW_AGENT_ID:-main}/agent} (writable)"
echo "  - OPENCLAW_AUTH_SEED_DIR=${OPENCLAW_AUTH_SEED_DIR:-<disabled>} (read-only seed)"
echo "  - OPENCLAW_MODEL_REF=${OPENCLAW_MODEL_REF}"

if [ "${AEGIS_PREFLIGHT_HEALTHCHECK:-1}" = "1" ]; then
  if ! curl --silent --show-error --fail \
    -H "Authorization: Bearer ${AEGIS_SHARED_TOKEN}" \
    "${AEGIS_BASE_URL}${AEGIS_HEALTH_PATH}" >/dev/null; then
    echo "Warning: Aegis health preflight failed. Continuing because the stack assumes Aegis is still starting or not yet implemented." >&2
  fi
fi

exec openclaw gateway --port "${OPENCLAW_GATEWAY_PORT}" --bind lan
